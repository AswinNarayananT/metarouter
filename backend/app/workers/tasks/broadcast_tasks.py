from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.models.ai_chat import ChatMessage, MessageStatus
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.services.broadcast_service import render_body
from app.workers.tasks.chat_tasks import _get_or_create_conversation
from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task

COMMIT_BATCH_SIZE = 200


@celery_app.task(name="process_broadcast_task")
def process_broadcast_task(broadcast_id: int):
    db = SessionLocal()
    try:
        broadcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()

        # 1. Only start a queued broadcast once
        if not broadcast or broadcast.status != "queued":
            return

        broadcast.status = "sending"
        db.commit()

        recipients = db.query(BroadcastRecipient).filter(
            BroadcastRecipient.broadcast_id == broadcast.id,
            BroadcastRecipient.status == "pending"
        ).order_by(BroadcastRecipient.id).all()

        message_ids = []
        for index, recipient in enumerate(recipients):
            # 2. Every recipient gets a conversation so replies and delivery ticks land in the chat
            conversation = _get_or_create_conversation(db, broadcast.organization_id, broadcast.phone_number_id, recipient.customer_phone)

            # {{1}} = the contact's name when chosen, then the admin's values
            parameters = list(broadcast.variables or [])
            if broadcast.use_contact_name:
                parameters = [recipient.name or settings.BROADCAST_DEFAULT_NAME] + parameters

            # 3. Save the template message as pending (sent by the single send task)
            message = ChatMessage(
                conversation_id=conversation.id,
                sender="broadcast",
                message_type="template",
                content=render_body(broadcast.template_body, parameters) or f"[Template: {broadcast.template_name}]",
                template_data={
                    "name": broadcast.template_name,
                    "language": broadcast.template_language,
                    "parameters": parameters
                },
                status=MessageStatus.PENDING
            )
            db.add(message)
            db.flush()

            recipient.chat_message_id = message.id
            recipient.status = "queued"
            message_ids.append(message.id)

            if (index + 1) % COMMIT_BATCH_SIZE == 0:
                db.commit()

        if not message_ids:
            broadcast.status = "completed"
        db.commit()

        # 4. Spread the sends so the number stays under Meta's throughput limit
        for index, message_id in enumerate(message_ids):
            send_whatsapp_message_task.apply_async(args=[message_id], countdown=index // settings.BROADCAST_MESSAGES_PER_SECOND)

        print(f"[BROADCAST] {broadcast.id}: queued {len(message_ids)} messages")

    except Exception as exc:
        db.rollback()
        broadcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()
        if broadcast:
            broadcast.status = "failed"
            broadcast.error = str(exc)[:1000]
            db.commit()
        print(f"[BROADCAST FAILED] {broadcast_id}: {exc}")
        raise

    finally:
        db.close()
