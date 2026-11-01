from decimal import Decimal
from typing import Optional
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.config import settings
from app.models.conversation_model import Conversation
from app.models.organization_model import Organization, User
from app.models.order_model import Order, OrderItem, OrderEvent, CustomerAddress
from app.models.product_model import Product
from app.realtime.connection_manager import org_group
from app.realtime.events import publish_event
from app.services.conversation_service import as_utc, first_name, last_customer_message_at, reply_window, record_activity
from app.services.messaging_service import queue_outgoing_message
from app.services.product_service import current_products, stock_status
from app.utils.money import format_price


class OrderError(ValueError):
    pass


class OrderNotFound(LookupError):
    pass


# Placed -> Accepted (stock taken) -> Out for delivery -> Delivered, or Ready for pickup -> Picked up; Rejected / Cancelled on the way
STATUS_LABELS = {
    "placed": "New",
    "accepted": "Accepted",
    "out_for_delivery": "Out for delivery",
    "ready_for_pickup": "Ready for pickup",
    "delivered": "Delivered",
    "picked_up": "Picked up",
    "rejected": "Rejected",
    "cancelled": "Cancelled"
}
NEXT_STATUSES = {
    "placed": ("accepted", "rejected", "cancelled"),
    "accepted": ("out_for_delivery", "ready_for_pickup", "cancelled"),
    "out_for_delivery": ("delivered", "cancelled"),
    "ready_for_pickup": ("picked_up", "cancelled")
}
DELIVERY_ONLY = {"out_for_delivery", "delivered"}
PICKUP_ONLY = {"ready_for_pickup", "picked_up"}
OPEN_ORDER_STATUSES = tuple(NEXT_STATUSES)        # The team's work ("Active" tab)
REASON_STATUSES = ("rejected", "cancelled")       # Need a reason (Rejected sends it to the customer)
REASON_MAX_CHARS = 300


def workspace_currency(db: Session, organization_id: int) -> str:
    return db.query(Organization.currency).filter(Organization.id == organization_id).scalar() or "INR"


def price_items(db: Session, organization_id: int, items: list) -> tuple:
    # (product_id, quantity) pairs -> priced lines from today's products, what couldn't be ordered, and the total
    ids = [product_id for product_id, _ in items]
    available = {p.id: p for p in current_products(db, organization_id).filter(Product.is_active.is_(True), Product.id.in_(ids))}
    names = dict(db.query(Product.id, Product.name).filter(Product.organization_id == organization_id, Product.id.in_(ids)).all())

    lines, problems, total = [], [], Decimal("0")
    for product_id, quantity in items:
        product = available.get(product_id)
        if not product:
            problems.append({"product_id": product_id, "name": names.get(product_id, "An item"), "reason": "is no longer available"})
            continue
        if stock_status(product) == "out":
            problems.append({"product_id": product_id, "name": product.name, "reason": "is out of stock"})
            continue
        if product.track_stock and quantity > product.stock_quantity:
            problems.append({"product_id": product_id, "name": product.name, "reason": f"has only {product.stock_quantity} left"})
            quantity = product.stock_quantity
        line_total = product.price * quantity
        lines.append({"product_id": product.id, "name": product.name, "unit_price": product.price, "quantity": quantity, "line_total": line_total})
        total += line_total
    return lines, problems, total


SHARED_LOCATION_LABEL = "Shared location"  # A pin sent without a place name ("Send your current location")
WHERE_MAX_CHARS = 400  # The address part of a message, so the items always get room


def has_pin(address: Optional[dict]) -> bool:
    return bool(address) and address.get("latitude") is not None and address.get("longitude") is not None


def address_label(address: Optional[dict]) -> str:
    # "Flat 4B, near temple, Infopark, Infopark Rd" (house details first, then the pin's place); a bare pin still counts
    if not address:
        return ""
    parts = [p for p in (address.get("address"), address.get("location_name")) if p]
    if not parts and has_pin(address):
        return SHARED_LOCATION_LABEL
    return ", ".join(dict.fromkeys(parts))


