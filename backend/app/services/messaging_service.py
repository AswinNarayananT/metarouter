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
# WhatsApp interactive message limits
INTERACTIVE_BODY_MAX_CHARS = 1024
MAX_REPLY_BUTTONS = 3
BUTTON_TITLE_MAX_CHARS = 20  # Reply button titles and the list menu button
REPLY_ID_MAX_CHARS = 256
MAX_LIST_ROWS = 10  # In all sections together
ROW_TITLE_MAX_CHARS = 24
ROW_DESCRIPTION_MAX_CHARS = 72
SECTION_TITLE_MAX_CHARS = 24
LIST_ROW_ID_MAX_CHARS = 200


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


def fit(text: str, limit: int) -> str:
    # WhatsApp rejects titles over its limits: cut to fit, ending in "…"
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def queue_interactive_message(db: Session, conversation: Conversation, body: str, buttons: Optional[list] = None, menu: Optional[dict] = None, request_location: bool = False) -> ChatMessage:
    """
    Tap message to the customer: up to 3 reply buttons, a list menu (up to 10 rows) or a "Send location" button.
    Saved as pending like any reply, then sent by the same send task.
    """
    from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task

    # 1. Validate before anything is saved
    if not conversation or not conversation.id or not conversation.phone_number_id:
        raise OutgoingMessageError("The conversation has no WhatsApp number to send from")
    if not isinstance(body, str) or not body.strip() or len(body.strip()) > INTERACTIVE_BODY_MAX_CHARS:
        raise OutgoingMessageError(f"Interactive message text must be 1-{INTERACTIVE_BODY_MAX_CHARS} characters")
    if sum([bool(buttons), bool(menu), request_location]) != 1:
        raise OutgoingMessageError("Send exactly one of buttons, a menu or a location request")

    if buttons:
        if len(buttons) > MAX_REPLY_BUTTONS:
            raise OutgoingMessageError(f"At most {MAX_REPLY_BUTTONS} reply buttons")
        for button in buttons:
            if not button.get("id") or len(button["id"]) > REPLY_ID_MAX_CHARS or not button.get("title") or len(button["title"]) > BUTTON_TITLE_MAX_CHARS:
                raise OutgoingMessageError(f"Invalid button {button!r}")
        template_data = {"buttons": buttons}
    elif menu:
        rows = [row for section in menu.get("sections", []) for row in section.get("rows", [])]
        if not rows or len(rows) > MAX_LIST_ROWS:
            raise OutgoingMessageError(f"A menu needs 1-{MAX_LIST_ROWS} rows")
        if not menu.get("button") or len(menu["button"]) > BUTTON_TITLE_MAX_CHARS:
            raise OutgoingMessageError("Invalid menu button text")
        for section in menu["sections"]:
            if len(section.get("title") or "") > SECTION_TITLE_MAX_CHARS:
                raise OutgoingMessageError(f"Invalid section title {section.get('title')!r}")
        for row in rows:
            if not row.get("id") or len(row["id"]) > LIST_ROW_ID_MAX_CHARS or not row.get("title") or len(row["title"]) > ROW_TITLE_MAX_CHARS or len(row.get("description") or "") > ROW_DESCRIPTION_MAX_CHARS:
                raise OutgoingMessageError(f"Invalid menu row {row!r}")
        template_data = {"menu": menu}
    else:
        template_data = {"location_request": True}

    # 2. Save as pending, then send
    message = ChatMessage(conversation_id=conversation.id, sender="model", message_type="interactive", content=body.strip(), template_data=template_data, status=MessageStatus.PENDING)
    db.add(message)
    db.commit()
    notify_new_messages(db, [message])
    send_whatsapp_message_task.delay(message.id)
    return message


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
