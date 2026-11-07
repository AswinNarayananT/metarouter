from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from typing import Optional
import asyncio
import json
import secrets
import time
from app.config import settings
from app.database import SessionLocal
from app.core.deps import get_current_workspace_user, oauth2_scheme, token_issued_after_reset
from app.core.redis_client import redis_client
from app.core.security import decode_access_token
from app.core.token_blacklist import is_token_revoked
from app.models.admin_model import SuperAdmin
from app.models.organization_model import Organization, User
from app.models.conversation_model import Conversation
from app.realtime.connection_manager import manager
from app.services.conversation_service import can_see_chat, chat_visibility_for

router = APIRouter(prefix="/realtime", tags=["Realtime"])

# Browsers can't send an Authorization header when opening a WebSocket, and a JWT in the URL
# ends up in server logs. So the app asks for a short-lived single-use ticket and opens the socket with it.
TICKET_EXPIRE_SECONDS = 30

# Custom close codes the frontend reacts to
CLOSE_INVALID_TICKET = 4401  # Fetch a new ticket and reconnect (an ended session can't get one)

# What the ticket keeps from the access token, so the socket can tell when that session ends
SESSION_CLAIMS = ("jti", "family", "iat", "exp", "token_version", "impersonated_by", "impersonated_by_version")


def _session_valid(owner: dict) -> bool:
    # The same rules as get_current_workspace_user, for a connection that outlives any single request
    db = SessionLocal()
    try:
        # 1. Logged out
        if is_token_revoked(owner):
            return False

        # 2. A support session keeps its time limit, and ends with the super admin's password
        if owner.get("impersonated_by") is not None:
            admin_version = db.query(SuperAdmin.token_version).filter(SuperAdmin.id == owner["impersonated_by"]).scalar()
            if owner["exp"] <= time.time() or admin_version is None or owner.get("impersonated_by_version", 0) != admin_version:
                return False

        # 3. Still a member (not removed, password unchanged) of a workspace that isn't suspended
        user = db.query(User).filter(User.id == owner["user_id"], User.organization_id == owner["organization_id"]).first()
        workspace_status = db.query(Organization.subscription_status).filter(Organization.id == owner["organization_id"]).scalar()
        return bool(user and user.is_active and not user.removed_at and token_issued_after_reset(owner, user) and workspace_status == "active")
    except HTTPException:
        return False  # Redis down: refuse rather than accept a session that might have been revoked; the browser reconnects
    finally:
        db.close()


async def _end_socket(websocket: WebSocket):
    # Out of every group first, so no event reaches it while it closes
    await manager.disconnect(websocket)
    await websocket.close(code=CLOSE_INVALID_TICKET, reason="Session ended")


async def _watch_session(websocket: WebSocket, owner: dict):
    # The server checks by itself: a client that stops sending pings is still caught
    while True:
        await asyncio.sleep(settings.WS_SESSION_CHECK_SECONDS)
        if not await run_in_threadpool(_session_valid, owner):
            await _end_socket(websocket)
            return


def _member_can_see_chat(conversation_id: int, user_id: int) -> bool:
    # Sync DB check, run in a thread from the async socket loop
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        return bool(user and conversation and can_see_chat(db, user, conversation))
    finally:
        db.close()


def _member_chat_visibility(user_id: int) -> str:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        return chat_visibility_for(db, user) if user else "assigned"
    finally:
        db.close()


@router.post("/ticket")
def create_ws_ticket(token: str = Depends(oauth2_scheme), current_user: User = Depends(get_current_workspace_user)):
    # 1. Random ticket tied to the user and this session, valid for a few seconds
    ticket = secrets.token_urlsafe(32)
    claims = decode_access_token(token)
    owner = {
        "user_id": current_user.id,
        "organization_id": current_user.organization_id,
        "role": current_user.role,
        **{key: claims[key] for key in SESSION_CLAIMS if key in claims}
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
    owner = json.loads(raw_owner) if raw_owner else None

    # The member may have been removed, or logged out, since the ticket was issued
    if not owner or not await run_in_threadpool(_session_valid, owner):
        await websocket.accept()
        await websocket.close(code=CLOSE_INVALID_TICKET, reason="Invalid or expired ticket")
        return

    # 2. Join the workspace and user groups
    chat_visibility = await run_in_threadpool(_member_chat_visibility, owner["user_id"])
    await manager.connect(websocket, owner["user_id"], owner["organization_id"], owner["role"], chat_visibility)
    session_watch = asyncio.create_task(_watch_session(websocket, owner))

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

                if not await run_in_threadpool(_session_valid, owner):
                    await _end_socket(websocket)
                    return

                # Only chats of the user's own workspace that they may see
                if not await run_in_threadpool(_member_can_see_chat, conversation_id, owner["user_id"]):
                    await websocket.send_json({"type": "error", "data": {"detail": "Conversation not found", "conversation_id": conversation_id}})
                    continue
                await manager.subscribe_conversation(websocket, conversation_id)
                await websocket.send_json({"type": "subscribed", "data": {"conversation_id": conversation_id}})

            else:
                await websocket.send_json({"type": "error", "data": {"detail": f"Unknown action: {action}"}})

    except WebSocketDisconnect:
        pass
    finally:
        session_watch.cancel()
        await manager.disconnect(websocket)
