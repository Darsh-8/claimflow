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
        """
        Comprehensive regex-based extraction fallback.
        Captures patient, hospital, clinical, financial, and policy data.
        """
        fields: dict = {}

        def add(category: str, key: str, value: str | None):
            if value and value.strip():
                fields.setdefault(category, {})[key] = value.strip()

        # ── Patient Information ──
        # Try specific label first
        m = re.search(r"(?:Patient\s*Name|Name\s*of\s*Patient|Patient)\s*[:\-]\s*([A-Za-z.\s]+?)(?:\s+Age|\s*$|\s*,)", text, re.IGNORECASE)
        if not m:
            # Fallback: capture any capitalized name sequence right before "Age:"
            # Handles garbled OCR labels like "DMme:", "Nme:", etc.
            m = re.search(r"(?:^|[:\-]\s*|me:\s*)([A-Z][A-Za-z.\s]{3,50}?)\s+Age\s*[:\-]", text, re.MULTILINE)
        add("patient", "name", m.group(1) if m else None)

        m = re.search(r"Age\s*[:\-]\s*(\d+)\s*(?:years?|yrs?|Y)?", text, re.IGNORECASE)
        add("patient", "age", m.group(1) if m else None)

        m = re.search(r"(?:Sex|Gender)\s*[:\-]\s*(Male|Female|M|F|Other|Transgender)", text, re.IGNORECASE)
        add("patient", "gender", m.group(1) if m else None)

        m = re.search(r"(?:Weight|Wt|WT)\s*[:\-]\s*([\d.]+\s*(?:kg|lbs?)?)", text, re.IGNORECASE)
        add("patient", "weight", m.group(1) if m else None)

        m = re.search(r"(?:Height|Ht|HT)\s*[:\-]\s*([\d.]+\s*(?:cm|ft|m|inches?)?)", text, re.IGNORECASE)
        add("patient", "height", m.group(1) if m else None)

        m = re.search(r"(?:Blood\s*Group|Blood\s*Type)\s*[:\-]\s*([ABO]{1,2}[+-]?)", text, re.IGNORECASE)
        add("patient", "blood_group", m.group(1) if m else None)

        m = re.search(r"(?:Phone|Mobile|Contact|Tel)\s*[:\-]\s*([\d\s+()-]{7,15})", text, re.IGNORECASE)
        add("patient", "phone", m.group(1) if m else None)

        m = re.search(r"(?:Patient\s*ID|MRN|MR\s*No|Reg\.?\s*No|UHID)\s*[:\-]\s*([\w\d/-]+)", text, re.IGNORECASE)
        add("patient", "patient_id", m.group(1) if m else None)

        m = re.search(r"(?:Father|Father'?s?\s*Name|S/O|D/O|W/O|C/O)\s*[:\-]\s*([A-Za-z.\s]+?)(?:\s*$|\s*,|\n)", text, re.IGNORECASE)
        add("patient", "guardian_name", m.group(1) if m else None)

        m = re.search(r"(?:Address|Addr|Residence)\s*[:\-]\s*(.+?)(?:\n|\r|$)", text, re.IGNORECASE)
        add("patient", "address", m.group(1)[:200] if m else None)

        # ── Hospital Information ──
        # Try to capture hospital name from header lines (often the first non-empty line)
        m = re.search(r"(?:Hospital(?:\s*Name)?|Nursing\s*Home|Medical\s*Centre|Medical\s*Center|Clinic)\s*[:\-]\s*([A-Za-z\w\s.&]+)", text, re.IGNORECASE)
        if m:
            add("hospital", "name", m.group(1))
        else:
            # Often the hospital name is the first prominent line
            first_lines = [l.strip() for l in text.split("\n")[:3] if l.strip() and len(l.strip()) > 5]
            for line in first_lines:
                if any(kw in line.upper() for kw in ["HOSPITAL", "CLINIC", "MEDICAL", "NURSING", "HEALTH"]):
                    add("hospital", "name", line[:100])
                    break

        m = re.search(r"(?:ROHINI|NABH|Registration)\s*(?:ID|No\.?|Number)\s*[:\-]\s*([\w\d/-]+)", text, re.IGNORECASE)
        add("hospital", "registration_id", m.group(1) if m else None)

        m = re.search(r"(?:Bed\s*No|Bed|Ward|Room)\s*[:\-]\s*([\w\d\s/-]+?)(?:\s*$|\s*,|\n)", text, re.IGNORECASE)
        add("hospital", "bed_ward", m.group(1) if m else None)

        # ── Doctor / Consultant ──
        m = re.search(r"(?:Dr\.?\s*|Doctor\s*[:\-]\s*|Consultant\s*[:\-]\s*|Treated\s*by\s*[:\-]?\s*|Attending\s*Physician\s*[:\-]\s*)([A-Za-z.\s]+?)(?:\s*$|\s*,|\n|(?=\s*(?:MBBS|MD|MS|FRCS|MCh|DNB)))", text, re.IGNORECASE)
        add("hospital", "treating_doctor", m.group(1) if m else None)

        m = re.search(r"(?:Speciality|Specialty|Department|Dept)\s*[:\-]\s*([A-Za-z\s/&]+?)(?:\s*$|\s*,|\n)", text, re.IGNORECASE)
        add("hospital", "department", m.group(1) if m else None)

        # ── Clinical Data ──
        m = re.search(r"(?:Diagnosis|Primary\s*Diagnosis|Final\s*Diagnosis|Condition|Disease)\s*[:\-]\s*(.+?)(?:\n|\r|$)", text, re.IGNORECASE)
        add("clinical", "diagnosis", m.group(1)[:300] if m else None)

        m = re.search(r"(?:ICD|ICD[\s-]*10|ICD[\s-]*Code)\s*[:\-]\s*([A-Z]\d{2,3}(?:\.\d{1,2})?(?:\s*,\s*[A-Z]\d{2,3}(?:\.\d{1,2})?)*)", text, re.IGNORECASE)
        add("clinical", "icd_codes", m.group(1) if m else None)

        m = re.search(r"(?:Procedure|Surgery|Operation|Treatment)\s*[:\-]\s*(.+?)(?:\n|\r|$)", text, re.IGNORECASE)
        add("clinical", "procedure", m.group(1)[:300] if m else None)

        m = re.search(r"(?:Symptoms?|Chief\s*Complaint|Presenting\s*Complaint|C/O)\s*[:\-]\s*(.+?)(?:\n|\r|$)", text, re.IGNORECASE)
        add("clinical", "symptoms", m.group(1)[:300] if m else None)

        m = re.search(r"(?:Medications?|Medicine|Drugs?|Rx)\s*[:\-]\s*(.+?)(?:\n|\r|$)", text, re.IGNORECASE)
        add("clinical", "medications", m.group(1)[:300] if m else None)

        m = re.search(r"(?:BP|Blood\s*Pressure)\s*[:\-]\s*(\d{2,3}\s*/\s*\d{2,3})", text, re.IGNORECASE)
        add("clinical", "blood_pressure", m.group(1) if m else None)

        m = re.search(r"(?:Pulse|Heart\s*Rate|HR)\s*[:\-]\s*(\d{2,3})\s*(?:bpm|/min)?", text, re.IGNORECASE)
        add("clinical", "pulse", m.group(1) if m else None)

        m = re.search(r"(?:Temp|Temperature)\s*[:\-]\s*([\d.]+)\s*(?:°?[FC])?", text, re.IGNORECASE)
        add("clinical", "temperature", m.group(1) if m else None)

        m = re.search(r"(?:SpO2|Oxygen\s*Saturation|O2\s*Sat)\s*[:\-]\s*(\d{2,3})\s*%?", text, re.IGNORECASE)
        add("clinical", "spo2", m.group(1) if m else None)

        m = re.search(r"(?:Allergy|Allergies|Known\s*Allergies)\s*[:\-]\s*(.+?)(?:\n|\r|$)", text, re.IGNORECASE)
        add("clinical", "allergies", m.group(1)[:200] if m else None)

        # ── Financial Data ──
        m = re.search(r"(?:Admission\s*Date|Date\s*of\s*Admission|DOA|Admitted\s*On)\s*[:\-]\s*([\d/.\-]+)", text, re.IGNORECASE)
        add("financial", "admission_date", m.group(1) if m else None)

        m = re.search(r"(?:Discharge\s*Date|Date\s*of\s*Discharge|DOD|Discharged\s*On)\s*[:\-]\s*([\d/.\-]+)", text, re.IGNORECASE)
        add("financial", "discharge_date", m.group(1) if m else None)

        m = re.search(r"(?:Total\s*(?:Bill|Amount|Charges?)|Grand\s*Total|Net\s*Amount|Bill\s*Amount)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "total_bill_amount", m.group(1) if m else None)

        m = re.search(r"(?:Room\s*(?:Rent|Charges?)|Bed\s*Charges?)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "room_charges", m.group(1) if m else None)

        m = re.search(r"(?:Medicine\s*Charges?|Pharmacy|Drug\s*Charges?)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "medicine_charges", m.group(1) if m else None)

        m = re.search(r"(?:Investigation|Lab\s*Charges?|Diagnostic|Test\s*Charges?)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "investigation_charges", m.group(1) if m else None)

        m = re.search(r"(?:Consultation|Doctor'?s?\s*(?:Fee|Charges?)|Professional\s*Fees?)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "consultation_charges", m.group(1) if m else None)

        m = re.search(r"(?:OT\s*Charges?|Operation\s*Theatre|Surgical?\s*Charges?)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "ot_charges", m.group(1) if m else None)

        m = re.search(r"(?:Discount|Concession)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "discount", m.group(1) if m else None)

        m = re.search(r"(?:Paid|Amount\s*Paid|Advance|Deposit)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "amount_paid", m.group(1) if m else None)

        m = re.search(r"(?:Balance|Due|Payable|Outstanding)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        add("financial", "balance_due", m.group(1) if m else None)

        # Generic date fallback if no admission date was found
        if "financial" not in fields or "admission_date" not in fields.get("financial", {}):
            m = re.search(r"(?:Date)\s*[:\-]\s*([\d/.\-]+)", text, re.IGNORECASE)
            add("financial", "admission_date", m.group(1) if m else None)

        # ── Policy / Insurance ──
        m = re.search(r"(?:Policy\s*(?:No\.?|Number)|Policy#)\s*[:\-]\s*([\w\d/-]+)", text, re.IGNORECASE)
        add("policy", "policy_number", m.group(1) if m else None)

        m = re.search(r"(?:Insurer|Insurance\s*Company?|Insurance\s*Provider)\s*[:\-]\s*([A-Za-z\s&.]+?)(?:\s*$|\s*,|\n)", text, re.IGNORECASE)
        add("policy", "insurer_name", m.group(1) if m else None)

        m = re.search(r"(?:TPA|Third\s*Party)\s*[:\-]\s*([A-Za-z\s&.]+?)(?:\s*$|\s*,|\n)", text, re.IGNORECASE)
        add("policy", "tpa_name", m.group(1) if m else None)

        m = re.search(r"(?:Claim\s*(?:No\.?|Number|ID)|Claim#)\s*[:\-]\s*([\w\d/-]+)", text, re.IGNORECASE)
        add("policy", "claim_number", m.group(1) if m else None)

        m = re.search(r"(?:Member\s*ID|Membership\s*No|Card\s*No)\s*[:\-]\s*([\w\d/-]+)", text, re.IGNORECASE)
        add("policy", "member_id", m.group(1) if m else None)

        if not fields:
            fields["general"] = {"raw_preview": text[:500].strip()}

        total_fields = sum(len(v) for v in fields.values())
        logger.info(f"Regex fallback extracted {total_fields} fields across {len(fields)} categories.")
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
