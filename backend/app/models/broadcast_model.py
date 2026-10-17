from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Broadcast(Base):
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    phone_number_id = Column(String(64), nullable=False)               # Business number the broadcast is sent from
    template_name = Column(String(255), nullable=False)
    template_language = Column(String(20), nullable=False)
    template_body = Column(Text, nullable=True)                         # Body text with {{1}} placeholders
    variables = Column(JSONB, nullable=True)                            # Values for {{1}}, {{2}} ...
    use_contact_name = Column(Boolean, default=False)                   # {{1}} = each contact's name
    audience_source = Column(String(20), nullable=False)                # customers, contacts
    status = Column(String(20), default="queued", nullable=False)       # queued, sending, completed, failed
    total_input = Column(Integer, default=0)
    duplicates_removed = Column(Integer, default=0)
    skipped_recent = Column(Integer, default=0)
    skipped_opted_out = Column(Integer, default=0)
    skipped_invalid = Column(Integer, default=0)
    queued_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recipients = relationship("BroadcastRecipient", back_populates="broadcast", cascade="all, delete-orphan")


class BroadcastRecipient(Base):
    __tablename__ = "broadcast_recipients"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id", ondelete="CASCADE"), index=True, nullable=False)
    customer_phone = Column(String(50), nullable=False)
    name = Column(String(255), nullable=True)
    status = Column(String(20), default="pending", nullable=False)      # pending, queued, skipped
    skip_reason = Column(String(50), nullable=True)                     # duplicate, invalid, opted_out, recently_messaged
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)

    broadcast = relationship("Broadcast", back_populates="recipients")
    chat_message = relationship("ChatMessage")
