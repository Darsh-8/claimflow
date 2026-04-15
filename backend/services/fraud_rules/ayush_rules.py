"""
AYUSH Fraud Detection Rules — Based on Ministry of AYUSH guidelines and
IRDAI's AYUSH coverage framework.

AYUSH = Ayurveda, Yoga & Naturopathy, Unani, Siddha, Homeopathy

References:
- Ministry of AYUSH: https://ayush.gov.in/
- IRDAI AYUSH coverage norms under Health Insurance Regulations
- NABH / QCI accreditation standards for AYUSH hospitals
"""

import logging
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

# AYUSH treatment keywords
AYUSH_TREATMENTS = [
    "ayurveda", "ayurvedic", "panchakarma", "shirodhara", "abhyanga",
    "vamana", "virechana", "basti", "nasya", "raktamokshana",
    "yoga therapy", "naturopathy", "nature cure",
    "unani", "hijama", "ilaj-bil-dawa",
    "siddha", "varma", "thokkanam",
    "homeopathy", "homoeopathy", "homeopathic",
]

# Allopathic (modern medicine) markers that shouldn't appear in AYUSH claims
ALLOPATHIC_MARKERS = [
    "surgery", "laparoscop", "angioplast", "stent", "bypass",
    "chemotherapy", "radiotherapy", "ventilator", "icu",
    "dialysis", "mri", "ct scan", "ultrasound",
    "injection", "iv fluid", "blood transfusion",
    "opioid", "morphine", "fentanyl",
]

# Allopathic drug prefixes/patterns
ALLOPATHIC_DRUG_MARKERS = [
    "amoxicillin", "ciprofloxacin", "metformin", "atorvastatin",
    "paracetamol", "ibuprofen", "diclofenac", "metoprolol",
    "insulin", "steroids", "prednisolone", "dexamethasone",
]

# Valid AYUSH qualifications
AYUSH_QUALIFICATIONS = [
    "bams",   # Bachelor of Ayurvedic Medicine and Surgery
    "bhms",   # Bachelor of Homeopathic Medicine and Surgery
    "bums",   # Bachelor of Unani Medicine and Surgery
    "bnys",   # Bachelor of Naturopathy & Yogic Sciences
    "bsms",   # Bachelor of Siddha Medicine and Surgery
    "md(ayu", "md (ayu",  # Post-grad Ayurveda
    "md(hom", "md (hom",  # Post-grad Homeopathy
]

# Max reasonable inpatient days for AYUSH treatments
AYUSH_MAX_INPATIENT_DAYS = 21

# Typical AYUSH bill threshold (claims above this warrant scrutiny)
AYUSH_BILL_THRESHOLD = 50000  # ₹50,000


def _is_ayush_claim(fields: dict) -> bool:
    """Check if the claim involves AYUSH treatment."""
    procedure = fields.get(("clinical", "procedure"), "").lower()
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    hospital = fields.get(("hospital", "name"), "").lower()
    department = fields.get(("hospital", "department"), "").lower()

    combined = f"{procedure} {diagnosis} {hospital} {department}"
    return any(a in combined for a in AYUSH_TREATMENTS)


def rule_ayush_hospital_not_registered(claim_context: dict) -> Optional[RuleResult]:
    """
    AYUSH_001 — AYUSH Hospital Not Registered
    If: Claim lists AYUSH treatment but hospital is not in NABH/QCI
    accredited AYUSH hospital registry.
    MVP: Flags if hospital name doesn't contain AYUSH markers AND
    uses AYUSH procedures.
    """
    fields = claim_context.get("fields", {})
    db = claim_context.get("db")

    if not _is_ayush_claim(fields):
        return None

    hospital = fields.get(("hospital", "name"), "").lower()

    # Check if HospitalProfile has AYUSH registration
    if db:
        from models.models import HospitalProfile
        profile = db.query(HospitalProfile).filter(
            HospitalProfile.hospital_name == fields.get(
                ("hospital", "name"), "")
        ).first()

        if profile and getattr(profile, "is_ayush_registered", 0) == 1:
            return None

    # MVP heuristic: AYUSH hospitals typically have markers in name
    ayush_hospital_markers = [
        "ayurveda", "ayurvedic", "homeopath", "unani", "siddha",
        "yoga", "naturopathy", "nature cure", "panchakarma",
        "vaidya", "ayush", "herbal",
    ]

    is_known_ayush = any(m in hospital for m in ayush_hospital_markers)

    if not is_known_ayush:
        return RuleResult(
            rule_id="AYUSH_001",
            severity="HIGH",
            score=30,
            reason=(
                f"AYUSH registration concern: Hospital '{hospital}' claims AYUSH treatment "
                f"but is not identifiable as a registered AYUSH facility (NABH/QCI accreditation required)."
            ),
        )

    return None


