import logging
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import Claim, ExtractedField

logger = logging.getLogger(__name__)

def build_patient_hospital_bipartite_graph(db: Session, timeframe_days: int = 180) -> dict:
    """
    Builds an adjacency list of Patient Phones -> Hospital Names
    """
    from datetime import datetime, timedelta
    
    cutoff_date = datetime.utcnow() - timedelta(days=timeframe_days)
    
    # Needs a join: Claim -> ExtractedField
    # We find claims newer than cutoff_date
    claims_in_scope = db.query(Claim).filter(Claim.created_at >= cutoff_date).all()
    
    graph = {}
    
    for claim in claims_in_scope:
        hospital_val = db.query(ExtractedField).filter(
            ExtractedField.claim_id == claim.id,
            ExtractedField.field_category == "hospital",
            ExtractedField.field_name == "name"
        ).first()
        
        phone_val = db.query(ExtractedField).filter(
            ExtractedField.claim_id == claim.id,
            ExtractedField.field_category == "patient",
            ExtractedField.field_name == "phone"
        ).first()
        
        if hospital_val and phone_val:
            h_name = hospital_val.field_value
            p_phone = phone_val.field_value
            
            if p_phone not in graph:
                graph[p_phone] = []
            graph[p_phone].append(h_name)
            
    return graph

def find_shared_attributes(db: Session) -> dict:
    """
    Utility to find claims that share the same bank account or emergency contact
    but have DIFFERENT patient names.
    Returns: { "attribute_value": [claim_id_1, claim_id_2] }
    """
    # Look for matching bank account numbers
    bank_fields = db.query(ExtractedField).filter(
        ExtractedField.field_category == "financial",
        ExtractedField.field_name == "bank_account"
    ).all()
    
    clusters = {}
    for bf in bank_fields:
        if bf.field_value:
            if bf.field_value not in clusters:
                clusters[bf.field_value] = []
            clusters[bf.field_value].append(bf.claim_id)
            
    # Filter to only clusters with > 1 distinct patient name
    fraud_clusters = {}
    for val, claim_ids in clusters.items():
        if len(claim_ids) > 1:
            names = set()
            for cid in claim_ids:
                claim = db.query(Claim).filter(Claim.id == cid).first()
                if claim and claim.patient_name:
                    names.add(claim.patient_name)
            if len(names) > 1:
                fraud_clusters[val] = claim_ids
                
    return fraud_clusters