def map_link(latitude, longitude) -> str:
    # Plain decimals ("10.0159", "76"), never "1E+1"
    def plain(value) -> str:
        return format(Decimal(str(value)).normalize(), "f")
    return f"https://maps.google.com/?q={plain(latitude)},{plain(longitude)}"


def item_lines_text(lines: list, currency: str, max_chars: int) -> str:
    # "• Tata Salt 1kg × 2: ₹56" per item, as many as fit, then "…and 4 more"
    item_lines = [f"• {line['name']} × {line['quantity']}: {format_price(line['line_total'], currency)}" for line in lines]
    shown, used = [], 0
    for index, text in enumerate(item_lines):
        rest = len(item_lines) - index - 1
        reserve = len(f"\n…and {rest} more") if rest else 0  # Room to say what didn't fit
        if used + len(text) + 1 + reserve > max_chars:
            shown.append(f"…and {len(item_lines) - index} more")
            break
        shown.append(text)
        used += len(text) + 1
    return "\n".join(shown)


def order_details_text(lines: list, total, currency: str, fulfilment: str, address: Optional[dict], max_chars: int) -> str:
    # The block the customer checks before confirming (and gets back once placed), within max_chars
    where = "🏬 Pickup from the store"
    if fulfilment == "delivery":
        link = f"\n📍 {map_link(address['latitude'], address['longitude'])}" if has_pin(address) else ""
        label = address_label(address)
        room = WHERE_MAX_CHARS - len(link) - len("🚚 Delivery to: ")
        where = f"🚚 Delivery to: {label if len(label) <= room else label[:room - 1].rstrip() + '…'}{link}"
    footer = f"Total: {format_price(total, currency)}\n{where}"
    room = max_chars - len("Your order:\n\n") - len(footer)
    return f"Your order:\n{item_lines_text(lines, currency, room)}\n{footer}"


def get_customer_address(db: Session, organization_id: int, customer_phone: str) -> Optional[dict]:
    saved = db.query(CustomerAddress).filter(CustomerAddress.organization_id == organization_id, CustomerAddress.customer_phone == customer_phone).first()
    if not saved:
        return None
    return {
        "address": saved.address,
        "latitude": float(saved.latitude) if saved.latitude is not None else None,
        "longitude": float(saved.longitude) if saved.longitude is not None else None,
        "location_name": saved.location_name
    }


def save_customer_address(db: Session, organization_id: int, customer_phone: str, address: dict):
    # One saved address per customer, replaced by the newest; orders keep their own copy, so old orders never move
    values = {
        "address": address.get("address"),
        "latitude": address.get("latitude"),
        "longitude": address.get("longitude"),
        "location_name": address.get("location_name"),
        "updated_at": func.now()
    }
    db.execute(
        insert(CustomerAddress)
        .values(organization_id=organization_id, customer_phone=customer_phone, **values)
        .on_conflict_do_update(constraint="uq_customer_addresses_org_phone", set_=values)
    )
    db.commit()


def place_order(db: Session, conversation: Conversation, items: list, fulfilment: str, address: Optional[dict]) -> Order:
    # 1. Today's prices and stock (the caller already showed these to the customer)
    lines, _, total = price_items(db, conversation.organization_id, items)
    if not lines:
        raise OrderError("None of the items can be ordered")
    if fulfilment not in ("delivery", "pickup"):
        raise OrderError(f"Unknown fulfilment {fulfilment!r}")
    if fulfilment == "delivery" and not address_label(address):
        raise OrderError("A delivery order needs an address")
    delivery = address if fulfilment == "delivery" else {}

    # 2. Next order number in the workspace (retried if two orders take the same number at once)
    for _ in range(5):
        last = db.query(func.max(Order.number)).filter(Order.organization_id == conversation.organization_id).scalar()
        order = Order(
            number=(last + 1) if last else settings.ORDER_NUMBER_START,
            organization_id=conversation.organization_id,
            conversation_id=conversation.id,
            fulfilment=fulfilment,
            customer_name=conversation.customer_name,
            customer_phone=conversation.customer_phone,
            delivery_address=(delivery.get("address") or delivery.get("location_name") or SHARED_LOCATION_LABEL) if delivery else None,
            delivery_latitude=delivery.get("latitude") if delivery else None,
            delivery_longitude=delivery.get("longitude") if delivery else None,
            delivery_location_name=delivery.get("location_name") if delivery else None,
            currency=workspace_currency(db, conversation.organization_id),
            total=total,
            items=[OrderItem(product_id=line["product_id"], name=line["name"], unit_price=line["unit_price"], quantity=line["quantity"], line_total=line["line_total"]) for line in lines],
            events=[OrderEvent(status="placed")]
        )
        db.add(order)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        db.refresh(order)
        break
    else:
        raise OrderError(f"Could not number an order for conversation {conversation.id}")

    # 3. Delivery: remember the address for next time
    if fulfilment == "delivery":
        save_customer_address(db, conversation.organization_id, conversation.customer_phone, address)
    return order


