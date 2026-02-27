import logging
from datetime import datetime, timedelta
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

def rule_high_frequency_patient_hospital_pair(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Same patient admitted >3 times in same hospital within 6 months
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")
    
    if not hospital or not db or not claim_val or not claim_val.patient_name:
        return None

    from models import ExtractedField, Claim
    
    recent_date = datetime.utcnow() - timedelta(days=180)
    
    count = db.query(ExtractedField).join(Claim, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_category == "hospital",
        ExtractedField.field_name == "name",
        ExtractedField.field_value == hospital,
        Claim.patient_name == claim_val.patient_name,
        Claim.created_at >= recent_date,
        Claim.id != claim_val.id
    ).count()

    if count >= 3:
        return RuleResult(
            rule_id="NET_001",
            severity="MEDIUM",
            score=15,
            reason=f"Network pattern: Patient {claim_val.patient_name} admitted to {hospital} {count} times in 6 months."
        )

    return None

def rule_abnormal_hospital_billing_deviation(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Hospital avg claim amount > 50% higher than peer hospitals
    Requires aggregate ML/Analytics. For MVP, we flag if hospital name is in a known watchlist
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"), "").lower()
    
    if not hospital:
        return None
        
    watchlist = ["fake hospital", "shady clinic", "fraud care"]
    
    if any(w in hospital for w in watchlist):
        return RuleResult(
            rule_id="NET_002",
            severity="HIGH",
            score=30,
            reason=f"Hospital watchlist: {hospital} is flagged for abnormal billing deviation."
        )
        
    return None

def rule_shared_contact_phone_reuse(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Same phone number across multiple patients
    """
    fields = claim_context.get("fields", {})
    phone = fields.get(("patient", "phone"))
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")
    
    if not phone or not db or not claim_val:
        return None

    from models import ExtractedField, Claim
    
    count = db.query(ExtractedField).join(Claim, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_category == "patient",
        ExtractedField.field_name == "phone",
        ExtractedField.field_value == phone,
        Claim.patient_name != claim_val.patient_name,
        Claim.id != claim_val.id
    ).count()

    if count > 0:
        return RuleResult(
            rule_id="NET_003",
            severity="HIGH",
            score=30,
            reason=f"Shared contact: Phone {phone} is used by {count} other distinct patients."
        )

    return None

def rule_doctor_hospital_collusion_ring(claim_context: dict) -> Optional[RuleResult]:
    """
    Rule 5.4 — Doctor-Hospital Collusion Ring
    If Hospital X has >80% of claims signed by Doctor Y, AND amounts are high.
    """
    fields = claim_context.get("fields", {})
    hospital = fields.get(("hospital", "name"))
    doctor = fields.get(("clinical", "treating_doctor"))
    db = claim_context.get("db")
    
    if not hospital or not doctor or not db:
        return None
        
    from models import ExtractedField, Claim
    
    # Total claims for hospital
    h_claims = db.query(Claim).join(ExtractedField, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital
    ).all()
    
    total_h = len(h_claims)
    if total_h < 5:
        return None
        
    doc_count = 0
    for c in h_claims:
        doc_f = db.query(ExtractedField).filter(
            ExtractedField.claim_id == c.id,
            ExtractedField.field_name == "treating_doctor"
        ).first()
        if doc_f and doc_f.field_value == doctor:
            doc_count += 1
            
    if doc_count / total_h > 0.8:
        return RuleResult(
            rule_id="NET_004",
            severity="HIGH",
            score=30,
            reason=f"Collusion risk: Doctor {doctor} signed {doc_count}/{total_h} claims for {hospital}."
        )
        
    return None

def rule_synthetic_identity_cluster(claim_context: dict) -> Optional[RuleResult]:
    """
    Rule 5.5 — Synthetic Identity Cluster
    Uses graph_utils to find claims with different names but shared bank details.
    """
    db = claim_context.get("db")
    claim_val = claim_context.get("claim")
    if not db or not claim_val:
        return None
        
    from .graph_utils import find_shared_attributes
    fraud_clusters = find_shared_attributes(db)
    
    # Check if our current claim is in any of these clusters
    for shared_val, claim_ids in fraud_clusters.items():
        if claim_val.id in claim_ids:
            return RuleResult(
                rule_id="NET_005",
                severity="HIGH",
                score=30,
                reason=f"Synthetic identity: Claim shares bank/contact details '{shared_val}' with other distinct patients."
            )
            
    return None

def rule_phantom_clinic_detection(claim_context: dict) -> Optional[RuleResult]:
    """
    Rule 5.6 — Phantom Clinic Detection
    Hospital <5 total lifetime claims but all are unusually high-value.
    """
    fields = claim_context.get("fields", {})
    hospital_name = fields.get(("hospital", "name"))
    db = claim_context.get("db")
    
    if not hospital_name or not db:
        return None
        
    from models import ExtractedField, Claim
    
    h_claims = db.query(Claim).join(ExtractedField, Claim.id == ExtractedField.claim_id).filter(
        ExtractedField.field_name == "name",
        ExtractedField.field_category == "hospital",
        ExtractedField.field_value == hospital_name
    ).all()
    
    total = len(h_claims)
    if 0 < total <= 5:
        high_value_count = 0
        for c in h_claims:
            b_field = db.query(ExtractedField).filter(
                ExtractedField.claim_id == c.id,
                ExtractedField.field_name == "bill_amount"
            ).first()
            if b_field and b_field.field_value:
                try:
                    amt = float(b_field.field_value.replace(",", "").replace("₹", "").replace("Rs", "").strip())
                    if amt > 300000:  # 3 Lakhs MVP threshold
                        high_value_count += 1
                except:
                    pass
                    
        if high_value_count == total and total >= 2:
            return RuleResult(
                rule_id="NET_006",
                severity="HIGH",
                score=30,
                reason=f"Phantom clinic pattern: Hospital '{hospital_name}' has only {total} lifetime claims, all exceedingly high value."
            )
            
    return None
