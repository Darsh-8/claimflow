import logging
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

# Basic benchmarks for MVP
BENCHMARKS = {
    "median_claim_amount": 100000,
    "typical_los": 3,
    "max_room_rent": 5000,
}


def rule_claim_amount_outlier(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Claim amount > 3x median for same ICD-10 + procedure
    """
    fields = claim_context.get("fields", {})
    bill_amount_str = fields.get(("financial", "bill_amount"))

    if not bill_amount_str:
        return None

    try:
        amount = float(bill_amount_str.replace(
            ",", "").replace("₹", "").replace("Rs", "").strip())

        # MVP: simple check against global median without ICD split yet
        if amount > (3 * BENCHMARKS["median_claim_amount"]):
            return RuleResult(
                rule_id="BILL_001",
                severity="HIGH",
                score=30,
                reason=f"Claim amount ({amount}) is >3x the typical median ({BENCHMARKS['median_claim_amount']})."
            )
    except Exception:
        pass

    return None


def rule_length_of_stay_outlier(claim_context: dict) -> Optional[RuleResult]:
    """
    If: LOS > 2x typical LOS for diagnosis OR LOS < medically plausible minimum
    """
    fields = claim_context.get("fields", {})
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

        if los > (2 * BENCHMARKS["typical_los"]):
            return RuleResult(
                rule_id="BILL_002",
                severity="MEDIUM",
                score=15,
                reason=f"Length of stay ({los} days) is more than 2x the typical LOS ({BENCHMARKS['typical_los']})."
            )
    except Exception:
        pass

    return None


def rule_weekend_holiday_surgery(claim_context: dict) -> Optional[RuleResult]:
    """
    If: High-value elective procedure done on Sunday/holiday
    """
    fields = claim_context.get("fields", {})
    adm_str = fields.get(("financial", "admission_date")) or fields.get(
        ("clinical", "admission_date"))
    bill_amount_str = fields.get(("financial", "bill_amount"))

    if not adm_str or not bill_amount_str:
        return None

    try:
        amount = float(bill_amount_str.replace(
            ",", "").replace("₹", "").replace("Rs", "").strip())
        from dateutil import parser
        adm_date = parser.parse(adm_str, fuzzy=True, dayfirst=True)

        # 5=Sat, 6=Sun
        is_weekend = adm_date.weekday() >= 5

        if is_weekend and amount > BENCHMARKS["median_claim_amount"]:
            return RuleResult(
                rule_id="BILL_003",
                severity="MEDIUM",
                score=15,
                reason=f"High-value procedure ({amount}) initiated on a weekend ({adm_date.strftime('%A')})."
            )
    except Exception:
        pass

    return None


def rule_line_item_inflation(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Room rent > policy cap OR Consumables unusually high
    """
    fields = claim_context.get("fields", {})
    room_rent_str = fields.get(("financial", "room_rent"))

    if room_rent_str:
        try:
            room_rent = float(room_rent_str.replace(
                ",", "").replace("₹", "").replace("Rs", "").strip())
            cap = BENCHMARKS["max_room_rent"]
            if room_rent > cap:
                return RuleResult(
                    rule_id="BILL_004",
                    severity="MEDIUM",
                    score=15,
                    reason=f"Billed room rent ({room_rent}) exceeds typical policy cap ({cap})."
                )
        except Exception:
            pass

    return None


def rule_duplicate_billing_pattern(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Same bill number used in multiple claims
    """
    fields = claim_context.get("fields", {})
    bill_no = fields.get(("financial", "bill_number"))
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")

    if not bill_no or not db or not claim_val:
        return None

    # Check if this bill number exists in other claims
    # (Simplified MVP logic. In reality, requires checking ExtractedField table)
    from model.models import ExtractedField

    matches = db.query(ExtractedField).filter(
        ExtractedField.field_name == "bill_number",
        ExtractedField.field_category == "financial",
        ExtractedField.field_value == bill_no,
        ExtractedField.claim_id != claim_val.id
    ).count()

    if matches > 0:
        return RuleResult(
            rule_id="BILL_005",
            severity="HIGH",
            score=30,
            reason=f"Duplicate billing: Bill number {bill_no} was already used in another claim."
        )

    return None
