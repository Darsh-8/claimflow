import logging
from sqlalchemy.orm import Session
from models import Claim, FraudAlert
from .fraud_rules.engine import evaluate_claim

logger = logging.getLogger(__name__)

def evaluate_claim_fraud_risk(db: Session, claim_id: int):
    """
    Evaluates the claim against predefined MVP fraud rules and assigns a risk score 0-100.
    Creates FraudAlert records for any triggered rules.
    """
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        return

    # Clear existing alerts when re-evaluating
    db.query(FraudAlert).filter(FraudAlert.claim_id == claim_id).delete()
    
    logger.info(f"Evaluating fraud risk for claim {claim_id} using MVP Rule Engine...")
    
    score, rule_results = evaluate_claim(db, claim)
    
    flags = []
    
    for result in rule_results:
        alert = FraudAlert(
            claim_id=claim.id,
            rule_triggered=f"{result.rule_id} - {result.severity}",
            risk_score=result.score,
            details={"rule_id": result.rule_id, "severity": result.severity},
            reviewer_notes=result.reason
        )
        db.add(alert)
        flags.append(result.rule_id)
        
    # Cap score at 100
    claim.fraud_risk_score = score
    claim.fraud_flags = flags

    db.commit()
    logger.info(f"Claim {claim_id} fraud evaluation complete. Score: {score}, Flags: {len(flags)}")
