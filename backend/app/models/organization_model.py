from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

DEFAULT_ORGANIZATION_FEATURES = {
    "overview": True,
    "channels": True,
    "ai_assistant": True,
    "customer_chats": True,
    "broadcasts": True,
    "team_members": True,
    "invite_members": True,
    "settings": True,
    "tickets": True,
    "orders": False,
}

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    subscription_status = Column(String, default="active")
    # Only this workspace's overrides ({"orders": true}); every other module follows its platform default
    features = Column(JSONB, nullable=False, default=dict, server_default='{}')
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    profile = relationship("OrganizationProfile", back_populates="organization", uselist=False, cascade="all, delete-orphan")
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    whatsapp_numbers = relationship("WhatsAppNumber", back_populates="organization", cascade="all, delete-orphan")


class OrganizationProfile(Base):
    __tablename__ = "organization_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False)
    support_email = Column(String, nullable=False)
    support_phone = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="profile")


class User(Base):
    __tablename__ = "users"
    # An email belongs to one workspace at a time; a removed member's row is kept (their history stays) and frees the email
    __table_args__ = (
        Index("uq_users_email_current", "email", unique=True, postgresql_where=text("removed_at IS NULL")),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin, manager, service
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    tokens_valid_after = Column(DateTime(timezone=True), nullable=True)
    removed_at = Column(DateTime(timezone=True), nullable=True)  # No longer in the workspace (None = current member)
    removal_type = Column(String(10), nullable=True)  # removed (by an admin) or left (themselves)

    organization = relationship("Organization", back_populates="users")