def allowed_statuses(order: Order) -> tuple:
    # The order's next steps (a pickup order never goes out for delivery, a delivery order is never picked up)
    skip = PICKUP_ONLY if order.fulfilment == "delivery" else DELIVERY_ONLY
    return tuple(s for s in NEXT_STATUSES.get(order.status, ()) if s not in skip)


def serialize_order(order: Order, with_items: bool = False) -> dict:
    pinned = order.delivery_latitude is not None and order.delivery_longitude is not None
    data = {
        "id": order.id,
        "number": order.number,
        "conversation_id": order.conversation_id,
        "status": order.status,
        "next_statuses": list(allowed_statuses(order)),
        "fulfilment": order.fulfilment,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "delivery_address": address_label({"address": order.delivery_address, "location_name": order.delivery_location_name}) or None,
        "map_url": map_link(order.delivery_latitude, order.delivery_longitude) if pinned else None,
        "currency": order.currency,
        "total": f"{order.total:.2f}",
        "item_count": sum(item.quantity for item in order.items),
        "items_summary": item_lines_summary(order.items),
        "created_at": as_utc(order.created_at),
        "updated_at": as_utc(order.updated_at)
    }
    if with_items:
        data["items"] = [
            {"id": item.id, "product_id": item.product_id, "name": item.name, "unit_price": f"{item.unit_price:.2f}", "quantity": item.quantity, "line_total": f"{item.line_total:.2f}"}
            for item in order.items
        ]
    return data


def item_lines_summary(items: list, max_chars: int = 80) -> str:
    # "Tata Salt 1kg × 2, Aashirvaad Atta 5kg × 1" for the list row
    text = ", ".join(f"{item.name} × {item.quantity}" for item in items)
    return text if len(text) <= max_chars else text[:max_chars - 1].rstrip() + "…"


def serialize_order_event(event: OrderEvent) -> dict:
    return {
        "id": event.id,
        "status": event.status,
        "note": event.note,
        "customer_notified": event.customer_notified,
        "user": {"id": event.user.id, "name": first_name(event.user.name)} if event.user else None,
        "created_at": as_utc(event.created_at)
    }


def publish_order(order: Order):
    # Every open Orders page updates the list / details
    publish_event(org_group(order.organization_id), "order.updated", serialize_order(order))


def stock_needed(order: Order) -> dict:
    # product_id -> quantity, for the items whose product still exists
    needed = {}
    for item in order.items:
        if item.product_id:
            needed[item.product_id] = needed.get(item.product_id, 0) + item.quantity
    return needed


def take_stock(db: Session, order: Order):
    # 1. Lock the tracked products in id order (two accepts sharing products can't deadlock); archived ones are skipped
    needed = stock_needed(order)
    products = db.query(Product).filter(
        Product.id.in_(needed),
        Product.organization_id == order.organization_id,
        Product.track_stock.is_(True),
        Product.archived_at.is_(None)
    ).order_by(Product.id).with_for_update().all()

    # 2. All or nothing: one short item blocks the accept and no stock changes
    short = [f"only {p.stock_quantity} left of {p.name} (order needs {needed[p.id]})" for p in products if p.stock_quantity < needed[p.id]]
    if short:
        raise OrderError(f"Not enough stock: {'; '.join(short)}")
    for product in products:
        product.stock_quantity -= needed[product.id]

    # 3. Remember what each item took, so a cancel gives back exactly that
    taken = {p.id for p in products}
    for item in order.items:
        item.stock_taken = item.quantity if item.product_id in taken else 0


