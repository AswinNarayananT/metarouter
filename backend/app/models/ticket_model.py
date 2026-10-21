from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, Index, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class TicketGroup(Base):
    __tablename__ = "ticket_groups"
    # Groups ("Fees & Payments") and their subgroups ("Receipt not received"), built up by the AI and tidied by admins
    __table_args__ = (UniqueConstraint("organization_id", "parent_id", "name", name="uq_ticket_group_name"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("ticket_groups.id", ondelete="CASCADE"), nullable=True)      # None = a group; set = a subgroup of it
    name = Column(String(120), nullable=False)
    merged_into_id = Column(Integer, ForeignKey("ticket_groups.id", ondelete="SET NULL"), nullable=True)  # Merged duplicate -> the one that's kept
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("organization_id", "number", name="uq_ticket_org_number"),
        Index("ix_tickets_org_status", "organization_id", "status"),
        # One open ticket (session) per chat at a time; parallel messages can't start two
        Index("uq_ticket_open_per_conversation", "conversation_id", unique=True, postgresql_where=text("status <> 'closed'")),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    number = Column(Integer, nullable=False)                                    # Shown as #21, counts up per workspace
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(20), nullable=True)                                    # enquiry, problem, complaint (None until the AI labels it)
    group_id = Column(Integer, ForeignKey("ticket_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    subgroup_id = Column(Integer, ForeignKey("ticket_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    subject = Column(String(255), nullable=False, default="New conversation")
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ai_handling")         # ai_handling, open, in_progress, waiting, closed
    handled_by = Column(String(10), nullable=False, default="ai")              # ai, human (a person worked on it at some point)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    resolution = Column(Text, nullable=True)                                    # How it was solved
    close_reason = Column(String(20), nullable=True)                            # resolved_by_ai, closed_by_agent, no_reply
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # None when the AI / timeout closed it
    first_message_id = Column(Integer, nullable=True)                           # Session = chat messages from here ...
    last_message_id = Column(Integer, nullable=True)                            # ... to here (set when closed)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    conversation = relationship("Conversation")
    group = relationship("TicketGroup", foreign_keys=[group_id])
    subgroup = relationship("TicketGroup", foreign_keys=[subgroup_id])
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    closed_by = relationship("User", foreign_keys=[closed_by_user_id])
    activities = relationship("TicketActivity", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketActivity.id")


class TicketActivity(Base):
    __tablename__ = "ticket_activities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # None = the AI / system
    type = Column(String(20), nullable=False)    # created, escalated, status, assigned, labels, note, closed
    content = Column(Text, nullable=False)       # "Aromal changed status to In progress", or the note text
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ticket = relationship("Ticket", back_populates="activities")
    user = relationship("User")
