import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from fastapi import WebSocket

# One WebSocket per browser tab. Every connection joins groups, and events are sent to a group:
#   org:{organization_id}   everyone in the workspace   -> chat list updates
#   conversation:{id}       tabs with that chat open    -> new messages, delivery ticks
#   user:{user_id}          that user's tabs            -> notifications


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
    conversation_ids: set = field(default_factory=set)  # Chats this tab has open


class ConnectionManager:
    def __init__(self):
        self.connections: dict[WebSocket, Connection] = {}
        self.groups: dict[str, set] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int, organization_id: int, role: str) -> Connection:
        # 1. Accept the socket (the endpoint has already checked the user's ticket)
        await websocket.accept()
        connection = Connection(websocket=websocket, user_id=user_id, organization_id=organization_id, role=role)

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

    async def send_to_group(self, group: str, event: dict):
        # 1. Copy the members so connects / disconnects during sending don't change the set
        async with self.lock:
            members = list(self.groups.get(group, ()))
        if not members:
            return

        # 2. Send to everyone at once; a socket that fails is closed or dead
        results = await asyncio.gather(*(ws.send_json(event) for ws in members), return_exceptions=True)
        for websocket, result in zip(members, results):
            if isinstance(result, Exception):
                await self.disconnect(websocket)

    def connection_count(self) -> int:
        return len(self.connections)


# One manager per backend process; the Redis subscriber hands it events published by Celery tasks and API routes
manager = ConnectionManager()
