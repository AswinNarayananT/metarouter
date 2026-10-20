from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Notification(Base):
    __tablename__ = "notifications"
    # The bell lists a user's newest notifications and counts the unread ones
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)                      # Who receives it
    type = Column(String(30), nullable=False)                                                                   # handover, assigned
    title = Column(String(255), nullable=False)                                                                 # "A customer needs a human"
    body = Column(Text, nullable=True)                                                                          # Customer name and message preview
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True, index=True)  # Chat it opens
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)                 # Who caused it (None = the AI)
    read_at = Column(DateTime(timezone=True), nullable=True)                                                    # None = unread
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    actor = relationship("User", foreign_keys=[actor_user_id])
