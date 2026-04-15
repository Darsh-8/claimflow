from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from config.database import get_db
from models.models import User, UserRole
from utils.security import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/insurers")
async def get_insurers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch all users with the INSURER role for claim assignment."""
    insurers = db.query(User).filter(User.role == UserRole.INSURER).all()
    # Return minimal data for the dropdown
    return [{"id": i.id, "username": i.username} for i in insurers]
