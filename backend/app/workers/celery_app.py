from celery import Celery
from app.config import settings

# Initialize Celery app
celery_app = Celery(
    "metarouter_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    # Task modules the worker must import on startup (autodiscover only finds `tasks.py` files)
    include=[
        "app.workers.tasks.email_tasks",
        "app.workers.tasks.chat_tasks",
        "app.workers.tasks.whatsapp_tasks",
        "app.workers.tasks.media_tasks",
        "app.workers.tasks.broadcast_tasks",
    ],
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
