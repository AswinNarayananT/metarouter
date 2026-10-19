import asyncio
import json
import redis
import redis.asyncio as aioredis
from app.config import settings
from app.core.redis_client import redis_client
from app.realtime.connection_manager import manager

# Celery workers and API routes can't reach the sockets (they live in the backend processes),
# so they publish events to one Redis channel and every backend process forwards them to its sockets
REALTIME_CHANNEL = "realtime:events"


def publish_event(group: str, event_type: str, data: dict):
    # Sync on purpose: called from Celery tasks and sync routes. Live updates are best effort,
    # so a Redis hiccup must never fail the task that saved the message
    try:
        redis_client.publish(REALTIME_CHANNEL, json.dumps({"group": group, "event": {"type": event_type, "data": data}}, default=str))
    except redis.RedisError as e:
        print(f"[REALTIME] Could not publish {event_type} to {group}: {e}")


async def listen_for_events():
    # Runs for the life of the backend process; reconnects if Redis goes away
    while True:
        client = aioredis.Redis.from_url(settings.REDIS_URL)
        pubsub = client.pubsub()
        try:
            # 1. Subscribe to the shared channel
            await pubsub.subscribe(REALTIME_CHANNEL)

            # 2. Forward every published event to the sockets in its group
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message["data"])
                    await manager.send_to_group(payload["group"], payload["event"])
                except (ValueError, KeyError) as e:
                    print(f"[REALTIME] Dropped malformed event: {e}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[REALTIME] Redis listener stopped ({e}); reconnecting in 2s")
            await asyncio.sleep(2)
        finally:
            await pubsub.aclose()
            await client.aclose()
