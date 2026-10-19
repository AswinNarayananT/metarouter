from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey
from app.database import Base

class OrganizationAISettings(Base):
    __tablename__ = "organization_ai_settings"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True)
    bot_name = Column(String(100), default="Support Assistant")
    system_instructions = Column(Text, nullable=True)
    allowed_roles_for_handover = Column(String(255), default="admin,manager") # Comma separated roles
    is_active = Column(Boolean, default=True)
