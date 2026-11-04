from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base

class ChatFlow(Base):
    __tablename__ = "chat_flows"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True)  # One menu per workspace (none = the default menu)
    flow = Column(JSONB, nullable=False)                                            # {"start": node id, "nodes": [...]}, checked by ChatFlowDocument
    known_modules = Column(JSONB, nullable=False, server_default="[]")              # Modules on at any save: a module not listed here joins the menu when it turns on
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
