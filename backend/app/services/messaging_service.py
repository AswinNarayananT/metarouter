from typing import Optional
from celery import chain
from sqlalchemy.orm import Session
from app.models.conversation_model import ChatMessage, Conversation, MessageStatus
from app.realtime.notify import notify_new_messages

# Meta rejects text messages longer than this
WHATSAPP_TEXT_MAX_CHARS = 4096
# Customer-facing replies only; broadcasts are created by the broadcast dispatcher
OUTGOING_SENDERS = {"model", "human"}
# Split long text at the most natural break that fits
SPLIT_SEPARATORS = ["\n\n", "\n", ". ", " "]


class OutgoingMessageError(ValueError):
    pass


def queue_outgoing_message(db: Session, conversation: Conversation, sender: str, content: str, sent_by_user_id: Optional[int] = None) -> list[ChatMessage]:
    """
    Single entry point for every message we send to a customer (AI replies, agent replies,
    handover notices). Saves it as pending, then hands delivery to the send task.
    """
    # Imported here to avoid a circular import (tasks import services)
    from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task

    # 1. Validate before anything is saved, so a bad payload never reaches Meta
    if sender not in OUTGOING_SENDERS:
        raise OutgoingMessageError(f"Sender must be one of {sorted(OUTGOING_SENDERS)}, got {sender!r}")

    if not conversation or not conversation.id or not conversation.phone_number_id:
        raise OutgoingMessageError("The conversation has no WhatsApp number to send from")

    if not isinstance(content, str) or not content.strip():
        raise OutgoingMessageError("Message text can't be empty")

    # 2. Longer than WhatsApp allows: send it as several messages, in order
    parts = split_text(content.strip(), WHATSAPP_TEXT_MAX_CHARS)

    messages = []
    for part in parts:
        message = ChatMessage(conversation_id=conversation.id, sender=sender, content=part, status=MessageStatus.PENDING, sent_by_user_id=sent_by_user_id)
        db.add(message)
        messages.append(message)

    # Commit before queueing so the worker can always find the rows
    db.commit()

    # Show them in the dashboard right away as pending (ticks follow as Meta reports delivery)
    notify_new_messages(db, messages)

    # 3. One part: send now; several: a chain so they arrive in order
    if len(messages) == 1:
        send_whatsapp_message_task.delay(messages[0].id)
    else:
        chain(*[send_whatsapp_message_task.si(m.id) for m in messages]).delay()

    return messages


def split_text(text: str, limit: int) -> list[str]:
    parts = []

    while len(text) > limit:
        # 1. Last natural break inside the limit (paragraph, line, sentence, word)
        cut = -1
        for separator in SPLIT_SEPARATORS:
            index = text.rfind(separator, 0, limit)
            if index > 0:
                cut = index + len(separator)
                break

        # 2. No break at all (one very long word): hard cut
        if cut <= 0:
            cut = limit

        part = text[:cut].strip()
        if part:
            parts.append(part)
        text = text[cut:].strip()

    if text:
        parts.append(text)
    return parts
