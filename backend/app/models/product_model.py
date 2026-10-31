from sqlalchemy import Column, Integer, String, Text, Numeric, Boolean, DateTime, ForeignKey, Index, CheckConstraint, text
from sqlalchemy.sql import func
from app.database import Base

class Product(Base):
    __tablename__ = "products"
    # A name is unique (any letter case) among the workspace's current products; archived ones free it
    __table_args__ = (
        Index("uq_products_name_current", "organization_id", text("lower(name)"), unique=True, postgresql_where=text("archived_at IS NULL")),
        Index("ix_products_org_category", "organization_id", "category"),
        CheckConstraint("stock_quantity >= 0", name="ck_products_stock_nonnegative"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(60), nullable=True)                                    # Free text: "Beverages"
    price = Column(Numeric(12, 2), nullable=False)                                  # In the workspace's currency
    track_stock = Column(Boolean, nullable=False, default=True, server_default="true")  # False for services / made to order
    stock_quantity = Column(Integer, nullable=False, default=0, server_default="0")   # Kept when tracking is turned off
    low_stock_threshold = Column(Integer, nullable=True)                            # At or below this = low (None = no warning)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")  # For sale
    archived_at = Column(DateTime(timezone=True), nullable=True)                    # Archived instead of deleted; orders keep pointing here
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
