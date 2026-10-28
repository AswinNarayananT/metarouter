from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index, text
from sqlalchemy.sql import func
from app.database import Base

class QuickReply(Base):
    __tablename__ = "quick_replies"
    # A shortcut is unique within the workspace's shared list, and within each member's personal list
    __table_args__ = (
        Index("uq_quick_replies_shared_shortcut", "organization_id", "shortcut", unique=True, postgresql_where=text("owner_user_id IS NULL")),
        Index("uq_quick_replies_personal_shortcut", "owner_user_id", "shortcut", unique=True, postgresql_where=text("owner_user_id IS NOT NULL")),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)                 # None = shared with the whole team
    shortcut = Column(String(30), nullable=False)                                                               # Typed after "/", lowercase: "refund"
    content = Column(Text, nullable=False)                                                                      # Reply text, may hold {customer_name} etc.
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
