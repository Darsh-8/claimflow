from datetime import timedelta
from fastapi import HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from model.models import User, PasswordResetToken
from dto.schemas import ForgotPasswordRequest, ResetPasswordRequest, UpdatePasswordRequest
from utils.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
import secrets
from datetime import datetime, timezone


class AuthController:
    """Controller handles business logic for authentication following MVC and Early Return patterns."""

    @staticmethod
    def login(response: Response, form_data: OAuth2PasswordRequestForm, db: Session):
        user = db.query(User).filter(
            User.username == form_data.username).first()

        # Early Return
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, "role": user.role.value},
            expires_delta=access_token_expires
        )
        refresh_token = create_refresh_token(
            data={"sub": user.username, "role": user.role.value}
        )

        response.set_cookie(
            key="access_token",
            value=f"Bearer {access_token}",
            httponly=False,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            samesite="lax",
            max_age=60 * 60 * 24 * 7  # 7 days
        )

        return {
            "user": {
                "username": user.username,
                "role": user.role.value
            }
        }

    @staticmethod
    def refresh(request: Request, response: Response, db: Session):
        refresh_token = request.cookies.get("refresh_token")

        # Early Return
        if not refresh_token:
            raise HTTPException(
                status_code=401, detail="Refresh token missing")

        username = verify_refresh_token(refresh_token)
        user = db.query(User).filter(User.username == username).first()

        # Early Return
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, "role": user.role.value},
            expires_delta=access_token_expires
        )

        response.set_cookie(
            key="access_token",
            value=f"Bearer {access_token}",
            httponly=False,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

        return {"message": "Token refreshed"}

    @staticmethod
    def logout(response: Response):
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")
        return {"message": "Logged out successfully"}

    @staticmethod
    def forgot_password(req: ForgotPasswordRequest, db: Session):
        user = db.query(User).filter(User.username == req.username).first()

        if not user:
            # Return success to avoid user enumeration
            return {"message": "If the username exists, a password reset link has been generated."}

        # Generate token
        reset_token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)

        # Save token
        token_record = PasswordResetToken(
            user_id=user.id,
            token=reset_token,
            expires_at=expires
        )
        db.add(token_record)
        db.commit()

        # For MVP, we return the token in the response so it can be tested easily.
        # In production this would trigger an email/SMS.
        return {
            "message": "If the username exists, a password reset link has been generated.",
            "reset_token": reset_token  # Exposing for MVP testing only
        }

    @staticmethod
    def reset_password(req: ResetPasswordRequest, db: Session):
        token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token == req.token
        ).first()

        if not token_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        # Make DB datetime timezone-aware if it is naive (SQLite behavior)
        expires = token_record.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)

        if expires < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        user = token_record.user
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        # Update password
        user.hashed_password = get_password_hash(req.new_password)

        # Invalidate token
        db.delete(token_record)
        db.commit()

        return {"message": "Password has been reset successfully."}

    @staticmethod
    def update_password(req: UpdatePasswordRequest, current_user: User, db: Session):
        if not verify_password(req.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password"
            )

        current_user.hashed_password = get_password_hash(req.new_password)
        db.commit()

        return {"message": "Password updated successfully."}