def return_stock(db: Session, order: Order):
    # A cancelled order that was accepted: only what Accept took goes back (whatever changed on the product since)
    given = {}
    for item in order.items:
        if item.product_id and item.stock_taken:
            given[item.product_id] = given.get(item.product_id, 0) + item.stock_taken
    products = db.query(Product).filter(
        Product.id.in_(given),
        Product.organization_id == order.organization_id
    ).order_by(Product.id).with_for_update().all()
    for product in products:
        product.stock_quantity += given[product.id]
    for item in order.items:
        item.stock_taken = 0


def customer_message(order: Order, status: str, reason: Optional[str]) -> Optional[str]:
    # Only the key steps message the customer; Delivered, Picked up and Cancelled don't
    number = f"#{order.number}"
    if status == "accepted":
        later = "when it's on the way" if order.fulfilment == "delivery" else "when it's ready to pick up"
        return f"✅ Order {number} is accepted! We'll message you {later}."
    if status == "out_for_delivery":
        return f"🚚 Order {number} is out for delivery. Please keep this number ready."
    if status == "ready_for_pickup":
        return f"🏬 Order {number} is ready to pick up. Show this number at the store."
    if status == "rejected":
        return f"Sorry, we can't take order {number}. Reason: {reason}"
    return None


def change_order_status(db: Session, order_id: int, organization_id: int, user: User, status: str, reason: Optional[str] = None) -> tuple:
    # 1. Lock the order while it changes: two people tapping at once can't both move it (or take the stock twice)
    order = db.query(Order).filter(Order.id == order_id, Order.organization_id == organization_id).with_for_update().first()
    if not order:
        db.rollback()
        raise OrderNotFound(f"Order {order_id} not found")

    # 2. Only the order's next steps
    if status not in allowed_statuses(order):
        current = STATUS_LABELS.get(order.status, order.status).lower()
        message = f"Order #{order.number} is already {current}" if order.status == status or order.status not in NEXT_STATUSES else f"Order #{order.number} is {current}; it can't be marked {STATUS_LABELS.get(status, status).lower()}"
        db.rollback()
        raise OrderError(message)

    # 3. Stock: Accept takes it (all or nothing); cancelling an accepted order gives it back
    try:
        if status == "accepted":
            take_stock(db, order)
            order.stock_taken = True
        elif status == "cancelled" and order.stock_taken:
            return_stock(db, order)
            order.stock_taken = False
    except OrderError:
        db.rollback()
        raise

    # 4. Message the customer only inside WhatsApp's 24-hour window (templates come later)
    text = customer_message(order, status, reason)
    conversation = db.get(Conversation, order.conversation_id) if order.conversation_id else None
    reachable = bool(text and conversation and conversation.phone_number_id and reply_window(last_customer_message_at(db, conversation.id))["window_open"])

    order.status = status
    event = OrderEvent(order_id=order.id, status=status, note=reason, user_id=user.id, customer_notified=reachable if text else None)
    db.add(event)
    db.commit()

    # 5. The message and the chat's activity line (the status change stands whatever happens here)
    if reachable:
        try:
            queue_outgoing_message(db, conversation, sender="human", content=text, sent_by_user_id=user.id)
        except Exception as exc:
            db.rollback()
            event.customer_notified = False
            db.commit()
            print(f"[ORDER] #{order.number} (org {organization_id}) is {status}, but the customer message failed: {exc}")
    if conversation:
        try:
            note = f" ({reason})" if reason else ""
            record_activity(db, conversation, f"{first_name(user.name)} marked order #{order.number} as {STATUS_LABELS[status]}{note}", user)
        except Exception as exc:
            db.rollback()
            print(f"[ORDER] #{order.number} activity line failed: {exc}")

    db.refresh(order)
    publish_order(order)
    return order, event.customer_notified
