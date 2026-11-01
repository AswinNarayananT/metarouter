import uuid
from sqlalchemy import Column, Integer, String, Text, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("organization_id", "number", name="uq_orders_org_number"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    uid = Column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4)  # Backend reference; never shown to customers
    number = Column(Integer, nullable=False)                                          # "Order #1023": shown to the customer, delivery and pickup staff
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(30), nullable=False, default="placed", server_default="placed")  # placed, accepted, out_for_delivery, ready_for_pickup, delivered, picked_up, rejected, cancelled
    fulfilment = Column(String(20), nullable=False)                                   # delivery / pickup
    stock_taken = Column(Boolean, nullable=False, default=False, server_default="false")  # Accept reduced the stock (a cancel gives it back)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=False)
    # Where it goes (delivery only): this order's own copy, so a later change to the customer's saved address never moves it
    delivery_address = Column(Text, nullable=True)
    delivery_latitude = Column(Numeric(9, 6), nullable=True)
    delivery_longitude = Column(Numeric(9, 6), nullable=True)
    delivery_location_name = Column(String(255), nullable=True)
    currency = Column(String(3), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id")
    events = relationship("OrderEvent", back_populates="order", cascade="all, delete-orphan", order_by="OrderEvent.id")

class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(120), nullable=False)          # As it was when ordered
    unit_price = Column(Numeric(12, 2), nullable=False)  # As it was when ordered
    quantity = Column(Integer, nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)
    stock_taken = Column(Integer, nullable=False, default=0, server_default="0")  # Units Accept took from the product (a cancel gives back exactly these)

    order = relationship("Order", back_populates="items")

class OrderEvent(Base):
    __tablename__ = "order_events"
    # The order's history: placed, then each status change (who, when, why, and whether the customer was messaged)

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(30), nullable=False)                                          # The status it moved to
    note = Column(Text, nullable=True)                                                   # Reject / cancel reason
    customer_notified = Column(Boolean, nullable=True)                                   # WhatsApp update sent (None = this step sends none; False = window closed / no chat)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Team member (None = the customer, in chat)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="events")
    user = relationship("User")

class CustomerAddress(Base):
    __tablename__ = "customer_addresses"
    # The customer's saved delivery location, only offered again on the next order ("Same address / New address")
    __table_args__ = (
        UniqueConstraint("organization_id", "customer_phone", name="uq_customer_addresses_org_phone"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_phone = Column(String(50), nullable=False)
    address = Column(Text, nullable=True)                # Typed address, or house / flat details with a pin
    latitude = Column(Numeric(9, 6), nullable=True)
    longitude = Column(Numeric(9, 6), nullable=True)
    location_name = Column(String(255), nullable=True)   # Place name / address WhatsApp sends with a pin
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
