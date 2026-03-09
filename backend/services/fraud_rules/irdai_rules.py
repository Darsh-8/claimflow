"""
IRDAI Compliance Rules — Fraud detection based on Indian Insurance Regulatory
and Development Authority (IRDAI) Health Insurance Regulations.

References:
- IRDAI Health Insurance Regulations 2024
- NHA (National Health Authority) Guidelines
- Standardised health insurance claim procedures
"""

import logging
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

# IRDAI mandated document list for cashless / reimbursement claims
MANDATORY_DOC_TYPES = {"discharge_summary", "bill"}

# Procedures requiring pre-authorization as per IRDAI / NHA guidelines
PRE_AUTH_PROCEDURES = [
    "angioplasty", "bypass", "cabg", "dialysis", "chemotherapy",
    "radiotherapy", "knee replacement", "hip replacement", "spine surgery",
    "organ transplant", "bariatric surgery", "cochlear implant",
    "valve replacement", "pacemaker", "stent", "laparoscopic",
    "lithotripsy", "hysterectomy", "caesarean", "c-section",
]

# Diseases with standard IRDAI initial waiting period (typically 2 years)
WAITING_PERIOD_DISEASES = [
    "hernia", "cataract", "benign prostatic hypertrophy", "pile",
    "fistula", "sinusitis", "tonsillitis", "gall bladder stone",
    "kidney stone", "joint replacement", "internal tumour",
    "fibroid", "polyp", "adenoid",
]

# IRDAI-listed day-care procedures (max 24h stay)
DAY_CARE_PROCEDURES = [
    "cataract", "tonsillectomy", "lithotripsy", "chemotherapy",
    "dialysis", "sclerotherapy", "dilatation and curettage",
    "fracture", "circumcision", "cystoscopy", "hydrocele",
    "dental surgery", "biopsy", "endoscopy", "colonoscopy",
]


def rule_missing_mandatory_documents(claim_context: dict) -> Optional[RuleResult]:
    """
    IRDAI_001 — Missing Mandatory Documents
    If: Claim is missing Discharge Summary or Final Bill (IRDAI mandates both).
    """
    docs = claim_context.get("documents", [])

    if not docs:
        return RuleResult(
            rule_id="IRDAI_001",
            severity="MEDIUM",
            score=15,
            reason="IRDAI Non-compliance: No documents attached to this claim.",
        )

    doc_types_present = set()
    for d in docs:
        dt = d.doc_type.value if hasattr(d.doc_type, "value") else str(d.doc_type)
        doc_types_present.add(dt)

    missing = MANDATORY_DOC_TYPES - doc_types_present

    if missing:
        missing_names = [m.replace("_", " ").title() for m in missing]
        return RuleResult(
            rule_id="IRDAI_001",
            severity="MEDIUM",
            score=15,
            reason=(
                f"IRDAI Non-compliance: Missing mandatory documents — "
                f"{', '.join(missing_names)}. IRDAI requires both for claim processing."
            ),
        )

    return None


def rule_pre_authorization_violation(claim_context: dict) -> Optional[RuleResult]:
    """
    IRDAI_002 — Pre-Authorization Violation
    If: Procedure requires pre-auth but no pre-auth document attached.
    """
    fields = claim_context.get("fields", {})
    procedure = fields.get(("clinical", "procedure"), "").lower()
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    docs = claim_context.get("documents", [])

    combined = f"{procedure} {diagnosis}"

    needs_preauth = any(p in combined for p in PRE_AUTH_PROCEDURES)

    if not needs_preauth:
        return None

    has_preauth = any(
        (d.doc_type.value if hasattr(d.doc_type, "value") else str(d.doc_type)) == "pre_auth"
        for d in docs
    )

    if not has_preauth:
        matched_proc = [p for p in PRE_AUTH_PROCEDURES if p in combined]
        return RuleResult(
            rule_id="IRDAI_002",
            severity="HIGH",
            score=25,
            reason=(
                f"Pre-auth violation: Procedure '{matched_proc[0]}' requires IRDAI-mandated "
                f"pre-authorization, but no pre-auth document is attached."
            ),
        )

    return None