def rule_ayush_allopathic_crossover(claim_context: dict) -> Optional[RuleResult]:
    """
    AYUSH_002 — AYUSH Treatment + Allopathic Billing
    If: Claim lists AYUSH treatment but bill includes allopathic drugs
    or surgical procedures — crossover fraud.
    """
    fields = claim_context.get("fields", {})

    if not _is_ayush_claim(fields):
        return None

    # Check for allopathic markers in procedure, medications, or clinical text
    procedure = fields.get(("clinical", "procedure"), "").lower()
    medications = fields.get(("clinical", "medications"), "").lower()
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()

    # Also check individual medication fields
    med_texts = []
    for key, val in fields.items():
        if isinstance(key, tuple) and key[0] == "clinical" and "medication" in key[1]:
            med_texts.append(str(val).lower())

    combined_clinical = f"{procedure} {medications} {' '.join(med_texts)}"

    allopathic_found = []

    for marker in ALLOPATHIC_MARKERS:
        if marker in combined_clinical:
            allopathic_found.append(marker)

    for drug in ALLOPATHIC_DRUG_MARKERS:
        if drug in combined_clinical:
            allopathic_found.append(drug)

    if allopathic_found:
        return RuleResult(
            rule_id="AYUSH_002",
            severity="HIGH",
            score=25,
            reason=(
                f"AYUSH-Allopathic crossover: Claim is filed as AYUSH treatment "
                f"but includes allopathic items: {', '.join(allopathic_found[:5])}. "
                f"This is not permissible under IRDAI AYUSH coverage norms."
            ),
        )

    return None


def rule_ayush_excessive_duration(claim_context: dict) -> Optional[RuleResult]:
    """
    AYUSH_003 — AYUSH Excessive Duration
    If: AYUSH treatment billed for > 21 days inpatient.
    Most AYUSH treatments are outpatient or short-stay (Panchakarma 7-14 days max).
    """
    fields = claim_context.get("fields", {})

    if not _is_ayush_claim(fields):
        return None

    adm_str = fields.get(("financial", "admission_date")) or fields.get(
        ("clinical", "admission_date"))
    dis_str = fields.get(("financial", "discharge_date")) or fields.get(
        ("clinical", "discharge_date"))

    if not adm_str or not dis_str:
        return None

    try:
        from dateutil import parser

        adm_date = parser.parse(adm_str, fuzzy=True, dayfirst=True)
        dis_date = parser.parse(dis_str, fuzzy=True, dayfirst=True)
        los = (dis_date - adm_date).days

        if los > AYUSH_MAX_INPATIENT_DAYS:
            return RuleResult(
                rule_id="AYUSH_003",
                severity="MEDIUM",
                score=20,
                reason=(
                    f"AYUSH excessive duration: AYUSH treatment billed for {los} days. "
                    f"Standard AYUSH inpatient stays are typically ≤{AYUSH_MAX_INPATIENT_DAYS} days. "
                    f"Extended stays require special justification."
                ),
            )
    except Exception:
        pass

    return None


def rule_ayush_bill_amount_outlier(claim_context: dict) -> Optional[RuleResult]:
    """
    AYUSH_004 — AYUSH Bill Amount Outlier
    If: AYUSH treatment claim exceeds ₹50,000.
    AYUSH treatments are typically lower-cost than allopathic; high bills suggest padding.
    """
    fields = claim_context.get("fields", {})

    if not _is_ayush_claim(fields):
        return None

    bill_str = fields.get(("financial", "bill_amount")) or fields.get(
        ("financial", "total_bill_amount"))

    if not bill_str:
        return None

    try:
        amount = float(bill_str.replace(",", "").replace(
            "₹", "").replace("Rs", "").strip())

        if amount > AYUSH_BILL_THRESHOLD:
            return RuleResult(
                rule_id="AYUSH_004",
                severity="MEDIUM",
                score=15,
                reason=(
                    f"AYUSH bill outlier: AYUSH treatment billed at ₹{amount:,.0f}, "
                    f"which exceeds the typical threshold of ₹{AYUSH_BILL_THRESHOLD:,}. "
                    f"AYUSH treatments are generally lower-cost."
                ),
            )
    except Exception:
        pass

    return None


def rule_unregistered_ayush_practitioner(claim_context: dict) -> Optional[RuleResult]:
    """
    AYUSH_005 — Unregistered AYUSH Practitioner
    If: Treating doctor does NOT have BAMS/BHMS/BUMS/BNYS/BSMS qualification
    but bills AYUSH treatment.
    AYUSH Act requires only registered practitioners to provide AYUSH services.
    """
    fields = claim_context.get("fields", {})

    if not _is_ayush_claim(fields):
        return None

    qualifications = fields.get(
        ("hospital", "doctor_qualifications"), "").lower()
    doctor = fields.get(("hospital", "treating_doctor")) or fields.get(
        ("clinical", "treating_doctor"))

    if not doctor:
        return None

    has_ayush_qualification = any(
        q in qualifications for q in AYUSH_QUALIFICATIONS)

    # Also check if doctor name itself contains qualification hints
    doctor_lower = doctor.lower()
    has_ayush_in_name = any(q in doctor_lower for q in AYUSH_QUALIFICATIONS)

    if not has_ayush_qualification and not has_ayush_in_name:
        return RuleResult(
            rule_id="AYUSH_005",
            severity="HIGH",
            score=25,
            reason=(
                f"Unregistered AYUSH practitioner: Dr. {doctor} is treating an AYUSH case "
                f"but does not have BAMS/BHMS/BUMS/BNYS/BSMS qualification. "
                f"Only registered AYUSH practitioners can provide these treatments."
            ),
        )

    return None
