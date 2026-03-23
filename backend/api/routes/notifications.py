from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Optional
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from api.websocket_manager import manager
from db.database import get_db
from model.models import User
from utils.security import SECRET_KEY, ALGORITHM

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
