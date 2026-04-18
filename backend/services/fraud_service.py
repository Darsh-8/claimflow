import logging
from sqlalchemy.orm import Session
from models.models import Claim, FraudAlert
from .fraud_rules.engine import evaluate_claim

logger = logging.getLogger(__name__)


def evaluate_claim_fraud_risk(db: Session, claim_id: int):
    """
    Evaluates the claim against predefined MVP fraud rules and assigns a risk score 0-100.
    Creates FraudAlert records for any triggered rules.

    Only runs for claims that have been properly submitted (status VALIDATED or later).
    EXTRACTED claims are draft/unsubmitted and must not affect fraud scoring.
    """
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        return

    # Skip fraud evaluation for draft/unsubmitted claims.
    # EXTRACTED = hospital extracted data but hasn't linked insurer/submitted yet.
    # PENDING/PROCESSING = pipeline mid-flight, not a finalised submission.
    DRAFT_STATUSES = {'EXTRACTED', 'PENDING', 'PROCESSING'}
    claim_status = claim.status.value if hasattr(claim.status, 'value') else str(claim.status)
    if claim_status.upper() in DRAFT_STATUSES:
        logger.info(
            f"Skipping fraud evaluation for claim {claim_id} — status is '{claim_status}' (draft/unsubmitted)."
        )
        return

    # Clear existing alerts when re-evaluating
    db.query(FraudAlert).filter(FraudAlert.claim_id == claim_id).delete()

    logger.info(
        f"Evaluating fraud risk for claim {claim_id} using MVP Rule Engine...")

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
    logger.info(
        f"Claim {claim_id} fraud evaluation complete. Score: {score}, Flags: {len(flags)}")
