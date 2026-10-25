from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime, timezone
import enum
from app.database import Base

class ConversationStatus(str, enum.Enum):
    ACTIVE = "active"
    HUMAN_TAKEOVER = "human_takeover"

class MessageStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"

class Conversation(Base):
    __tablename__ = "conversations"
    # One conversation per customer per business number (an org can connect several WhatsApp numbers)
    __table_args__ = (
        UniqueConstraint("organization_id", "phone_number_id", "customer_phone", name="uq_conversation_org_number_customer"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    # Meta phone_number_id of the business number this chat is on; replies are sent from it
    phone_number_id = Column(String(64), nullable=True, index=True)
    customer_phone = Column(String(50), nullable=False, index=True)
    # Name the customer set in WhatsApp (webhook contacts.profile.name); a broadcast contact list name until they reply
    customer_name = Column(String(255), nullable=True)
    # WhatsApp business-scoped user id (BSUID); stays the same if the customer switches to a username and hides their number
    customer_wa_user_id = Column(String(160), nullable=True, index=True)
    # Click-to-WhatsApp ad the customer came from (first message only): headline, body, source_url, source_type, ctwa_clid ...
    ad_referral = Column(JSONB, nullable=True)
    status = Column(Enum(ConversationStatus), default=ConversationStatus.ACTIVE)
    # Team member responsible for the chat (None = unassigned queue); cleared when the chat goes back to the AI
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan")
    assigned_user = relationship("User")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    sender = Column(String(20), nullable=False) # 'user', 'model', 'human', 'broadcast' or 'system' (activity: assigned, taken over ...)
    message_type = Column(String(20), default="text", server_default="text", nullable=False)  # text, template, image, document, audio, video, sticker, location, event (system activity)
    # Emoji the customer reacted to this message with (WhatsApp reaction); None = no reaction
    reaction = Column(String(32), nullable=True)
    # Team member who wrote an agent reply or caused an activity entry
    sent_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    template_data = Column(JSONB, nullable=True)  # name, language, body parameters (template messages only)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # WhatsApp message id: matches Meta's delivery updates to outgoing messages and
    # de-duplicates re-delivered incoming webhooks
    wamid = Column(String(255), nullable=True, unique=True)
    # Delivery state of outgoing messages (null for incoming customer messages)
    status = Column(Enum(MessageStatus), nullable=True)
    # Meta's error code and message when sending failed
    error = Column(Text, nullable=True)

    conversation = relationship("Conversation", back_populates="messages")
    sent_by = relationship("User")
    attachment = relationship("ChatAttachment", back_populates="message", uselist=False, cascade="all, delete-orphan")

class ConversationRead(Base):
    __tablename__ = "conversation_reads"
    # Each team member's own read marker per chat: unread = customer messages newer than it
    __table_args__ = (
        UniqueConstraint("user_id", "conversation_id", name="uq_conversation_read_user_conversation"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    last_read_message_id = Column(Integer, nullable=False, default=0)  # Newest message the user has seen
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
