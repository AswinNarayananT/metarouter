from datetime import timedelta
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
        "app.workers.tasks.maintenance_tasks",
        "app.workers.tasks.knowledge_tasks",
        "app.workers.tasks.ticket_tasks",
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

# Scheduled jobs, run by the celery_beat service (intervals come from .env)
celery_app.conf.beat_schedule = {
    "refresh-whatsapp-numbers": {
        "task": "refresh_whatsapp_numbers_task",
        "schedule": timedelta(minutes=settings.NUMBER_REFRESH_INTERVAL_MINUTES),
    },
    "sweep-stuck-messages": {
        "task": "sweep_stuck_messages_task",
        "schedule": timedelta(minutes=settings.MESSAGE_SWEEP_INTERVAL_MINUTES),
    },
    "resume-due-broadcasts": {
        "task": "resume_due_broadcasts_task",
        "schedule": timedelta(seconds=settings.BROADCAST_CHECK_INTERVAL_SECONDS),
    },
    "close-idle-tickets": {
        "task": "close_idle_tickets_task",
        "schedule": timedelta(minutes=settings.TICKET_SWEEP_INTERVAL_MINUTES),
    },
    "remind-unassigned-chats": {
        "task": "remind_unassigned_chats_task",
        "schedule": timedelta(seconds=settings.UNASSIGNED_REMINDER_CHECK_SECONDS),
    },
    "clean-old-notifications": {
        "task": "clean_old_notifications_task",
        "schedule": timedelta(hours=settings.NOTIFICATION_CLEANUP_INTERVAL_HOURS),
    },
}
