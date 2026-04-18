"""
AWS Comprehend Medical — ICD-10-CM inference service for Claimflow.

Uses boto3 ComprehendMedical client's `infer_icd10_cm()` API to detect
medical conditions and their ICD-10-CM codes directly from raw OCR text.

Architecture note:
  boto3 is synchronous; we run it in a thread-pool executor so the
  async pipeline is not blocked.
"""

import asyncio
import logging
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config.config import settings

logger = logging.getLogger(__name__)

# AWS Comprehend Medical accepts at most 20,000 UTF-8 bytes per request.
_MAX_BYTES = 20_000


def _truncate_for_comprehend(text: str) -> str:
    """Truncate text to the Comprehend Medical 20 KB byte limit."""
    encoded = text.encode("utf-8")
    if len(encoded) <= _MAX_BYTES:
        return text
    truncated_bytes: bytes = bytes(encoded[:_MAX_BYTES])
    return truncated_bytes.decode("utf-8", errors="ignore")


def _build_client():
    """Create a boto3 ComprehendMedical client using configured credentials."""
    return boto3.client(
        "comprehendmedical",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


def _infer_icd10_cm_sync(text: str) -> list[dict]:
    """
    Synchronous call to AWS Comprehend Medical InferICD10CM.

    Returns a list of entity dicts:
      {
        "icd10_code": str,
        "description": str,
        "score": float,          # entity-level confidence
        "icd10_score": float,    # ICD-10 concept-level confidence
        "begin_offset": int,
        "end_offset": int,
        "text": str,             # the matched text span
        "traits": list[str],     # e.g. ["NEGATION", "HYPOTHETICAL"]
        "attributes": list[dict] # related signs/symptoms if any
      }
    """
    if not text or not text.strip():
        return []

    truncated = _truncate_for_comprehend(text)

    try:
        client = _build_client()
        response = client.infer_icd10_cm(Text=truncated)
    except (BotoCoreError, ClientError) as exc:
        logger.warning(f"Comprehend Medical API error: {exc}")
        return []
    except Exception as exc:
        logger.warning(f"Comprehend Medical unexpected error: {exc}")
        return []

    entities = response.get("Entities", [])
    results: list[dict] = []

    for entity in entities:
        entity_text = entity.get("Text", "")
        entity_score = entity.get("Score", 0.0)
        begin = entity.get("BeginOffset", 0)
        end = entity.get("EndOffset", 0)

        # Traits (NEGATION, HYPOTHETICAL, etc.)
        traits = [t["Name"] for t in entity.get("Traits", []) if "Name" in t]

        # Attributes — related clinical data (e.g. direction, acuity)
        attributes = [
            {"type": a.get("Type"), "text": a.get("Text"), "score": a.get("Score")}
            for a in entity.get("Attributes", [])
        ]

        # Each entity may map to multiple ICD-10 concepts (differential diagnoses)
        icd10_concepts = entity.get("ICD10CMConcepts", [])
        if not icd10_concepts:
            # Entity recognised but no ICD-10 code mapped — skip
            continue

        # Take the top concept (highest scoring)
        top_concept = icd10_concepts[0]
        icd10_code = top_concept.get("Code", "")
        icd10_desc = top_concept.get("Description", "")
        icd10_score = top_concept.get("Score", 0.0)

        if not icd10_code:
            continue

        results.append({
            "icd10_code": icd10_code,
            "description": icd10_desc,
            "score": round(entity_score, 4),
            "icd10_score": round(icd10_score, 4),
            "begin_offset": begin,
            "end_offset": end,
            "text": entity_text,
            "traits": traits,
            "attributes": attributes,
            # Include alternative concepts for richer data
            "alternatives": [
                {"code": c.get("Code"), "description": c.get("Description"), "score": round(c.get("Score", 0.0), 4)}
                for c in icd10_concepts[1:4]  # up to 3 alternatives
            ],
        })

    # Sort by descending entity confidence score
    results.sort(key=lambda x: x["score"], reverse=True)
    logger.info(
        f"Comprehend Medical detected {len(results)} ICD-10 entities from "
        f"{len(truncated)} chars of text."
    )
    return results


async def run_comprehend_medical(text: str) -> list[dict]:
    """
    Async entry point — runs the boto3 call in a thread pool.
    Returns a list of ICD-10 entity dicts (empty list on any failure).
    """
    if not text or not text.strip():
        logger.info("Comprehend Medical skipped — empty text.")
        return []

    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(None, _infer_icd10_cm_sync, text)
        return results
    except Exception as exc:
        logger.warning(f"Comprehend Medical executor error: {exc}")
        return []


def get_top_icd10_codes(entities: list[dict], max_codes: int = 5) -> list[str]:
    """
    Extract the top ICD-10 codes (excluding negated/hypothetical ones)
    from a Comprehend Medical entity list.
    """
    codes = []
    for entity in entities:
        # Skip negated or hypothetical diagnoses
        if "NEGATION" in entity.get("traits", []):
            continue
        if "HYPOTHETICAL" in entity.get("traits", []):
            continue
        code = entity.get("icd10_code")
        if code and code not in codes:
            codes.append(code)
        if len(codes) >= max_codes:
            break
    return codes


def get_top_icd10_for_text(text: str) -> Optional[str]:
    """
    Run Comprehend Medical synchronously on a short text string (e.g. a manually
    entered diagnosis) and return the single highest-scoring ICD-10 code.
    Returns None if Comprehend is unavailable or no codes are detected.
    Gracefully swallows all errors so it never breaks the claim flow.
    """
    if not text or not text.strip():
        return None
    try:
        entities = _infer_icd10_cm_sync(text)
        codes = get_top_icd10_codes(entities, max_codes=1)
        return codes[0] if codes else None
    except Exception as exc:
        logger.warning(f"get_top_icd10_for_text failed: {exc}")
        return None


def get_suggestions_for_text(text: str, max_codes: int = 5) -> list[dict]:
    """
    Return a list of ICD-10 suggestion dicts for a freeform text string.
    Each dict has: { code, description, score }.
    Used by the /claims/suggest-icd10 endpoint for live frontend chips.
    Returns empty list on any failure.
    """
    if not text or not text.strip():
        return []
    try:
        entities = _infer_icd10_cm_sync(text)
        seen = set()
        results = []
        for entity in entities:
            if "NEGATION" in entity.get("traits", []):
                continue
            code = entity.get("icd10_code")
            if code and code not in seen:
                seen.add(code)
                results.append({
                    "code": code,
                    "description": entity.get("description") or entity.get("text", ""),
                    "score": entity.get("icd10_score", 0.0),
                })
            if len(results) >= max_codes:
                break
        return results
    except Exception as exc:
        logger.warning(f"get_suggestions_for_text failed: {exc}")
        return []

