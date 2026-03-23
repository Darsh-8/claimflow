"""
Hospital History Rules — Fraud detection based on hospital-wide claim patterns.
Uses HospitalProfile and cross-claim analysis to detect anomalous hospital behaviour.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)


def rule_hospital_claim_volume_spike(claim_context: dict) -> Optional[RuleResult]:
    """
    HOSP_001 — Hospital Claim Volume Spike
    If: Hospital's claims in last 30 days > 3× its 6-month monthly average.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    db = claim_context.get("db")

    if not hospital or not db:
        return None

    from model.models import ExtractedField, Claim

    recent_cutoff = datetime.utcnow() - timedelta(days=30)
    history_cutoff = datetime.utcnow() - timedelta(days=180)

    recent_count = db.query(Claim).join(
        ExtractedField, Claim.id == ExtractedField.claim_id
    ).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital,
        Claim.created_at >= recent_cutoff,
    ).count()

    hist_count = db.query(Claim).join(
        ExtractedField, Claim.id == ExtractedField.claim_id
    ).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital,
        Claim.created_at >= history_cutoff,
        Claim.created_at < recent_cutoff,
    ).count()

    monthly_avg = (hist_count / 5.0) if hist_count > 0 else 0.5

    if recent_count > (3 * monthly_avg) and recent_count >= 3:
        return RuleResult(
            rule_id="HOSP_001",
            severity="HIGH",
            score=25,
            reason=(
                f"Hospital claim volume spike: '{hospital}' filed {recent_count} claims "
                f"in last 30 days vs historical avg of {monthly_avg:.1f}/month."
            ),
        )

    return None


def rule_hospital_rejection_rate(claim_context: dict) -> Optional[RuleResult]:
    """
    HOSP_002 — Hospital Rejection Rate
    If: Hospital has > 40% historically rejected claims.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    db = claim_context.get("db")

    if not hospital or not db:
        return None

    from model.models import ExtractedField, Claim, ClaimStatus

    h_claims = db.query(Claim).join(
        ExtractedField, Claim.id == ExtractedField.claim_id
    ).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital,
    ).all()

    total = len(h_claims)
    if total < 3:
        return None

    rejected = sum(1 for c in h_claims if c.status == ClaimStatus.REJECTED)
    rejection_rate = rejected / total

    if rejection_rate > 0.40:
        return RuleResult(
            rule_id="HOSP_002",
            severity="HIGH",
            score=30,
            reason=(
                f"High rejection rate: Hospital '{hospital}' has {rejected}/{total} "
                f"({rejection_rate*100:.0f}%) claims rejected historically."
            ),
        )

    return None


def rule_hospital_avg_bill_inflation(claim_context: dict) -> Optional[RuleResult]:
    """
    HOSP_003 — Hospital Average Bill Inflation
    If: Hospital's average claim amount > 2× global average across all hospitals.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    bill_str = fields.get(("financial", "bill_amount")) or fields.get(
        ("financial", "total_bill_amount"))
    db = claim_context.get("db")

    if not hospital or not bill_str or not db:
        return None

    try:
        from model.models import HospitalProfile

        profile = db.query(HospitalProfile).filter(
            HospitalProfile.hospital_name == hospital
        ).first()

        if not profile or profile.total_claims < 3:
            return None

        # Compare against global average
        all_hospitals = db.query(HospitalProfile).filter(
            HospitalProfile.total_claims >= 3
        ).all()

        if len(all_hospitals) < 2:
            return None

        global_avg = sum(
            h.average_claim_amount for h in all_hospitals) / len(all_hospitals)

        if global_avg > 0 and profile.average_claim_amount > (2 * global_avg):
            return RuleResult(
                rule_id="HOSP_003",
                severity="MEDIUM",
                score=15,
                reason=(
                    f"Bill inflation: Hospital '{hospital}' avg claim ₹{profile.average_claim_amount:,.0f} "
                    f"is >2× the global average ₹{global_avg:,.0f}."
                ),
            )
    except Exception:
        pass

    return None


def rule_newly_registered_hospital(claim_context: dict) -> Optional[RuleResult]:
    """
    HOSP_004 — Newly Registered Hospital
    If: Hospital has < 3 lifetime claims AND all are high-value (> ₹2L).
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    db = claim_context.get("db")

    if not hospital or not db:
        return None

    from model.models import ExtractedField, Claim

    h_claims = db.query(Claim).join(
        ExtractedField, Claim.id == ExtractedField.claim_id
    ).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital,
    ).all()

    total = len(h_claims)
    if total == 0 or total > 3:
        return None

    high_value_count = 0
    for c in h_claims:
        b_field = db.query(ExtractedField).filter(
            ExtractedField.claim_id == c.id,
            ExtractedField.field_name.in_(
                ["bill_amount", "total_bill_amount"]),
        ).first()
        if b_field and b_field.field_value:
            try:
                amt = float(b_field.field_value.replace(
                    ",", "").replace("₹", "").replace("Rs", "").strip())
                if amt > 200000:
                    high_value_count += 1
            except Exception:
                pass

    if high_value_count == total and total >= 1:
        return RuleResult(
            rule_id="HOSP_004",
            severity="HIGH",
            score=25,
            reason=(
                f"Newly registered hospital: '{hospital}' has only {total} lifetime claims, "
                f"all exceeding ₹2,00,000."
            ),
        )

    return None


def rule_hospital_diagnosis_concentration(claim_context: dict) -> Optional[RuleResult]:
    """
    HOSP_005 — Hospital–Diagnosis Concentration
    If: > 70% of a hospital's claims use the same diagnosis code.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    db = claim_context.get("db")

    if not hospital or not db:
        return None

    from model.models import ExtractedField, Claim
    from collections import Counter

    h_claims = db.query(Claim).join(
        ExtractedField, Claim.id == ExtractedField.claim_id
    ).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital,
    ).all()

    if len(h_claims) < 5:
        return None

    diagnoses = []
    for c in h_claims:
        diag = db.query(ExtractedField).filter(
            ExtractedField.claim_id == c.id,
            ExtractedField.field_name == "diagnosis",
            ExtractedField.field_category == "clinical",
        ).first()
        if diag and diag.field_value:
            diagnoses.append(diag.field_value.lower().strip())

    if not diagnoses:
        return None

    counter = Counter(diagnoses)
    most_common_diag, most_common_count = counter.most_common(1)[0]
    concentration = most_common_count / len(diagnoses)

    if concentration > 0.70:
        return RuleResult(
            rule_id="HOSP_005",
            severity="MEDIUM",
            score=15,
            reason=(
                f"Diagnosis concentration: {concentration*100:.0f}% of '{hospital}' claims "
                f"use diagnosis '{most_common_diag}'."
            ),
        )

    return None
