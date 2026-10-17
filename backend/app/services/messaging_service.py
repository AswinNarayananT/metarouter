from sqlalchemy.orm import Session
from app.models.ai_chat import ChatMessage, Conversation, MessageStatus


def queue_outgoing_message(db: Session, conversation: Conversation, sender: str, content: str) -> ChatMessage:
    """
    Single entry point for every message we send to a customer (AI replies, agent replies,
    handover notices). Saves it as pending, then hands delivery to the send task.
    """
    # Imported here to avoid a circular import (tasks import services)
    from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task

    message = ChatMessage(
        conversation_id=conversation.id,
        sender=sender,
        content=content,
        status=MessageStatus.PENDING,
    )
    db.add(message)
    # Commit before queueing so the worker can always find the row
    db.commit()
    db.refresh(message)

    send_whatsapp_message_task.delay(message.id)
    return message
