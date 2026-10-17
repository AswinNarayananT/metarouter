import redis
from app.config import settings

# Shared Redis connection (same instance Celery uses as broker) for locks and small state
redis_client = redis.Redis.from_url(settings.REDIS_URL)
