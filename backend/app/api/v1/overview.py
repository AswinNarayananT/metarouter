from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import func, cast, String
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus
from app.models.ticket_model import Ticket, TicketActivity, TicketGroup
from app.models.whatsapp_model import WhatsAppNumber
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.services.conversation_service import as_utc, SUPERVISOR_ROLES

router = APIRouter(prefix="/overview", tags=["Overview"])  # Always available (core)

PERIOD_DAYS = {"today": 1, "7d": 7, "30d": 30}
WAITING_LIST_LIMIT = 10  # "Needs attention" shows the chats waiting longest
TOP_GROUPS_LIMIT = 3


def _naive(value: datetime) -> datetime:
    # Chat message times are stored as UTC without a timezone
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _conversation_count(db: Session, organization_id: int, start: datetime, end: datetime) -> int:
    # Chats where a customer wrote in the window
    return db.query(func.count(func.distinct(ChatMessage.conversation_id))).join(Conversation, Conversation.id == ChatMessage.conversation_id).filter(
        Conversation.organization_id == organization_id,
        ChatMessage.sender == "user",
        ChatMessage.created_at >= _naive(start),
        ChatMessage.created_at < _naive(end)
    ).scalar() or 0


def _ai_share(db: Session, organization_id: int, start: datetime, end: datetime) -> dict:
    # Tickets closed in the window, and how many of them no person had to touch
    closed, by_ai = db.query(func.count(Ticket.id), func.count(Ticket.id).filter(Ticket.handled_by == "ai")).filter(
        Ticket.organization_id == organization_id,
        Ticket.closed_at >= start,
        Ticket.closed_at < end
    ).one()
    return {"closed": closed, "by_ai": by_ai, "percent": round(by_ai * 100 / closed) if closed else None}


def _first_responses(db: Session, organization_id: int, start: datetime, end: datetime) -> list:
    # 1. The AI's handovers in the window (an agent taking over a chat isn't a customer waiting)
    handovers = db.query(Ticket.conversation_id, TicketActivity.created_at).join(Ticket, Ticket.id == TicketActivity.ticket_id).filter(
        Ticket.organization_id == organization_id,
        TicketActivity.type == "escalated",
        TicketActivity.user_id.is_(None),
        TicketActivity.created_at >= start,
        TicketActivity.created_at < end
    ).all()
    if not handovers:
        return []

    # 2. Agent replies in those chats since the window started, oldest first
    replies = db.query(ChatMessage.conversation_id, ChatMessage.created_at, ChatMessage.sent_by_user_id).filter(
        ChatMessage.conversation_id.in_({h.conversation_id for h in handovers}),
        ChatMessage.sender == "human",
        ChatMessage.created_at >= _naive(start)
    ).order_by(ChatMessage.id).all()

    # 3. Each handover -> the first agent reply after it: (who replied, seconds the customer waited); unanswered ones are left out
    responses = []
    for handover in handovers:
        reply = next((r for r in replies if r.conversation_id == handover.conversation_id and as_utc(r.created_at) >= handover.created_at), None)
        if reply:
            responses.append((reply.sent_by_user_id, (as_utc(reply.created_at) - handover.created_at).total_seconds()))
    return responses


def _average(seconds: list):
    return round(sum(seconds) / len(seconds)) if seconds else None


