from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class ChatAttachment(Base):
    __tablename__ = "chat_attachments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), unique=True, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    media_id = Column(String(255), nullable=False)                 # Meta media id from the webhook
    kind = Column(String(20), nullable=False)                      # image, document
    mime_type = Column(String(100), nullable=True)
    file_name = Column(String(255), nullable=True)                 # Name the customer sent (display only)
    file_size = Column(Integer, nullable=True)                     # Bytes
    sha256 = Column(String(128), nullable=True)                    # Hash from Meta, checked after download
    storage_path = Column(String(500), nullable=True)              # Relative to MEDIA_STORAGE_PATH
    download_status = Column(String(20), default="pending", nullable=False)  # pending, done, failed
    parse_status = Column(String(20), default="pending", nullable=False)     # pending, parsed, failed, skipped
    document_type = Column(String(100), nullable=True)             # e.g. Tax invoice, Delivery receipt
    confidence = Column(Float, nullable=True)                      # 0 - 1, parser's own estimate
    parsed_data = Column(JSONB, nullable=True)                     # fields, line_items, totals
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    parsed_at = Column(DateTime(timezone=True), nullable=True)

    message = relationship("ChatMessage", back_populates="attachment")
