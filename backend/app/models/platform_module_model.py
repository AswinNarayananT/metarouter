from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base

class PlatformModule(Base):
    __tablename__ = "platform_modules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String(50), unique=True, index=True, nullable=False)   # e.g. "orders", "broadcasts", "channels"
    name = Column(String(100), nullable=False)                          # e.g. "Orders & Commerce", "WhatsApp Channels"
    description = Column(Text, nullable=True)                           # Overview of what this module provides
    category = Column(String(50), default="General", index=True)       # e.g. "Core", "Commerce", "Marketing", "AI"
    icon = Column(String(50), default="Box")                            # Lucide icon identifier: "ShoppingBag", "Send", etc.
    is_active = Column(Boolean, default=True, nullable=False)           # Global killswitch for the module
    default_enabled = Column(Boolean, default=False, nullable=False)    # Default state for new organizations
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
