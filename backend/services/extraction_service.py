import json
import logging
import re
import threading

import httpx

from config import settings

logger = logging.getLogger(__name__)

class AIServiceClient:
    """Singleton HTTP client for AI services."""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(AIServiceClient, cls).__new__(cls)
                cls._instance._client = httpx.AsyncClient(timeout=120.0)
            return cls._instance

    @property
    def client(self) -> httpx.AsyncClient:
        return self._client

EXTRACTION_PROMPT = """You are a medical data extraction engine.
Analyze the provided text from a medical document and extract ALL available information into a structured JSON object.

Do NOT restrict yourself to a specific schema. Capture everything you find, including but not limited to:
- Patient details (Name, Age, Gender, IDs)
- Policy information (Insurer, Policy Number, TPA)
- Hospital details (Name, Address, ROHINI ID)
- Clinical data (Diagnosis, Procedures, Symptoms, Medications)
- Dates (Admission, Discharge, Procedure)
- Financials (Total Bill, Room Rent, Breakdown)

Return ONLY valid JSON. No markdown formatting, no commentary."""


async def extract_fields(raw_text: str) -> dict:
    """
    Send OCR raw text to Kimi K2.5 to extract structured medical fields.
    Returns a dict with 'fields' and 'confidences'.
    """
    if not raw_text or raw_text.startswith("[OCR ERROR"):
        return {"fields": {}, "confidences": {}}

    # Pre-parse fallback in case API calls fail
    def fallback_extract(text: str) -> dict:
        fields = {}
        m_name = re.search(r"(?:Patient Name|Name|Patient):\s*([A-Za-z\s]+)", text, re.IGNORECASE)
        if m_name:
            fields.setdefault("patient", {})["name"] = m_name.group(1).strip()
        m_age = re.search(r"Age:\s*(\d+)", text, re.IGNORECASE)
        if m_age:
            fields.setdefault("patient", {})["age"] = m_age.group(1).strip()
        m_hosp = re.search(r"Hospital(?: Name)?:\s*([A-Za-z\w\s]+)", text, re.IGNORECASE)
        if m_hosp:
            fields.setdefault("hospital", {})["name"] = m_hosp.group(1).strip()
        m_diag = re.search(r"(?:Diagnosis|Condition):\s*([A-Za-z\s,-]+)", text, re.IGNORECASE)
        if m_diag:
            fields.setdefault("clinical", {})["diagnosis"] = m_diag.group(1).strip()
        m_amt = re.search(r"(?:Total|Amount|Bill|Rs\.?|INR)\s*[:\.]?\s*([\d,]+)", text, re.IGNORECASE)
        if m_amt:
            fields.setdefault("financial", {})["bill_amount"] = m_amt.group(1).strip()
        m_date = re.search(r"(?:Date|Admission Date):\s*([\d/:-]+)", text, re.IGNORECASE)
        if m_date:
            fields.setdefault("financial", {})["admission_date"] = m_date.group(1).strip()
        
        if not fields:
            fields["general"] = {"raw_preview": text[:200].strip()}
            
        logger.info(f"Used Regex Fallback Extraction. Extracted {len(fields)} categories.")
        return {"fields": fields, "confidences": {}, "raw": fields}

    payload = {
        "model": settings.KIMI_MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": EXTRACTION_PROMPT,
            },
            {
                "role": "user",
                "content": f"Extract structured data from this medical document text:\n\n{raw_text}",
            },
        ],
        "max_tokens": 4096,
        "temperature": 0.0,
    }

    headers = {
        "Authorization": f"Bearer {settings.KIMI_API_KEY}",
        "Content-Type": "application/json",
    }

    logger.info(f"Starting extraction for text of length {len(raw_text)}")

    # ... (payload setup) ...

    try:
        http_client = AIServiceClient().client
        resp = await http_client.post(
            settings.KIMI_API_URL,
            json=payload,
            headers=headers,
        )
        if resp.status_code != 200:
            logger.error(f"Extraction API Error: {resp.status_code} - {resp.text}")
            logger.warning("Failing over to regex extraction.")
            return fallback_extract(raw_text)
        
        result = resp.json()
        # Handle OpenAI-compat format or HF format
        content = ""
        if "choices" in result:
            content = result["choices"][0]["message"]["content"]
        elif "generated_text" in result:
            content = result["generated_text"]
        elif isinstance(result, list) and "generated_text" in result[0]:
            content = result[0]["generated_text"]
        else:
             content = json.dumps(result)

        logger.info(f"Raw Extraction Content: {content[:200]}...")

        # Parse JSON
        content = content.strip()
        if content.startswith("```"):
            content = content.replace("```json", "").replace("```", "").strip()

        parsed = json.loads(content)
        
        # Since we removed the strict schema, we might receive just the data object
        # without "fields" and "confidences" keys.
        # We normalize it for the frontend/database.
        if "fields" not in parsed:
            return {"fields": parsed, "confidences": {}, "raw": parsed}
        
        # If it has fields/confidences, return as is
        parsed["raw"] = parsed.get("fields", parsed)
        return parsed

    except json.JSONDecodeError as e:
        logger.error(f"Extraction JSON parse error: {e}")
        # Attempt to repair truncated JSON by finding the last complete closing bracket
        if content:
            repaired = _repair_truncated_json(content)
            if repaired:
                logger.info("Recovered partial JSON from truncated response")
                return {"fields": repaired, "confidences": {}, "raw": repaired}
        logger.warning("Failing over to regex extraction after repair failure.")
        return fallback_extract(raw_text)
    except Exception as e:
        logger.error(f"Extraction error: {e}")
        logger.warning("Failing over to regex extraction after exception.")
        return fallback_extract(raw_text)


def _repair_truncated_json(text: str) -> dict | None:
    """
    Best-effort repair of a JSON string that was truncated mid-stream.
    Walks backwards from the end looking for the last valid top-level
    closing brace, then attempts to parse that substring.
    Returns the parsed dict on success, or None on failure.
    """
    # Walk backwards to find the last `}` that closes the root object
    for i in range(len(text) - 1, -1, -1):
        if text[i] == '}':
            candidate = text[:i + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
    return None


def flatten_fields(data: dict) -> list[dict]:
    """
    Convert the nested extraction result into a flat list.
    Handles arbitrary JSON structure by flattening it recursively.
    """
    fields_data = data.get("fields", {})
    confidences = data.get("confidences", {})
    
    # If fields is empty, maybe we have data in 'raw' or top level
    if not fields_data and "raw" in data:
        fields_data = data["raw"]

    result = []

    def recurse(current_data, prefix=""):
        if isinstance(current_data, dict):
            for k, v in current_data.items():
                new_key = f"{prefix}.{k}" if prefix else k
                recurse(v, new_key)
        elif isinstance(current_data, list):
            # For lists, we just join them or store as string representation
            result.append({
                "field_category": prefix.split(".")[0] if "." in prefix else "general",
                "field_name": prefix,
                "field_value": json.dumps(current_data),
                "confidence": confidences.get(prefix)
            })
        else:
             result.append({
                "field_category": prefix.split(".")[0] if "." in prefix else "general",
                "field_name": prefix,
                "field_value": str(current_data),
                "confidence": confidences.get(prefix)
            })

    recurse(fields_data)
    return result
