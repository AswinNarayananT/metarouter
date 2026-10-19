from sqlalchemy.orm import Session
from app.models.conversation_model import Conversation, ChatMessage
from app.models.attachment_model import ChatAttachment
from app.realtime.connection_manager import org_group, conversation_group
from app.realtime.events import publish_event
from app.services.conversation_service import serialize_message, serialize_attachment, conversation_payload

# What the dashboard receives (same shapes as the REST API):
#   conversation:{id}  message.new           a message was saved (customer, AI, agent)
#                      message.status        delivery tick changed
#                      attachment.updated    media downloaded / parsed / failed
#   org:{id}           conversation.updated  chat list row changed (new message, takeover on/off)
#                      conversation.handover the AI handed a chat to the team
#                      conversations.changed many chats changed at once (broadcast batch): refetch the list
# Live updates are best effort: every function swallows errors so the task that saved the data never fails.


def notify_new_messages(db: Session, messages: list[ChatMessage]):
    try:
        # 1. Each message to the tabs that have its chat open
        for message in messages:
            publish_event(conversation_group(message.conversation_id), "message.new", serialize_message(message))

        # 2. One chat list update per chat
        for conversation_id in dict.fromkeys(m.conversation_id for m in messages):
            conversation = db.get(Conversation, conversation_id)
            if conversation:
                publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_payload(db, conversation))
    except Exception as e:
        print(f"[REALTIME] notify_new_messages failed: {e}")


def notify_message_status(message: ChatMessage):
    # Only tabs with the chat open: a broadcast produces thousands of ticks, which would flood every dashboard
    try:
        data = {"id": message.id, "conversation_id": message.conversation_id, "status": message.status.value if message.status else None, "error": message.error}
        publish_event(conversation_group(message.conversation_id), "message.status", data)
    except Exception as e:
        print(f"[REALTIME] notify_message_status failed: {e}")


def notify_conversation_updated(db: Session, conversation: Conversation):
    try:
        publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_payload(db, conversation))
    except Exception as e:
        print(f"[REALTIME] notify_conversation_updated failed: {e}")


def notify_handover(db: Session, conversation: Conversation):
    try:
        publish_event(org_group(conversation.organization_id), "conversation.handover", conversation_payload(db, conversation))
    except Exception as e:
        print(f"[REALTIME] notify_handover failed: {e}")


def notify_attachment_updated(attachment: ChatAttachment):
    try:
        conversation_id = attachment.message.conversation_id
        publish_event(conversation_group(conversation_id), "attachment.updated", {"message_id": attachment.message_id, "conversation_id": conversation_id, "attachment": serialize_attachment(attachment)})
    except Exception as e:
        print(f"[REALTIME] notify_attachment_updated failed: {e}")


def notify_conversations_changed(organization_id: int, reason: str):
    publish_event(org_group(organization_id), "conversations.changed", {"reason": reason})
