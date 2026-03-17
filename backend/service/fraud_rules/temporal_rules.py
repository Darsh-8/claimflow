import logging
from datetime import datetime, timedelta
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)


def rule_admission_right_after_policy_upgrade(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Claim within 7 days of sum insured enhancement
    """
    # For MVP, we'll pretend there's an 'upgrade_date' field, but maybe we just default to None
    fields = claim_context.get("fields", {})
    adm_str = fields.get(("financial", "admission_date")) or fields.get(
        ("clinical", "admission_date"))
    upgrade_str = fields.get(("policy", "last_upgrade_date"))

    if not adm_str or not upgrade_str:
        return None

    try:
        from dateutil import parser
        adm_date = parser.parse(adm_str, fuzzy=True, dayfirst=True)
        upgrade_date = parser.parse(upgrade_str, fuzzy=True, dayfirst=True)

        if adm_date - upgrade_date < timedelta(days=7):
            return RuleResult(
                rule_id="TEMP_001",
                severity="HIGH",
                score=30,
                reason=f"Temporal risk: Admission date ({adm_date.date()}) is within 7 days of policy upgrade ({upgrade_date.date()})."
            )
    except Exception:
        pass

    return None


def rule_delayed_bill_submission(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Final bill submitted > 6 months after discharge
    """
    fields = claim_context.get("fields", {})
    dis_str = fields.get(("financial", "discharge_date")) or fields.get(
        ("clinical", "discharge_date"))

    if not dis_str:
        return None

    try:
        from dateutil import parser
        dis_date = parser.parse(dis_str, fuzzy=True, dayfirst=True)
        days_delayed = (datetime.utcnow().date() - dis_date.date()).days

        if days_delayed > 180:
            return RuleResult(
                rule_id="TEMP_002",
                severity="MEDIUM",
                score=15,
                reason=f"Delayed submission: Claim submitted {days_delayed} days after discharge (limit 180)."
            )
    except Exception:
        pass

    return None


def rule_repeated_high_value_claims_same_doctor(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Same doctor signs > X high-value claims in short period
    """
    fields = claim_context.get("fields", {})
    doctor = fields.get(("clinical", "treating_doctor"))
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")

    if not doctor or not db or not claim_val:
        return None

    from model.models import ExtractedField, Claim
    from sqlalchemy import func

    # MVP simplistic check
    recent_date = datetime.utcnow() - timedelta(days=30)

    # Needs a join in reality, but for MVP we will just check if this doctor string is common
    count = db.query(ExtractedField).join(Claim, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_name == "treating_doctor",
        ExtractedField.field_value == doctor,
        Claim.created_at >= recent_date,
        Claim.id != claim_val.id
    ).count()

    if count >= 3:
        return RuleResult(
            rule_id="TEMP_003",
            severity="MEDIUM",
            score=15,
            reason=f"Doctor pattern: Dr. {doctor} has {count} other recent claims."
        )

    return None
