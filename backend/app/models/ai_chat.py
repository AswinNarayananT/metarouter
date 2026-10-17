from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
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

class OrganizationAISettings(Base):
    __tablename__ = "organization_ai_settings"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True)
    bot_name = Column(String(100), default="Support Assistant")
    system_instructions = Column(Text, nullable=True)
    allowed_roles_for_handover = Column(String(255), default="admin,manager") # Comma separated roles
    is_active = Column(Boolean, default=True)

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    title = Column(String(255))
    content = Column(Text, nullable=False)
    # Vector column with dimension size matching Gemini embedding model (e.g., 768)
    embedding = Column(Vector(768), nullable=True) 
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
    status = Column(Enum(ConversationStatus), default=ConversationStatus.ACTIVE)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    sender = Column(String(20), nullable=False) # 'user', 'model', 'human' or 'broadcast'
    message_type = Column(String(20), default="text", server_default="text", nullable=False)  # text, template
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
    attachment = relationship("ChatAttachment", back_populates="message", uselist=False, cascade="all, delete-orphan")