@router.get("/")
def workspace_overview(period: str = Query("today", pattern="^(today|7d|30d)$"), tz: str = Query("UTC", max_length=64), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    org_id = current_user.organization_id
    is_supervisor = current_user.role in SUPERVISOR_ROLES

    # 1. The window in the viewer's timezone ("today" = since their midnight), and the same length just before it
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        zone, tz = ZoneInfo("UTC"), "UTC"
    days = PERIOD_DAYS[period]
    now = datetime.now(timezone.utc)
    local_midnight = now.astimezone(zone).replace(hour=0, minute=0, second=0, microsecond=0)
    start = (local_midnight - timedelta(days=days - 1)).astimezone(timezone.utc)
    previous_start, previous_end = start - timedelta(days=days), now - timedelta(days=days)

    # 2. Headline numbers, each with the previous window to compare
    responses = _first_responses(db, org_id, start, now)
    previous_responses = _first_responses(db, org_id, previous_start, previous_end)
    ai_share = _ai_share(db, org_id, start, now)

    # 3. Escalated chats nobody has taken yet, waiting longest first (since the AI handed them over)
    handed_over_at = db.query(TicketActivity.ticket_id, func.max(TicketActivity.created_at).label("at")).filter(TicketActivity.type == "escalated").group_by(TicketActivity.ticket_id).subquery()
    waiting_rows = db.query(Conversation, handed_over_at.c.at).outerjoin(
        Ticket, (Ticket.conversation_id == Conversation.id) & (Ticket.status != "closed")
    ).outerjoin(
        handed_over_at, handed_over_at.c.ticket_id == Ticket.id
    ).filter(
        Conversation.organization_id == org_id,
        Conversation.status == ConversationStatus.HUMAN_TAKEOVER,
        Conversation.assigned_user_id.is_(None)
    ).all()
    waiting = sorted(
        [{"conversation_id": c.id, "customer_name": c.customer_name, "customer_phone": c.customer_phone, "waiting_since": at or as_utc(c.updated_at)} for c, at in waiting_rows],
        key=lambda w: w["waiting_since"] or now
    )

    # 4. Messages per hour (today) or per day, by who wrote them, bucketed in the viewer's timezone
    unit = "hour" if period == "today" else "day"
    bucket = func.date_trunc(unit, func.timezone(tz, func.timezone("UTC", ChatMessage.created_at))).label("bucket")
    activity_rows = db.query(bucket, ChatMessage.sender, func.count(ChatMessage.id)).join(Conversation, Conversation.id == ChatMessage.conversation_id).filter(
        Conversation.organization_id == org_id,
        ChatMessage.sender.in_(["user", "model", "human"]),
        ChatMessage.created_at >= _naive(start)
    ).group_by(bucket, ChatMessage.sender).all()
    counts = {(row.bucket, row.sender): row[2] for row in activity_rows}
    local_start = start.astimezone(zone).replace(tzinfo=None)
    steps = now.astimezone(zone).hour + 1 if unit == "hour" else days
    buckets = [local_start + (timedelta(hours=i) if unit == "hour" else timedelta(days=i)) for i in range(steps)]

    # 5. Team: open chats now, and replies / closed tickets / first response in the window (service users see only themselves)
    members = db.query(User).filter(User.organization_id == org_id, User.is_active == True).order_by(User.name).all()
    if not is_supervisor:
        members = [m for m in members if m.id == current_user.id]
    open_chats = dict(db.query(Conversation.assigned_user_id, func.count(Conversation.id)).filter(Conversation.organization_id == org_id, Conversation.assigned_user_id.isnot(None)).group_by(Conversation.assigned_user_id).all())
    replies = dict(db.query(ChatMessage.sent_by_user_id, func.count(ChatMessage.id)).join(Conversation, Conversation.id == ChatMessage.conversation_id).filter(
        Conversation.organization_id == org_id,
        ChatMessage.sender == "human",
        ChatMessage.created_at >= _naive(start)
    ).group_by(ChatMessage.sent_by_user_id).all())
    tickets_closed = dict(db.query(Ticket.closed_by_user_id, func.count(Ticket.id)).filter(Ticket.organization_id == org_id, Ticket.closed_at >= start, Ticket.closed_by_user_id.isnot(None)).group_by(Ticket.closed_by_user_id).all())

    # 6. Tickets: open by status now, new / closed in the window, the groups most tickets fell into
    open_by_status = dict(db.query(Ticket.status, func.count(Ticket.id)).filter(Ticket.organization_id == org_id, Ticket.status != "closed").group_by(Ticket.status).all())
    created = db.query(func.count(Ticket.id)).filter(Ticket.organization_id == org_id, Ticket.created_at >= start).scalar() or 0
    top_groups = db.query(TicketGroup.id, TicketGroup.name, func.count(Ticket.id)).join(Ticket, Ticket.group_id == TicketGroup.id).filter(
        Ticket.organization_id == org_id,
        Ticket.created_at >= start
    ).group_by(TicketGroup.id, TicketGroup.name).order_by(func.count(Ticket.id).desc()).limit(TOP_GROUPS_LIMIT).all()

    # 7. Channels: each number's health, and how the latest broadcast went (admins and managers)
    numbers = db.query(WhatsAppNumber).filter(WhatsAppNumber.organization_id == org_id).order_by(WhatsAppNumber.created_at).all()
    latest_broadcast = db.query(Broadcast).filter(Broadcast.organization_id == org_id).order_by(Broadcast.id.desc()).first() if is_supervisor else None
    delivery = {}
    if latest_broadcast:
        delivery = dict(db.query(func.coalesce(func.lower(cast(ChatMessage.status, String)), "pending"), func.count(BroadcastRecipient.id)).outerjoin(
            ChatMessage, ChatMessage.id == BroadcastRecipient.chat_message_id
        ).filter(
            BroadcastRecipient.broadcast_id == latest_broadcast.id,
            BroadcastRecipient.status == "queued"
        ).group_by(1).all())

    return {
        "period": period,
        "timezone": tz,
        "generated_at": now,
        "cards": {
            "conversations": {"value": _conversation_count(db, org_id, start, now), "previous": _conversation_count(db, org_id, previous_start, previous_end)},
            "ai_handled": {**ai_share, "previous_percent": _ai_share(db, org_id, previous_start, previous_end)["percent"]},
            "waiting_now": len(waiting),
            "first_response": {"avg_seconds": _average([s for _, s in responses]), "previous_avg_seconds": _average([s for _, s in previous_responses]), "count": len(responses)}
        },
        "waiting": waiting[:WAITING_LIST_LIMIT],
        "activity": {
            "unit": unit,
            "buckets": [
                {"start": b.isoformat(), "customer": counts.get((b, "user"), 0), "ai": counts.get((b, "model"), 0), "agent": counts.get((b, "human"), 0)}
                for b in buckets
            ]
        },
        "team": [
            {
                "id": m.id,
                "name": m.name,
                "role": m.role,
                "open_chats": open_chats.get(m.id, 0),
                "replies": replies.get(m.id, 0),
                "tickets_closed": tickets_closed.get(m.id, 0),
                "avg_first_response_seconds": _average([s for user_id, s in responses if user_id == m.id])
            }
            for m in members
        ],
        "tickets": {
            "open_by_status": open_by_status,
            "created": created,
            "closed": ai_share["closed"],
            "top_groups": [{"id": g.id, "name": g.name, "count": g[2]} for g in top_groups]
        },
        "channels": {
            "numbers": [
                {"id": n.id, "display_phone_number": n.display_phone_number, "verified_name": n.verified_name, "status": n.status, "quality_rating": n.quality_rating, "messaging_tier": n.messaging_tier}
                for n in numbers
            ],
            "latest_broadcast": {
                "id": latest_broadcast.id,
                "template_name": latest_broadcast.template_name,
                "status": latest_broadcast.status,
                "created_at": latest_broadcast.created_at,
                "delivery": delivery
            } if latest_broadcast else None
        }
    }