def rule_waiting_period_violation(claim_context: dict) -> Optional[RuleResult]:
    """
    IRDAI_003 — Waiting Period Violation (Standard)
    If: Specific diseases claimed within 2-year waiting period of policy inception.
    IRDAI mandates 2-year waiting for listed diseases, 30-day initial waiting.
    """
    fields = claim_context.get("fields", {})
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    policy_start_str = fields.get(("policy", "policy_start_date"))

    if not diagnosis or not policy_start_str:
        return None

    has_waiting_disease = any(d in diagnosis for d in WAITING_PERIOD_DISEASES)

    if not has_waiting_disease:
        return None

    try:
        from dateutil import parser
        from datetime import timedelta

        pol_start = parser.parse(policy_start_str, fuzzy=True, dayfirst=True)
        from datetime import datetime
        days_since = (datetime.utcnow().date() - pol_start.date()).days

        # IRDAI standard 2-year waiting period = 730 days
        if days_since < 730:
            matched_disease = [d for d in WAITING_PERIOD_DISEASES if d in diagnosis]
            return RuleResult(
                rule_id="IRDAI_003",
                severity="HIGH",
                score=30,
                reason=(
                    f"IRDAI waiting period violation: '{matched_disease[0]}' is a listed "
                    f"disease with a 2-year waiting period. Policy started just "
                    f"{days_since} days ago ({pol_start.date()})."
                ),
            )
    except Exception:
        pass

    return None


def rule_daycare_procedure_overbilling(claim_context: dict) -> Optional[RuleResult]:
    """
    IRDAI_004 — Day-Care Procedure Overbilling
    If: Day-care procedure billed with > 1 day hospital stay.
    IRDAI defines day-care procedures as requiring < 24 hours of hospitalisation.
    """
    fields = claim_context.get("fields", {})
    procedure = fields.get(("clinical", "procedure"), "").lower()
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    adm_str = fields.get(("financial", "admission_date")) or fields.get(("clinical", "admission_date"))
    dis_str = fields.get(("financial", "discharge_date")) or fields.get(("clinical", "discharge_date"))

    combined = f"{procedure} {diagnosis}"

    is_daycare = any(p in combined for p in DAY_CARE_PROCEDURES)

    if not is_daycare or not adm_str or not dis_str:
        return None

    try:
        from dateutil import parser

        adm_date = parser.parse(adm_str, fuzzy=True, dayfirst=True)
        dis_date = parser.parse(dis_str, fuzzy=True, dayfirst=True)
        los = (dis_date - adm_date).days

        if los > 1:
            matched_proc = [p for p in DAY_CARE_PROCEDURES if p in combined]
            return RuleResult(
                rule_id="IRDAI_004",
                severity="MEDIUM",
                score=20,
                reason=(
                    f"Day-care overbilling: '{matched_proc[0]}' is an IRDAI-listed day-care "
                    f"procedure (max 24h stay), but LOS is {los} days."
                ),
            )
    except Exception:
        pass

    return None


def rule_cashless_reimbursement_gap(claim_context: dict) -> Optional[RuleResult]:
    """
    IRDAI_005 — Cashless vs Reimbursement Gap
    If: Final reimbursement amount > pre-auth cashless amount by > 50%.
    Indicates possible inflation after switching from cashless to reimbursement.
    """
    fields = claim_context.get("fields", {})
    final_str = fields.get(("financial", "bill_amount")) or fields.get(("financial", "total_bill_amount"))
    preauth_str = fields.get(("financial", "pre_auth_amount"))
    claim_type = fields.get(("policy", "claim_type"), "").lower()

    if not final_str or not preauth_str:
        return None

    # Only trigger for reimbursement claims that had cashless pre-auth
    if "reimbursement" not in claim_type and "reimburse" not in claim_type:
        return None

    try:
        final_amt = float(final_str.replace(",", "").replace("₹", "").replace("Rs", "").strip())
        preauth_amt = float(preauth_str.replace(",", "").replace("₹", "").replace("Rs", "").strip())

        if preauth_amt > 0:
            gap = (final_amt - preauth_amt) / preauth_amt
            if gap > 0.50:
                return RuleResult(
                    rule_id="IRDAI_005",
                    severity="MEDIUM",
                    score=15,
                    reason=(
                        f"Cashless-reimbursement gap: Final amount ₹{final_amt:,.0f} is "
                        f"{gap*100:.0f}% higher than cashless pre-auth ₹{preauth_amt:,.0f}."
                    ),
                )
    except Exception:
        pass

    return None
