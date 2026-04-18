from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from sqlalchemy import func

from config.database import get_db
from models.models import User, UserRole, Claim
from utils.security import get_current_active_user, require_role, get_password_hash

router = APIRouter(prefix="/admin", tags=["admin"])

# Schemas
class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: UserRole

class UserResponse(BaseModel):
    id: int
    username: str
    role: UserRole
    claim_count: int

class PasswordResetRequest(BaseModel):
    new_password: str

@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    total_users = db.query(User).count()
    hospitals = db.query(User).filter(User.role == UserRole.HOSPITAL).count()
    insurers = db.query(User).filter(User.role == UserRole.INSURER).count()
    admins = db.query(User).filter(User.role == UserRole.ADMIN).count()
    
    total_claims = db.query(Claim).count()
    processing_claims = db.query(Claim).filter(Claim.status == "PROCESSING").count()
    
    return {
        "users": {
            "total": total_users,
            "hospitals": hospitals,
            "insurers": insurers,
            "admins": admins
        },
        "claims": {
            "total": total_claims,
            "processing": processing_claims
        }
    }

@router.get("/users", response_model=List[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    # Get all users and a count of claims associated with them
    # For hospitals: claims where user_id == id
    # For insurers: claims where insurer_id == id
    users = db.query(User).all()
    
    result = []
    for user in users:
        claim_count = 0
        if user.role == UserRole.HOSPITAL:
            claim_count = db.query(Claim).filter(Claim.created_by == user.id).count()
        elif user.role == UserRole.INSURER:
            claim_count = db.query(Claim).filter(Claim.insurer_id == user.id).count()
            
        result.append({
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "claim_count": claim_count
        })
        
    return result

@router.post("/users")
def create_user(
    req: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    # Check if username exists
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    new_user = User(
        username=req.username,
        hashed_password=get_password_hash(req.password),
        role=req.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully", "user_id": new_user.id}

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.delete(user)
    db.commit()
    
    return {"message": "User deleted successfully"}

@router.patch("/users/{user_id}/password")
def reset_user_password(
    user_id: int,
    req: PasswordResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.hashed_password = get_password_hash(req.new_password)
    db.commit()
    
    return {"message": "Password updated successfully"}
