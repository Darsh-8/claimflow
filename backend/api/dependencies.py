from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from model.models import Claim
from dao.claim_repository import ClaimRepository

def get_claim_or_404(claim_id: int, db: Session = Depends(get_db)) -> Claim:
    """Dependency to retrieve a claim by ID or raise a 404 HTTP Exception."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim
