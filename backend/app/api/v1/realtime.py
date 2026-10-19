from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from typing import Optional
import json
import secrets
from app.database import SessionLocal
from app.core.deps import get_current_workspace_user
from app.core.redis_client import redis_client
from app.models.organization_model import User
from app.models.conversation_model import Conversation
from app.realtime.connection_manager import manager

router = APIRouter(prefix="/realtime", tags=["Realtime"])

# Browsers can't send an Authorization header when opening a WebSocket, and a JWT in the URL
# ends up in server logs. So the app asks for a short-lived single-use ticket and opens the socket with it.
TICKET_EXPIRE_SECONDS = 30

# Custom close codes the frontend reacts to
CLOSE_INVALID_TICKET = 4401  # Fetch a new ticket and reconnect


def _conversation_in_org(conversation_id: int, organization_id: int) -> bool:
    # Sync DB check, run in a thread from the async socket loop
    db = SessionLocal()
    try:
        conversation = db.query(Conversation.id).filter(
            Conversation.id == conversation_id,
            Conversation.organization_id == organization_id
        ).first()
        return conversation is not None
    finally:
        db.close()


@router.post("/ticket")
def create_ws_ticket(current_user: User = Depends(get_current_workspace_user)):
    # 1. Random ticket tied to the user, valid for a few seconds
    ticket = secrets.token_urlsafe(32)
    owner = {
        "user_id": current_user.id,
        "organization_id": current_user.organization_id,
        "role": current_user.role
    }
    redis_client.set(f"ws_ticket:{ticket}", json.dumps(owner), ex=TICKET_EXPIRE_SECONDS)

    return {
        "ticket": ticket,
        "expires_in": TICKET_EXPIRE_SECONDS
    }


@router.websocket("/ws")
async def realtime_socket(websocket: WebSocket, ticket: Optional[str] = Query(None)):
    # 1. Redeem the ticket (GETDEL: it can only be used once)
    raw_owner = redis_client.getdel(f"ws_ticket:{ticket}") if ticket else None
    if not raw_owner:
        await websocket.accept()
        await websocket.close(code=CLOSE_INVALID_TICKET, reason="Invalid or expired ticket")
        return
    owner = json.loads(raw_owner)

    # 2. Join the workspace and user groups
    await manager.connect(websocket, owner["user_id"], owner["organization_id"], owner["role"])

    # 3. Handle what the browser sends: open / close a chat, keep-alive pings
    try:
        while True:
            try:
                message = json.loads(await websocket.receive_text())
            except ValueError:
                message = None
            if not isinstance(message, dict):
                await websocket.send_json({"type": "error", "data": {"detail": "Invalid JSON"}})
                continue

            action = message.get("action")
            conversation_id = message.get("conversation_id")

            if action == "ping":
                await websocket.send_json({"type": "pong", "data": {}})

            elif action in ("subscribe", "unsubscribe"):
                if not isinstance(conversation_id, int):
                    await websocket.send_json({"type": "error", "data": {"detail": "conversation_id must be an integer"}})
                    continue

                if action == "unsubscribe":
                    await manager.unsubscribe_conversation(websocket, conversation_id)
                    await websocket.send_json({"type": "unsubscribed", "data": {"conversation_id": conversation_id}})
                    continue

                # Only chats of the user's own workspace
                if not await run_in_threadpool(_conversation_in_org, conversation_id, owner["organization_id"]):
                    await websocket.send_json({"type": "error", "data": {"detail": "Conversation not found", "conversation_id": conversation_id}})
                    continue
                await manager.subscribe_conversation(websocket, conversation_id)
                await websocket.send_json({"type": "subscribed", "data": {"conversation_id": conversation_id}})

            else:
                await websocket.send_json({"type": "error", "data": {"detail": f"Unknown action: {action}"}})

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
