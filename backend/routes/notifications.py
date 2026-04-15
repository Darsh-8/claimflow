from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Optional, List
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from utils.websocket_manager import manager
from config.database import get_db
from models.models import User, Notification
from utils.security import SECRET_KEY, ALGORITHM, get_current_user

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])

async def get_ws_user(websocket: WebSocket, db: Session) -> Optional[User]:
    # Check cookie first
    token = None
    print(f"WS Cookies received: {websocket.cookies}")
    cookie_token = websocket.cookies.get("access_token")
    if cookie_token and cookie_token.startswith("Bearer "):
        token = cookie_token.split(" ")[1]
        
    # Allow query param for easier testing
    if not token and "token" in websocket.query_params:
        token = websocket.query_params.get("token")
        
    if not token:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type")
        if username is None or token_type != "access":
            return None
    except JWTError:
        return None

    user = db.query(User).filter(User.username == username).first()
    return user

@router.get("/")
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return up to 50 most recent notifications for the current user."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": n.id,
            "type": n.type,
            "message": n.message,
            "claim_id": n.claim_id,
            "extra_data": n.extra_data,
            "read": n.read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifs
    ]


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.read = True
        db.commit()
    return {"ok": True}


@router.patch("/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False  # noqa: E712
    ).update({"read": True})
    db.commit()
    return {"ok": True}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    user = await get_ws_user(websocket, db)
    if not user:
        await websocket.close(code=1008)
        return

    user_id = str(user.id)
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection open. We don't listen to client messages.
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
