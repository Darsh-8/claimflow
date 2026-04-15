from fastapi import APIRouter, Depends, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from config.database import get_db
from models.models import User
from utils.security import get_current_active_user
from schemas.schemas import ForgotPasswordRequest, ResetPasswordRequest, UpdatePasswordRequest
from controllers.auth_controller import AuthController

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    return AuthController.login(response, form_data, db)


@router.post("/refresh")
def refresh_access_token(request: Request, response: Response, db: Session = Depends(get_db)):
    return AuthController.refresh(request, response, db)


@router.post("/logout")
def logout(response: Response):
    return AuthController.logout(response)


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return AuthController.forgot_password(req, db)


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    return AuthController.reset_password(req, db)


@router.post("/update-password")
def update_password(
    req: UpdatePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    return AuthController.update_password(req, current_user, db)
