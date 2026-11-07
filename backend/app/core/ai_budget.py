import redis
from app.config import settings
from app.core.redis_client import redis_client


def use_ai_budget(organization_id: int, customer_phone: str) -> bool:
    # Counts one customer message that will use Gemini; False = over this customer's limit for the hour
    key = f"ai-budget:{organization_id}:{customer_phone}"
    try:
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, 3600)
    except redis.RedisError as exc:
        print(f"[AI BUDGET] Redis unavailable, not limiting: {exc}")  # A real customer shouldn't lose their reply over this
        return True
    return count <= settings.AI_MESSAGES_PER_CUSTOMER_PER_HOUR
