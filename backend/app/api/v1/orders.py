from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import math
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.order_model import Order, OrderEvent
from app.schemas.order_schema import OrderStatusRequest
from app.services.order_service import serialize_order, serialize_order_event, change_order_status, workspace_currency, OrderError, OrderNotFound, OPEN_ORDER_STATUSES, REASON_STATUSES, STATUS_LABELS
from app.core.features import require_feature

router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
    dependencies=[Depends(require_feature("orders"))]
)


@router.get("")
def list_orders(status: Optional[str] = Query(None, pattern="^(active|all|placed|accepted|out_for_delivery|ready_for_pickup|delivered|picked_up|rejected|cancelled|on_the_way|completed|closed)$"), fulfilment: Optional[str] = Query(None, pattern="^(delivery|pickup)$"), search: Optional[str] = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. The workspace's orders, newest first
    query = db.query(Order).options(selectinload(Order.items)).filter(Order.organization_id == current_user.organization_id)

    # 2. Filters ("active" = the team's work; tabs group the steps that belong together)
    groups = {
        "active": OPEN_ORDER_STATUSES,
        "on_the_way": ("out_for_delivery", "ready_for_pickup"),
        "completed": ("delivered", "picked_up"),
        "closed": ("rejected", "cancelled")
    }
    status = status or "active"
    if status in groups:
        query = query.filter(Order.status.in_(groups[status]))
    elif status != "all":
        query = query.filter(Order.status == status)
    if fulfilment:
        query = query.filter(Order.fulfilment == fulfilment)
    if search and search.strip():
        term = search.strip().lstrip("#")
        digits = "".join(c for c in term if c.isdigit())  # "+91 98470 12345" as the dashboard shows it -> stored digits
        conditions = [Order.customer_name.ilike(f"%{term}%")]
        if digits:
            conditions.append(Order.customer_phone.ilike(f"%{digits}%"))
        if term.isdigit() and len(term) <= 9:  # A phone number is digits too, but too big to be an order number
            conditions.append(Order.number == int(term))
        query = query.filter(or_(*conditions))

    total = query.count()
    orders = query.order_by(Order.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 3. Counts for the status tabs (whole workspace, not the filtered page)
    status_counts = dict(db.query(Order.status, func.count(Order.id)).filter(Order.organization_id == current_user.organization_id).group_by(Order.status).all())

    return {
        "orders": [serialize_order(o) for o in orders],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "status_counts": status_counts,
        "currency": workspace_currency(db, current_user.organization_id)
    }


@router.get("/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Only orders of the user's own workspace
    order = db.query(Order).options(
        selectinload(Order.items),
        selectinload(Order.events).selectinload(OrderEvent.user)
    ).filter(
        Order.id == order_id,
        Order.organization_id == current_user.organization_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "order": serialize_order(order, with_items=True),
        "events": [serialize_order_event(e) for e in order.events]
    }


@router.post("/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Rejecting or cancelling needs a reason (a rejection's reason goes to the customer)
    reason = (payload.reason or "").strip() if payload.status in REASON_STATUSES else None
    if payload.status in REASON_STATUSES and not reason:
        raise HTTPException(status_code=422, detail=f"Add a reason to mark the order {STATUS_LABELS[payload.status].lower()}")

    # 2. Any team member can move an order along; the service checks the step and the stock
    try:
        order, customer_notified = change_order_status(db, order_id, current_user.organization_id, current_user, payload.status, reason)
    except OrderNotFound:
        raise HTTPException(status_code=404, detail="Order not found")
    except OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return {
        "order": serialize_order(order, with_items=True),
        "events": [serialize_order_event(e) for e in order.events],
        "customer_notified": customer_notified
    }
