import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

class RuleResult:
    def __init__(self, rule_id: str, severity: str, score: int, reason: str):
        self.rule_id = rule_id
        self.severity = severity
        self.score = score
        self.reason = reason

def rule_early_claim_after_policy_purchase(claim_context: dict) -> Optional[RuleResult]:
    """
    If: admission_date - policy_start_date < waiting_period
    -> HIGH risk
    """
    fields = claim_context.get("fields", {})
    admission_date_str = fields.get(("financial", "admission_date")) or fields.get(("clinical", "admission_date"))
    policy_start_str = fields.get(("policy", "policy_start_date"))
    
    if not admission_date_str or not policy_start_str:
        return None

    try:
        from dateutil import parser
        adm_date = parser.parse(admission_date_str, fuzzy=True, dayfirst=True)
        pol_start = parser.parse(policy_start_str, fuzzy=True, dayfirst=True)
        
        # Assume minimum waiting period of 30 days for MVP
        waiting_period = timedelta(days=30)
        
        if adm_date - pol_start < waiting_period:
            return RuleResult(
                rule_id="POL_001",
                severity="HIGH",
                score=30,
                reason=f"Early claim: Admission date ({adm_date.date()}) is within 30 days of policy start ({pol_start.date()})."
            )
    except Exception as e:
        logger.warning(f"Error parsing dates in POL_001: {e}")
        
    return None

def rule_multiple_claims_in_short_window(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Same patient has >2 claims in 90 days.
    This requires looking at historical claims for the patient.
    """
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")
    if not db or not claim_val.patient_name:
        return None

    from models import Claim
    from sqlalchemy import and_
    
    # Simple check for same patient name
    recent_date = datetime.utcnow() - timedelta(days=90)
    claims_count = db.query(Claim).filter(
        Claim.patient_name == claim_val.patient_name,
        Claim.created_at >= recent_date,
        Claim.id != claim_val.id
    ).count()

    if claims_count >= 2:
        return RuleResult(
            rule_id="POL_002",
            severity="HIGH",
            score=30,
            reason=f"Patient has {claims_count} other claims in the last 90 days."
        )

    return None

def rule_sum_insured_spike_usage(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Claim amount > 70% of total sum insured on first claim
    """
    fields = claim_context.get("fields", {})
    bill_amount_str = fields.get(("financial", "bill_amount"))
    sum_insured_str = fields.get(("policy", "sum_insured"))
    
    if not bill_amount_str or not sum_insured_str:
        return None

    try:
        amount = float(bill_amount_str.replace(",", "").replace("₹", "").replace("Rs", "").strip())
        sum_insured = float(sum_insured_str.replace(",", "").replace("₹", "").replace("Rs", "").strip())
        
        if amount > (sum_insured * 0.70):
            return RuleResult(
                rule_id="POL_003",
                severity="MEDIUM",
                score=15,
                reason=f"Claim amount ({amount}) exceeds 70% of total sum insured ({sum_insured})."
            )
    except Exception:
        pass
        
    return None

def rule_non_disclosure_suspicion(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Chronic disease detected in discharge summary AND Policy tenure < 1 year AND No PED declared
    """
    fields = claim_context.get("fields", {})
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    ped_declared = fields.get(("policy", "ped_declared"), "no").lower()
    policy_start_str = fields.get(("policy", "policy_start_date"))
    
    chronic_keywords = ["diabetes", "hypertension", "asthma", "arthritis", "ckd", "copd"]
    has_chronic = any(k in diagnosis for k in chronic_keywords)
    
    if has_chronic and "no" in ped_declared and policy_start_str:
        try:
            from dateutil import parser
            pol_start = parser.parse(policy_start_str, fuzzy=True, dayfirst=True)
            if datetime.utcnow().date() - pol_start.date() < timedelta(days=365):
                return RuleResult(
                    rule_id="POL_004",
                    severity="HIGH",
                    score=30,
                    reason=f"Suspicion of non-disclosure: Chronic disease ({diagnosis}) detected within 1st year of policy with no PED declared."
                )
        except Exception:
            pass
            
    return None
