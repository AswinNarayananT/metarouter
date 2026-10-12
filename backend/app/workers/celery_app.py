from celery import Celery
from app.config import settings

# Initialize Celery app
celery_app = Celery(
    "metarouter_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

# Configure Celery options (timezone, JSON serialization, task tracking)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# Optional: Auto-discover tasks in your workers module if you add more later
celery_app.autodiscover_tasks(["app.workers"])