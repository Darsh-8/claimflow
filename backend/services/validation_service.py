"""
Claim validation service for Claimflow.

Implements:
  1. IRDAI document completeness checks
  2. IRDAI mandatory field completeness checks
  3. Date sequence validation
  4. ICD-10-CM format + NLM existence check
  5. PCS procedure code format check
  6. Confidence scoring with penalties
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from models.models import (
    Claim, Document, ExtractedField, ValidationResult,
    DocumentType, ValidationStatus
)
from services.icd_data import (
    validate_icd10_format,
    validate_pcs_format,
    lookup_icd10_nlm,
    lookup_icd10_comprehend,
    is_plausible_medical_code,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# IRDAI Required & Recommended Configuration
# ---------------------------------------------------------------------------

# Documents required per IRDAI Health Insurance Claim Regulations
REQUIRED_DOCS = {
    DocumentType.DISCHARGE_SUMMARY: "Discharge Summary",
    DocumentType.BILL: "Hospital Bill / Invoice",
}

# Recommended per IRDAI — absence causes a warning, not rejection
RECOMMENDED_DOCS = {
    DocumentType.LAB_REPORT: "Investigation / Lab Report",
    DocumentType.PRESCRIPTION: "Prescription",
    DocumentType.PRE_AUTH: "Pre-Authorization Form",
}

# ---
# IRDAI mandatory fields (absence = ERROR, claim cannot be processed)
# Based on IRDAI Health Insurance Regulations 2016 + Circular IRDAI/HLT/REG/CIR
REQUIRED_FIELDS = {
    # Patient
    ("patient", "name"):            "Patient Name",
    ("patient", "age"):             "Patient Age",
    # Clinical
    ("clinical", "diagnosis"):      "Diagnosis",
    # IRDAI mandates coded diagnosis
    ("clinical", "icd_code"):       "ICD-10 Diagnosis Code",
    # Hospital
    ("hospital", "name"):           "Hospital Name",
    # Financial
    ("financial", "bill_amount"):   "Total Bill Amount",
    ("financial", "admission_date"): "Admission Date",
    ("financial", "discharge_date"): "Discharge Date",
}

# Fields that are strongly recommended but not blocking
RECOMMENDED_FIELDS = {
    ("patient", "gender"):          "Patient Gender",
    ("policy", "policy_number"):    "Policy Number",
    ("hospital", "rohini_id"):      "Hospital ROHINI ID",
    ("clinical", "procedure"):      "Procedure Description",
    ("clinical", "pcs_code"):       "ICD-10-PCS Procedure Code",
}

# IRDAI-mandated field rules for the IRDAI checklist panel
IRDAI_CHECKLIST = [
    "patient.name",
    "patient.age",
    "clinical.diagnosis",
    "clinical.icd_code",
    "hospital.name",
    "financial.bill_amount",
    "financial.admission_date",
    "financial.discharge_date",
]


# ---------------------------------------------------------------------------
# Main validation entry point
# ---------------------------------------------------------------------------

async def validate_claim(db: Session, claim_id: int) -> dict:
    """
    Run comprehensive validation on a claim.
    Returns a validation result dict including IRDAI checklist and code validation.
    """
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        return {
            "status": "ERROR",
            "errors": ["Claim not found"],
            "warnings": [],
            "missing_docs": [],
            "overall_confidence": 0.0,
            "irdai_checklist": {},
            "code_validation": {},
        }

    documents = db.query(Document).filter(Document.claim_id == claim_id).all()
    fields = db.query(ExtractedField).filter(
        ExtractedField.claim_id == claim_id).all()

    errors = []
    warnings = []
    missing_docs = []

    # -----------------------------------------------------------------------
    # Step 1 – Document completeness (IRDAI)
    # -----------------------------------------------------------------------
    doc_types_present = {d.doc_type for d in documents}

    for doc_type, label in REQUIRED_DOCS.items():
        if doc_type not in doc_types_present:
            errors.append(f"Missing required document: {label}")
            missing_docs.append(label)

    for doc_type, label in RECOMMENDED_DOCS.items():
        if doc_type not in doc_types_present:
            warnings.append(f"Recommended document not uploaded: {label}")
            missing_docs.append(label)

    # -----------------------------------------------------------------------
    # Step 2 – Build field lookup map
    # -----------------------------------------------------------------------
    field_map: dict[tuple, ExtractedField] = {}
    for f in fields:
        field_map[(f.field_category, f.field_name)] = f

    def _val(cat: str, name: str) -> str | None:
        """Get a clean field value or None."""
        f = field_map.get((cat, name))
        if f and f.field_value and f.field_value not in ("null", "None", "", "N/A"):
            return f.field_value.strip()
        return None

    # -----------------------------------------------------------------------
    # Step 3 – Required IRDAI field checks
    # -----------------------------------------------------------------------
    irdai_checklist: dict[str, bool] = {}
    for (cat, name), label in REQUIRED_FIELDS.items():
        present = _val(cat, name) is not None
        irdai_checklist[f"{cat}.{name}"] = present
        if not present:
            errors.append(f"[IRDAI] Missing mandatory field: {label}")

    for (cat, name), label in RECOMMENDED_FIELDS.items():
        present = _val(cat, name) is not None
        if not present:
            warnings.append(f"Missing recommended field: {label}")

    # -----------------------------------------------------------------------
    # Step 4 – Date sequence validation
    # -----------------------------------------------------------------------
    adm_val = _val("financial", "admission_date")
    dis_val = _val("financial", "discharge_date")
    if adm_val and dis_val:
        adm_date = _parse_date(adm_val)
        dis_date = _parse_date(dis_val)
        if adm_date and dis_date:
            if adm_date > dis_date:
                errors.append(
                    "[IRDAI] Admission date is after discharge date — invalid stay period")
            else:
                los = (dis_date - adm_date).days
                if los == 0:
                    warnings.append(
                        "Length of stay is 0 days — verify if day-care procedure")
                elif los > 90:
                    warnings.append(
                        f"Unusually long hospitalization: {los} days — requires review")

    # -----------------------------------------------------------------------
    # Step 5 – ICD-10-CM code validation
    # -----------------------------------------------------------------------
    code_validation: dict[str, dict] = {}

    icd_code = _val("clinical", "icd_code")
    if icd_code:
        fmt_ok, fmt_msg = validate_icd10_format(icd_code)
        if not fmt_ok:
            errors.append(
                f"[IRDAI] Invalid ICD-10 code format: {icd_code} — {fmt_msg}")
            code_validation["icd10"] = {
                "code": icd_code, "valid": False, "message": fmt_msg}
        else:
            # Check plausibility
            if not is_plausible_medical_code(icd_code):
                warnings.append(
                    f"ICD-10 code '{icd_code}' prefix is unusual for a hospitalization claim")

            # Async NLM lookup
            nlm_found, nlm_desc = await lookup_icd10_nlm(icd_code)
            if nlm_found:
                code_validation["icd10"] = {
                    "code":    icd_code,
                    "valid":   True,
                    "description": nlm_desc or "Verified in ICD-10 registry",
                    "message": f"Valid ICD-10-CM: {icd_code}" + (f" — {nlm_desc}" if nlm_desc else ""),
                }
            else:
                warnings.append(
                    f"ICD-10 code '{icd_code}' not found in NLM registry — may be incorrect")
                code_validation["icd10"] = {
                    "code": icd_code,
                    "valid": False,
                    "message": f"Code '{icd_code}' not found in ICD-10 registry",
                }
    else:
        code_validation["icd10"] = {
            "code": None, "valid": False, "message": "No ICD-10 code extracted"}

    # -----------------------------------------------------------------------
    # Step 5b – Load Comprehend Medical entities from ExtractedFields
    # -----------------------------------------------------------------------
    import json as _json
    comprehend_entities: list[dict] = []
    comp_fields = [
        f for f in fields
        if f.field_name.startswith("comprehend_icd10_") and f.field_name != "comprehend_icd10_codes"
    ]
    for cf in comp_fields:
        if cf.field_value:
            try:
                comprehend_entities.append(_json.loads(cf.field_value))
            except Exception:
                pass

    # Build comprehend_icd10 block for the code_validation output
    if comprehend_entities:
        # Cross-reference LLM code against Comprehend results
        comp_found, comp_desc, comp_score = False, None, 0.0
        if icd_code:
            comp_found, comp_desc, comp_score = lookup_icd10_comprehend(
                icd_code, comprehend_entities
            )

        code_validation["comprehend_icd10"] = {
            "entities_detected": len(comprehend_entities),
            "top_entities": [
                {
                    "code": e.get("icd10_code"),
                    "description": e.get("description"),
                    "score": e.get("icd10_score"),
                    "text": e.get("text"),
                    "traits": e.get("traits", []),
                }
                for e in comprehend_entities[:5]
            ],
            "llm_code_confirmed": comp_found if icd_code else None,
            "llm_code_comprehend_score": comp_score if icd_code else None,
        }

        # If Comprehend found code but NLM didn't confirm it, upgrade the result
        if icd_code and comp_found and not code_validation.get("icd10", {}).get("valid"):
            warnings.append(
                f"ICD-10 code '{icd_code}' not found in NLM registry but confirmed by "
                f"AWS Comprehend Medical (score: {comp_score:.2f}) — treat as provisional"
            )
            code_validation["icd10"]["comprehend_confirmed"] = True
            code_validation["icd10"]["comprehend_score"] = comp_score
    else:
        code_validation["comprehend_icd10"] = {
            "entities_detected": 0,
            "top_entities": [],
            "message": "Comprehend Medical analysis not yet run or returned no results",
        }

    # -----------------------------------------------------------------------
    # Step 6 – PCS procedure code validation
    # -----------------------------------------------------------------------
    pcs_code = _val("clinical", "pcs_code")
    if pcs_code:
        pcs_ok, pcs_msg = validate_pcs_format(pcs_code)
        code_validation["pcs"] = {"code": pcs_code,
                                  "valid": pcs_ok, "message": pcs_msg}
        if not pcs_ok:
            warnings.append(
                f"[IRDAI] PCS procedure code format invalid: {pcs_msg}")
    else:
        code_validation["pcs"] = {"code": None, "valid": None,
                                  "message": "PCS code not present (required for surgical claims)"}
        warnings.append(
            "No PCS procedure code found — required for surgical / procedural claims")

    # -----------------------------------------------------------------------
    # Step 7 – Confidence scoring
    # -----------------------------------------------------------------------
    confidences = [f.confidence for f in fields if f.confidence is not None]
    avg_confidence = sum(confidences) / \
        len(confidences) if confidences else 0.5

    # Penalties
    avg_confidence *= (0.7 ** len([e for e in errors if "[IRDAI]" in e]))
    if warnings:
        avg_confidence *= max(0.85, 1 - 0.03 * len(warnings))

    avg_confidence = round(min(max(avg_confidence, 0.0), 1.0), 2)

    # -----------------------------------------------------------------------
    # Final status
    # -----------------------------------------------------------------------
    status = ValidationStatus.INCOMPLETE if errors else ValidationStatus.COMPLETE

    return {
        "status":           status.value,
        "errors":           errors,
        "warnings":         warnings,
        "missing_docs":     missing_docs,
        "overall_confidence": avg_confidence,
        "irdai_checklist":  irdai_checklist,
        "code_validation":  code_validation,
    }


def _parse_date(value: str) -> datetime | None:
    """Try common date formats used in Indian medical documents."""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Field flattening (for DB storage) – unchanged interface
# ---------------------------------------------------------------------------

def flatten_fields(data: dict) -> list[dict]:
    """
    Convert nested extraction result into a flat list for DB storage.
    Handles arbitrary JSON from the relaxed Kimi extraction prompt.
    """
    import json

    fields_data = data.get("fields", {})
    confidences = data.get("confidences", {})

    if not fields_data and "raw" in data:
        fields_data = data["raw"]

    result = []

    def recurse(current, prefix=""):
        if isinstance(current, dict):
            for k, v in current.items():
                recurse(v, f"{prefix}.{k}" if prefix else k)
        elif isinstance(current, list):
            result.append({
                "field_category": prefix.split(".")[0] if "." in prefix else "general",
                "field_name":     prefix,
                "field_value":    json.dumps(current),
                "confidence":     confidences.get(prefix),
            })
        else:
            result.append({
                "field_category": prefix.split(".")[0] if "." in prefix else "general",
                "field_name":     prefix,
                "field_value":    str(current) if current is not None else None,
                "confidence":     confidences.get(prefix),
            })

    recurse(fields_data)
    return result
