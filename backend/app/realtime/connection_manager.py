import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional
from fastapi import WebSocket
from app.core.chat_visibility import role_chat_visibility, chat_rule_allows

# One WebSocket per browser tab. Every connection joins groups, and events are sent to a group:
#   org:{organization_id}   everyone in the workspace   -> chat list updates
#   conversation:{id}       tabs with that chat open    -> new messages, delivery ticks
#   user:{user_id}          that user's tabs            -> notifications
# Events about one chat carry the chat's status and owner: a member who may not see it gets a "hidden" event instead


# Sent to user:{id}; the sockets in that group are closed right after
SESSION_ENDING_EVENTS = {"member.removed"}
# The admin saved new rules (org:{id}), or a member's role changed (user:{id}, with the new role)
CHAT_VISIBILITY_CHANGED = "chat_visibility.changed"


def hidden_event(event: dict, chat: dict) -> dict:
    # The chat left this member's view: only ids, so the browser can drop it
    if event.get("type") == "ticket.updated":
        return {"type": "ticket.hidden", "data": {"id": event["data"]["id"], "conversation_id": chat["conversation_id"]}}
    return {"type": "conversation.hidden", "data": {"conversation_id": chat["conversation_id"]}}


def org_group(organization_id: int) -> str:
    return f"org:{organization_id}"


def conversation_group(conversation_id: int) -> str:
    return f"conversation:{conversation_id}"


def user_group(user_id: int) -> str:
    return f"user:{user_id}"


@dataclass
class Connection:
    websocket: WebSocket
    user_id: int
    organization_id: int
    role: str
    chat_visibility: str = "assigned"  # This member's rule (see app/core/chat_visibility.py)
    conversation_ids: set = field(default_factory=set)  # Chats this tab has open


class ConnectionManager:
    def __init__(self):
        self.connections: dict[WebSocket, Connection] = {}
        self.groups: dict[str, set] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int, organization_id: int, role: str, chat_visibility: str = "assigned") -> Connection:
        # 1. Accept the socket (the endpoint has already checked the user's ticket)
        await websocket.accept()
        connection = Connection(websocket=websocket, user_id=user_id, organization_id=organization_id, role=role, chat_visibility=chat_visibility)

        # 2. Join the workspace and user groups
        async with self.lock:
            self.connections[websocket] = connection
            self.groups[org_group(organization_id)].add(websocket)
            self.groups[user_group(user_id)].add(websocket)

        return connection

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            connection = self.connections.pop(websocket, None)
            if not connection:
                return

            # Leave every group it joined; drop groups nobody is in anymore
            group_names = [org_group(connection.organization_id), user_group(connection.user_id)]
            group_names += [conversation_group(cid) for cid in connection.conversation_ids]
            for name in group_names:
                members = self.groups.get(name)
                if members is not None:
                    members.discard(websocket)
                    if not members:
                        del self.groups[name]

    async def subscribe_conversation(self, websocket: WebSocket, conversation_id: int):
        # The endpoint checks that the conversation belongs to the user's organization before calling this
        async with self.lock:
            connection = self.connections.get(websocket)
            if not connection:
                return
            connection.conversation_ids.add(conversation_id)
            self.groups[conversation_group(conversation_id)].add(websocket)

    async def unsubscribe_conversation(self, websocket: WebSocket, conversation_id: int):
        async with self.lock:
            connection = self.connections.get(websocket)
            if not connection:
                return
            connection.conversation_ids.discard(conversation_id)
            members = self.groups.get(conversation_group(conversation_id))
            if members is not None:
                members.discard(websocket)
                if not members:
                    del self.groups[conversation_group(conversation_id)]

    async def apply_chat_rules(self, websocket: WebSocket, rules: dict, role: Optional[str]):
        # New rules: from now on this socket follows them; anyone restricted leaves the chats they had open
        connection = self.connections.get(websocket)
        if not connection:
            return
        connection.role = role or connection.role
        connection.chat_visibility = role_chat_visibility(rules, connection.role)
        if connection.chat_visibility != "all":
            for conversation_id in list(connection.conversation_ids):
                await self.unsubscribe_conversation(websocket, conversation_id)

    async def event_for(self, websocket: WebSocket, event: dict, chat: dict) -> dict:
        # The event itself, or "hidden" (and leaving the chat's messages) if this member may not see the chat
        connection = self.connections.get(websocket)
        if connection and not chat_rule_allows(connection.chat_visibility, connection.user_id, chat.get("status"), chat.get("assigned_user_id")):
            await self.unsubscribe_conversation(websocket, chat["conversation_id"])
            return hidden_event(event, chat)
        return event

    async def send_to_group(self, group: str, event: dict, chat: Optional[dict] = None):
        # 1. Copy the members so connects / disconnects during sending don't change the set
        async with self.lock:
            members = list(self.groups.get(group, ()))
        if not members:
            return

        # New rules apply before anything else goes out
        if event.get("type") == CHAT_VISIBILITY_CHANGED:
            for websocket in members:
                await self.apply_chat_rules(websocket, event["data"]["rules"], event["data"].get("role"))

        # 2. Send to everyone at once (what each one is allowed to get); a socket that fails is closed or dead
        events = [await self.event_for(ws, event, chat) if chat else event for ws in members]
        results = await asyncio.gather(*(ws.send_json(e) for ws, e in zip(members, events)), return_exceptions=True)
        for websocket, result in zip(members, results):
            if isinstance(result, Exception):
                await self.disconnect(websocket)

        # 3. Removed from the workspace: their tabs were told, now they stop getting its live events
        if event.get("type") in SESSION_ENDING_EVENTS:
            for websocket in members:
                try:
                    await websocket.close(code=4001)
                except Exception:
                    pass  # Already closed
                await self.disconnect(websocket)

    def connection_count(self) -> int:
        return len(self.connections)


# One manager per backend process; the Redis subscriber hands it events published by Celery tasks and API routes
manager = ConnectionManager()
