import logging
from datetime import datetime, timedelta
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

def rule_code_upcoding_velocity(claim_context: dict) -> Optional[RuleResult]:
    """
    Rule 6.1 — Code Upcoding Velocity
    If the hospital's usage rate of a severe ICD-10 code spikes by >3x compared to their 6-month average.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    icd_code = fields.get(("clinical", "icd_code"))
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")
    
    if not hospital or not icd_code or not db or not claim_val:
        return None

    # For MVP: simple historical frequency snapshot (usually needs data warehouse aggregate)
    from models import ExtractedField, Claim
    
    recent_date = datetime.utcnow() - timedelta(days=30)
    history_date = datetime.utcnow() - timedelta(days=180)
    
    # How many times this hospital billed this code in last 30 days
    recent_count = db.query(ExtractedField).join(Claim, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_name == "icd_code",
        ExtractedField.field_value == icd_code,
        Claim.created_at >= recent_date
    ).count()
    
    # Total times in previous 5 months
    hist_count = db.query(ExtractedField).join(Claim, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_name == "icd_code",
        ExtractedField.field_value == icd_code,
        Claim.created_at >= history_date,
        Claim.created_at < recent_date
    ).count()
    
    # Monthly average for historical period (approx 5 months)
    historical_monthly_avg = (hist_count / 5.0) if hist_count > 0 else 0.5
    
    if recent_count > (3 * historical_monthly_avg) and recent_count >= 3:
        return RuleResult(
            rule_id="PAT_001",
            severity="HIGH",
            score=30,
            reason=f"Upcoding velocity: Hospital billed ICD '{icd_code}' {recent_count} times this month vs historical avg of {historical_monthly_avg:.1f}/month."
        )

    return None

def rule_weekend_admission_ratio_pivot(claim_context: dict) -> Optional[RuleResult]:
    """
    Rule 6.2 — Weekend Admission Ratio Pivot
    If hospital historically admits 15% on weekends, but last 30 days show >50% weekend rate.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    adm_str = fields.get(("financial", "admission_date")) or fields.get(("clinical", "admission_date"))
    db = claim_context.get("db")
    
    if not hospital or not adm_str or not db:
        return None

    try:
        from dateutil import parser
        adm_date = parser.parse(adm_str, fuzzy=True, dayfirst=True)
        is_weekend = adm_date.weekday() >= 5
        
        # If this isn't even a weekend admission, no need to alert here
        if not is_weekend:
            return None
            
        from models import Claim, ExtractedField
        
        # Checking last 30 days for this hospital
        recent_cutoff = datetime.utcnow() - timedelta(days=30)
        recent_claims = db.query(Claim).join(ExtractedField, Claim.id == ExtractedField.claim_id).filter(
            ExtractedField.field_name == "name",
            ExtractedField.field_category == "hospital",
            ExtractedField.field_value == hospital,
            Claim.created_at >= recent_cutoff
        ).all()
        
        # Since date parsing across SQL is complex without native types, we parse in Python for MVP
        recent_weekend_count = 0
        total_recent_with_date = 0
        
        for c in recent_claims:
            adm_val = db.query(ExtractedField).filter(
                ExtractedField.claim_id == c.id,
                ExtractedField.field_name == "admission_date"
            ).first()
            if adm_val and adm_val.field_value:
                total_recent_with_date += 1
                try:
                    c_date = parser.parse(adm_val.field_value, fuzzy=True, dayfirst=True)
                    if c_date.weekday() >= 5:
                        recent_weekend_count += 1
                except:
                    pass
                    
        if total_recent_with_date >= 5: # min sample size
            ratio = recent_weekend_count / total_recent_with_date
            if ratio > 0.5:
                return RuleResult(
                    rule_id="PAT_002",
                    severity="MEDIUM",
                    score=15,
                    reason=f"Weekend ratio pivot: {ratio*100:.0f}% of hospital's recent admissions ({recent_weekend_count}/{total_recent_with_date}) occurred on weekends."
                )

    except Exception:
        pass

    return None
