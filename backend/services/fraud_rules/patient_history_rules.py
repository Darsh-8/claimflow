"""
Patient History Rules — Fraud detection based on patient claim patterns.
Uses PatientProfile and cross-claim analysis to detect serial claimant behaviour.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

# Configurable thresholds
CUMULATIVE_AMOUNT_THRESHOLD = 1000000  # ₹10 Lakhs in 12 months
CLAIM_FREQUENCY_THRESHOLD = 4  # > 4 claims in 6 months
HOSPITAL_HOPPING_THRESHOLD = 3  # > 3 distinct hospitals in 90 days


def rule_patient_cumulative_amount_spike(claim_context: dict) -> Optional[RuleResult]:
    """
    PAT_H01 — Patient Cumulative Amount Spike
    If: Patient's total claims in last 12 months exceed ₹10L.
    """
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")

    if not db or not claim_val or not claim_val.patient_name:
        return None

    from models.models import Claim, ExtractedField

    twelve_months_ago = datetime.utcnow() - timedelta(days=365)

    patient_claims = db.query(Claim).filter(
        Claim.patient_name == claim_val.patient_name,
        Claim.created_at >= twelve_months_ago,
    ).all()

    total_amount = 0.0
    for c in patient_claims:
        b_field = db.query(ExtractedField).filter(
            ExtractedField.claim_id == c.id,
            ExtractedField.field_name.in_(
                ["bill_amount", "total_bill_amount"]),
        ).first()
        if b_field and b_field.field_value:
            try:
                amt = float(
                    b_field.field_value.replace(",", "")
                    .replace("₹", "")
                    .replace("Rs", "")
                    .strip()
                )
                total_amount += amt
            except Exception:
                pass

    if total_amount > CUMULATIVE_AMOUNT_THRESHOLD:
        return RuleResult(
            rule_id="PAT_H01",
            severity="HIGH",
            score=25,
            reason=(
                f"Cumulative amount spike: Patient '{claim_val.patient_name}' has claimed "
                f"₹{total_amount:,.0f} in the last 12 months (threshold: ₹{CUMULATIVE_AMOUNT_THRESHOLD:,})."
            ),
        )

    return None


def rule_patient_claim_frequency(claim_context: dict) -> Optional[RuleResult]:
    """
    PAT_H02 — Patient Claim Frequency
    If: Patient filed > 4 claims in 6 months.
    """
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")

    if not db or not claim_val or not claim_val.patient_name:
        return None

    from models.models import Claim

    six_months_ago = datetime.utcnow() - timedelta(days=180)

    count = db.query(Claim).filter(
        Claim.patient_name == claim_val.patient_name,
        Claim.created_at >= six_months_ago,
    ).count()

    if count > CLAIM_FREQUENCY_THRESHOLD:
        return RuleResult(
            rule_id="PAT_H02",
            severity="HIGH",
            score=30,
            reason=(
                f"High claim frequency: Patient '{claim_val.patient_name}' has "
                f"{count} claims in the last 6 months (threshold: {CLAIM_FREQUENCY_THRESHOLD})."
            ),
        )

    return None


def rule_patient_hospital_hopping(claim_context: dict) -> Optional[RuleResult]:
    """
    PAT_H03 — Patient Hospital Hopping
    If: Patient visited > 3 different hospitals in 90 days.
    """
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")

    if not db or not claim_val or not claim_val.patient_name:
        return None

    from models.models import Claim, ExtractedField

    ninety_days_ago = datetime.utcnow() - timedelta(days=90)

    patient_claims = db.query(Claim).filter(
        Claim.patient_name == claim_val.patient_name,
        Claim.created_at >= ninety_days_ago,
    ).all()

    hospitals = set()
    for c in patient_claims:
        h_field = db.query(ExtractedField).filter(
            ExtractedField.claim_id == c.id,
            ExtractedField.field_name == "name",
            ExtractedField.field_category == "hospital",
        ).first()
        if h_field and h_field.field_value:
            hospitals.add(h_field.field_value.strip().lower())

    if len(hospitals) > HOSPITAL_HOPPING_THRESHOLD:
        return RuleResult(
            rule_id="PAT_H03",
            severity="HIGH",
            score=25,
            reason=(
                f"Hospital hopping: Patient '{claim_val.patient_name}' visited "
                f"{len(hospitals)} distinct hospitals in 90 days: {', '.join(list(hospitals)[:5])}."
            ),
        )

    return None


def rule_repeat_diagnosis_abuse(claim_context: dict) -> Optional[RuleResult]:
    """
    PAT_H04 — Repeat Diagnosis Abuse
    If: Same patient, same diagnosis filed > 2 times in 6 months.
    """
    fields = claim_context.get("fields", {})
    diagnosis = fields.get(("clinical", "diagnosis"))
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")

    if not diagnosis or not db or not claim_val or not claim_val.patient_name:
        return None

    from models.models import Claim, ExtractedField

    six_months_ago = datetime.utcnow() - timedelta(days=180)
    diagnosis_lower = diagnosis.strip().lower()

    patient_claims = db.query(Claim).filter(
        Claim.patient_name == claim_val.patient_name,
        Claim.created_at >= six_months_ago,
        Claim.id != claim_val.id,
    ).all()

    same_diag_count = 0
    for c in patient_claims:
        d_field = db.query(ExtractedField).filter(
            ExtractedField.claim_id == c.id,
            ExtractedField.field_name == "diagnosis",
            ExtractedField.field_category == "clinical",
        ).first()
        if d_field and d_field.field_value and d_field.field_value.strip().lower() == diagnosis_lower:
            same_diag_count += 1

    if same_diag_count >= 2:
        return RuleResult(
            rule_id="PAT_H04",
            severity="MEDIUM",
            score=20,
            reason=(
                f"Repeat diagnosis: Patient '{claim_val.patient_name}' filed "
                f"{same_diag_count} other claims with diagnosis '{diagnosis}' in 6 months."
            ),
        )

    return None


def rule_age_procedure_mismatch(claim_context: dict) -> Optional[RuleResult]:
    """
    PAT_H05 — Age–Procedure Mismatch
    If: Pediatric procedure billed for adult (age > 18) or
        geriatric procedure for young patient (age < 30).
    """
    fields = claim_context.get("fields", {})
    age_str = fields.get(("patient", "age"))
    procedure = fields.get(("clinical", "procedure"), "").lower()
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()

    if not age_str or (not procedure and not diagnosis):
        return None

    try:
        age = int(age_str.strip().split()[0])
    except (ValueError, IndexError):
        return None

    # Pediatric keywords
    pediatric_keywords = [
        "neonatal", "pediatric", "nicu", "circumcision",
        "tonsillectomy", "pyloric stenosis", "cleft repair",
    ]

    # Geriatric keywords
    geriatric_keywords = [
        "knee replacement", "hip replacement", "cataract",
        "prostatectomy", "pacemaker", "cabg",
    ]

    combined = f"{procedure} {diagnosis}"

    # Adult getting pediatric procedure
    if age > 18 and any(k in combined for k in pediatric_keywords):
        return RuleResult(
            rule_id="PAT_H05",
            severity="HIGH",
            score=25,
            reason=(
                f"Age-procedure mismatch: Patient age {age} but pediatric "
                f"procedure/diagnosis detected: '{combined[:80]}'."
            ),
        )

    # Young patient getting geriatric procedure
    if age < 30 and any(k in combined for k in geriatric_keywords):
        return RuleResult(
            rule_id="PAT_H05",
            severity="HIGH",
            score=25,
            reason=(
                f"Age-procedure mismatch: Patient age {age} but geriatric "
                f"procedure/diagnosis detected: '{combined[:80]}'."
            ),
        )

    return None

import json

def rule_hms_demographic_mismatch(claim_context: dict) -> Optional[RuleResult]:
    """
    PAT_H06 — HMS Demographic Mismatch
    If: The OCR extracted patient name, age, or gender from the uploaded
    documents differs from the ground truth HMS record for this patient.
    """
    fields = claim_context.get("fields", {})
    mismatch_json = fields.get(("fraud", "hms_demographic_mismatch"))
    
    if not mismatch_json:
        return None

    try:
        mismatches = json.loads(mismatch_json)
        if not mismatches:
            return None
            
        mismatch_desc = ", ".join(
            f"{m['field'].split('.')[-1]} (Doc: '{m['document']}' vs HMS: '{m['hms']}')" 
            for m in mismatches[:3]
        )
        
        return RuleResult(
            rule_id="PAT_H06",
            severity="HIGH",
            score=35,
            reason=f"Identity mismatch: The uploaded documents have conflicting data versus the HMS record for {len(mismatches)} demographic fields. Details: {mismatch_desc}."
        )
    except Exception:
        return None
