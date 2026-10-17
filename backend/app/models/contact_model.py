from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base

class ContactOptOut(Base):
    __tablename__ = "contact_opt_outs"
    # A customer who opts out is excluded from every broadcast of the organization
    __table_args__ = (UniqueConstraint("organization_id", "customer_phone", name="uq_opt_out_org_customer"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    customer_phone = Column(String(50), nullable=False)
    source = Column(String(50), default="keyword")  # keyword (customer replied STOP), admin
    opted_out_at = Column(DateTime(timezone=True), server_default=func.now())
