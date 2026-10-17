from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.core.encryption import EncryptedText
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class WhatsAppNumber(Base):
    __tablename__ = "whatsapp_numbers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    phone_number_id = Column(String, unique=True, index=True, nullable=False)  # Meta's unique phone number ID
    display_phone_number = Column(String, nullable=False)                    # e.g., +91 98765 43210
    waba_id = Column(String, nullable=False)                                 # WhatsApp Business Account ID
    access_token = Column(EncryptedText, nullable=False)                     # Permanent token from Embedded Signup, encrypted at rest
    quality_rating = Column(String, default="GREEN")                         # GREEN, YELLOW, RED
    messaging_tier = Column(String, default="TIER_1K")                       # TIER_1K, TIER_10K, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="whatsapp_numbers")