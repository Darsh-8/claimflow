"""
ICD-10 / PCS code validation helpers for Claimflow.

Provides two levels of validation:
  1. Format check  – fast regex, no network call.
  2. Existence check – async lookup against NIH NLM Clinical Tables API (optional).
"""

import re
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# ICD-10-CM (diagnosis): Letter + 2 digits, optional dot + 1-4 chars
# Examples: J18.0  K21.9  Z87.891  S52.001A
ICD10_CM_RE = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$", re.IGNORECASE)

# ICD-10-PCS (procedure): Exactly 7 alphanumeric characters
# Examples: 0BH17EZ  0SRB019
ICD10_PCS_RE = re.compile(r"^[0-9A-HJ-NP-Z]{7}$", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Level 1 – Format validation (synchronous)
# ---------------------------------------------------------------------------


def validate_icd10_format(code: str) -> tuple[bool, str]:
    """
    Validate that `code` looks like a valid ICD-10-CM code by format only.
    Returns (is_valid, message).
    """
    if not code or code.strip() in ("", "null", "None"):
        return False, "ICD-10 code is empty"
    code = code.strip().upper()
    if ICD10_CM_RE.match(code):
        return True, f"ICD-10-CM format valid: {code}"
    return False, f"ICD-10-CM format invalid: '{code}' (expected e.g. J18.0)"


def validate_pcs_format(code: str) -> tuple[bool, str]:
    """
    Validate PCS procedure code format.
    Returns (is_valid, message).
    """
    if not code or code.strip() in ("", "null", "None"):
        return False, "PCS code is empty"
    code = code.strip().upper()
    if ICD10_PCS_RE.match(code):
        return True, f"PCS format valid: {code}"
    return False, f"PCS format invalid: '{code}' (must be 7 alphanumeric characters)"


# ---------------------------------------------------------------------------
# Level 2 – Existence check via NIH NLM API (async)
# ---------------------------------------------------------------------------

NLM_ICD10_API = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"


async def lookup_icd10_nlm(code: str) -> tuple[bool, Optional[str]]:
    """
    Look up an ICD-10-CM code against the NIH NLM Clinical Tables API.
    Returns (found, description_or_None).
    Silently returns (True, None) on network error to avoid blocking the pipeline.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(NLM_ICD10_API, params={"terms": code, "maxList": 5, "sf": "code"})
            if resp.status_code != 200:
                logger.warning(
                    f"NLM lookup failed {resp.status_code} for code '{code}'")
                return True, None  # Don't block on API failure

            data = resp.json()
            # Response format: [total, codes, extra, descriptions]
            # data[1] is the list of matching codes
            if data and data[0] > 0 and data[1]:
                # Check if our exact code is in the results (case-insensitive)
                codes_found = [c.upper() for c in data[1]]
                if code.upper() in codes_found:
                    # Get corresponding description
                    idx = codes_found.index(code.upper())
                    desc = data[3][idx] if data[3] and idx < len(
                        data[3]) else None
                    return True, desc
                else:
                    return False, None
            return False, None

    except Exception as e:
        logger.warning(f"NLM ICD-10 lookup error for '{code}': {e}")
        return True, None  # Fail open — don't block pipeline on network issues


# ---------------------------------------------------------------------------
# IRDAI standard codes (common ICD-10 categories seen in Indian health claims)
# ---------------------------------------------------------------------------

# Known common categories for reference (not exhaustive)
COMMON_MEDICAL_ICD10_PREFIXES = [
    "J",  # Respiratory
    "K",  # Digestive
    "I",  # Circulatory
    "N",  # Genitourinary
    "M",  # Musculoskeletal
    "C",  # Neoplasms
    "S",  # Injuries
    "Z",  # Factors influencing health
    "G",  # Nervous system
    "A", "B",  # Infectious diseases
]


def is_plausible_medical_code(code: str) -> bool:
    """
    Quick plausibility check: is the ICD-10 code prefix in a known medical category?
    """
    if not code:
        return False
    return code[0].upper() in COMMON_MEDICAL_ICD10_PREFIXES
