from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timedelta, timezone
import math
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.conversation_model import Conversation, ChatMessage
from app.models.ticket_model import Ticket, TicketGroup
from app.schemas.ticket_schema import UpdateTicketRequest, TicketNoteRequest, CloseTicketRequest, AssignTicketRequest, RenameTicketGroupRequest, MergeTicketGroupRequest
from app.services.conversation_service import serialize_message, can_reply, SUPERVISOR_ROLES, ai_auto_reply_on
from app.services.ticket_service import serialize_ticket, serialize_activity, update_ticket, add_ticket_note, close_ticket, hand_chat_back_after_close, release_chat_after_close, OPEN_STATUSES
from app.services.assignment_service import check_assign_permission, assign_owner
from app.workers.tasks.ticket_tasks import relabel_ticket_task, file_closed_ticket_task
from app.core.features import require_feature

router = APIRouter(
    prefix="/tickets",
    tags=["Tickets"],
    dependencies=[Depends(require_feature("customer_chats"))]  # Tickets are part of Customer Chats
)

SESSION_MESSAGES_LIMIT = 200  # Messages of the session shown on the ticket


@router.get("/")
def list_tickets(status: Optional[str] = Query(None, pattern="^(ai_handling|open|in_progress|waiting|closed|active)$"), type: Optional[str] = Query(None, pattern="^(enquiry|problem|complaint)$"), handled_by: Optional[str] = Query(None, pattern="^(ai|human)$"), group_id: Optional[int] = Query(None), subgroup_id: Optional[int] = Query(None), conversation_id: Optional[int] = Query(None), assigned: Optional[str] = Query(None, pattern="^(me)$"), search: Optional[str] = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. The workspace's tickets, newest first
    query = db.query(Ticket).options(
        selectinload(Ticket.conversation),
        selectinload(Ticket.group),
        selectinload(Ticket.subgroup),
        selectinload(Ticket.assigned_user),
        selectinload(Ticket.closed_by)
    ).filter(
        Ticket.organization_id == current_user.organization_id
    )

    # 2. Filters ("active" = the team's work: open, in progress, waiting)
    if status == "active":
        query = query.filter(Ticket.status.in_(["open", "in_progress", "waiting"]))
    elif status:
        query = query.filter(Ticket.status == status)
    if type:
        query = query.filter(Ticket.type == type)
    if handled_by:
        query = query.filter(Ticket.handled_by == handled_by)
    if group_id:
        query = query.filter(Ticket.group_id == group_id)
    if subgroup_id:
        query = query.filter(Ticket.subgroup_id == subgroup_id)
    if conversation_id:
        query = query.filter(Ticket.conversation_id == conversation_id)
    if assigned == "me":
        query = query.filter(Ticket.assigned_user_id == current_user.id)
    if search and search.strip():
        term = search.strip().lstrip("#")
        conditions = [Ticket.subject.ilike(f"%{term}%"), Conversation.customer_name.ilike(f"%{term}%"), Conversation.customer_phone.ilike(f"%{term}%")]
        if term.isdigit():
            conditions.append(Ticket.number == int(term))
        query = query.join(Conversation, Conversation.id == Ticket.conversation_id).filter(or_(*conditions))

    total = query.count()
    tickets = query.order_by(Ticket.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 3. Counts for the status tabs (whole workspace, not the filtered page)
    status_counts = dict(db.query(Ticket.status, func.count(Ticket.id)).filter(Ticket.organization_id == current_user.organization_id).group_by(Ticket.status).all())

    return {
        "tickets": [serialize_ticket(t) for t in tickets],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "status_counts": status_counts
    }


@router.get("/groups")
def list_ticket_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Groups and subgroups the AI has built (merged duplicates left out), with how many tickets each has
    groups = db.query(TicketGroup).filter(
        TicketGroup.organization_id == current_user.organization_id,
        TicketGroup.merged_into_id.is_(None)
    ).order_by(TicketGroup.name).all()

    group_counts = dict(db.query(Ticket.group_id, func.count(Ticket.id)).filter(Ticket.organization_id == current_user.organization_id).group_by(Ticket.group_id).all())
    subgroup_counts = dict(db.query(Ticket.subgroup_id, func.count(Ticket.id)).filter(Ticket.organization_id == current_user.organization_id).group_by(Ticket.subgroup_id).all())

    return {
        "groups": [
            {
                "id": g.id,
                "name": g.name,
                "ticket_count": group_counts.get(g.id, 0),
                "subgroups": [
                    {"id": sg.id, "name": sg.name, "ticket_count": subgroup_counts.get(sg.id, 0)}
                    for sg in groups if sg.parent_id == g.id
                ]
            }
            for g in groups if g.parent_id is None
        ]
    }


@router.get("/insights")
def ticket_insights(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Tickets opened in the period (the base for every number below)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    org_id = current_user.organization_id
    in_period = db.query(Ticket).filter(Ticket.organization_id == org_id, Ticket.created_at >= since)

    # 2. Headline numbers
    total = in_period.count()
    by_type = dict(in_period.with_entities(Ticket.type, func.count(Ticket.id)).group_by(Ticket.type).all())
    closed = in_period.filter(Ticket.status == "closed").count()
    closed_by_ai = in_period.filter(Ticket.close_reason == "resolved_by_ai").count()
    team_tickets = in_period.filter(Ticket.handled_by == "human").count()
    waiting_on_team = db.query(Ticket.id).filter(Ticket.organization_id == org_id, Ticket.status.in_(["open", "in_progress", "waiting"])).count()
    close_hours = dict(in_period.filter(Ticket.status == "closed").with_entities(
        Ticket.handled_by, func.avg(func.extract("epoch", Ticket.closed_at - Ticket.created_at) / 3600)
    ).group_by(Ticket.handled_by).all())

    # 3. Tickets per day (days with none included, so the chart has no gaps)
    per_day = dict(in_period.with_entities(func.date(Ticket.created_at), func.count(Ticket.id)).group_by(func.date(Ticket.created_at)).all())
    daily = []
    for offset in range(days - 1, -1, -1):
        day = (now - timedelta(days=offset)).date()
        daily.append({"date": day.isoformat(), "count": per_day.get(day, 0)})

    # 4. Top problems: subgroups with the most tickets, and how many the AI closed alone
    names = {g.id: g for g in db.query(TicketGroup).filter(TicketGroup.organization_id == org_id).all()}
    subgroup_rows = in_period.filter(Ticket.subgroup_id.isnot(None)).with_entities(
        Ticket.subgroup_id,
        func.count(Ticket.id),
        func.count(Ticket.id).filter(Ticket.type == "complaint"),
        func.count(Ticket.id).filter(Ticket.close_reason == "resolved_by_ai")
    ).group_by(Ticket.subgroup_id).order_by(func.count(Ticket.id).desc()).limit(10).all()
    top_subgroups = [
        {
            "subgroup_id": subgroup_id,
            "subgroup": names[subgroup_id].name,
            "group": names[names[subgroup_id].parent_id].name if names[subgroup_id].parent_id in names else None,
            "count": count,
            "complaints": complaints,
            "closed_by_ai": ai_closed
        }
        for subgroup_id, count, complaints, ai_closed in subgroup_rows if subgroup_id in names
    ]

    # 5. Complaints by group
    complaint_rows = in_period.filter(Ticket.type == "complaint", Ticket.group_id.isnot(None)).with_entities(
        Ticket.group_id, func.count(Ticket.id)
    ).group_by(Ticket.group_id).order_by(func.count(Ticket.id).desc()).limit(10).all()
    complaints_by_group = [{"group_id": group_id, "group": names[group_id].name, "count": count} for group_id, count in complaint_rows if group_id in names]

    # 6. Rising problems: last 7 days against the 7 before (independent of the period)
    week_ago, two_weeks_ago = now - timedelta(days=7), now - timedelta(days=14)
    recent = db.query(Ticket.subgroup_id, func.count(Ticket.id).filter(Ticket.created_at >= week_ago), func.count(Ticket.id).filter(Ticket.created_at < week_ago)).filter(
        Ticket.organization_id == org_id,
        Ticket.subgroup_id.isnot(None),
        Ticket.created_at >= two_weeks_ago
    ).group_by(Ticket.subgroup_id).all()
    rising = sorted(
        [
            {"subgroup_id": sid, "subgroup": names[sid].name, "group": names[names[sid].parent_id].name if names[sid].parent_id in names else None, "this_week": this_week, "last_week": last_week}
            for sid, this_week, last_week in recent if sid in names and this_week >= 2 and this_week > last_week
        ],
        key=lambda r: r["this_week"] - r["last_week"],
        reverse=True
    )[:5]

    # 7. Repeat customers: the same customer with 2+ tickets about the same problem in the period
    repeat_rows = in_period.filter(Ticket.subgroup_id.isnot(None)).with_entities(
        Ticket.conversation_id, Ticket.subgroup_id, func.count(Ticket.id)
    ).group_by(Ticket.conversation_id, Ticket.subgroup_id).having(func.count(Ticket.id) >= 2).order_by(func.count(Ticket.id).desc()).limit(10).all()
    customers = {c.id: c for c in db.query(Conversation).filter(Conversation.id.in_([r[0] for r in repeat_rows])).all()} if repeat_rows else {}
    repeat_customers = [
        {
            "conversation_id": conversation_id,
            "customer_name": customers[conversation_id].customer_name,
            "customer_phone": customers[conversation_id].customer_phone,
            "subgroup": names[subgroup_id].name,
            "count": count
        }
        for conversation_id, subgroup_id, count in repeat_rows if conversation_id in customers and subgroup_id in names
    ]

    return {
        "days": days,
        "totals": {
            "tickets": total,
            "enquiries": by_type.get("enquiry", 0),
            "problems": by_type.get("problem", 0),
            "complaints": by_type.get("complaint", 0),
            "not_filed": by_type.get(None, 0),
            "closed": closed,
            "closed_by_ai": closed_by_ai,
            "team_tickets": team_tickets,
            "waiting_on_team": waiting_on_team,
            "avg_close_hours_ai": round(float(close_hours["ai"]), 1) if close_hours.get("ai") is not None else None,
            "avg_close_hours_team": round(float(close_hours["human"]), 1) if close_hours.get("human") is not None else None
        },
        "daily": daily,
        "top_subgroups": top_subgroups,
        "complaints_by_group": complaints_by_group,
        "rising": rising,
        "repeat_customers": repeat_customers
    }


def _workspace_group(db: Session, group_id: int, organization_id: int) -> TicketGroup:
    group = db.query(TicketGroup).filter(TicketGroup.id == group_id, TicketGroup.organization_id == organization_id, TicketGroup.merged_into_id.is_(None)).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.patch("/groups/{group_id}")
def rename_ticket_group(group_id: int, payload: RenameTicketGroupRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins and managers tidy the list
    if current_user.role not in SUPERVISOR_ROLES:
        raise HTTPException(status_code=403, detail="Only admins and managers can manage ticket groups")
    group = _workspace_group(db, group_id, current_user.organization_id)

    # 2. The name must be free among its siblings (otherwise merge them instead)
    name = payload.name.strip()
    clash = db.query(TicketGroup.id).filter(
        TicketGroup.organization_id == current_user.organization_id,
        TicketGroup.parent_id == group.parent_id if group.parent_id else TicketGroup.parent_id.is_(None),
        TicketGroup.merged_into_id.is_(None),
        TicketGroup.id != group.id,
        func.lower(TicketGroup.name) == name.lower()
    ).first()
    if clash:
        raise HTTPException(status_code=409, detail=f"'{name}' already exists here. Merge the two instead.")

    group.name = name
    db.commit()
    return {"id": group.id, "name": group.name}


@router.post("/groups/{group_id}/merge")
def merge_ticket_group(group_id: int, payload: MergeTicketGroupRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins and managers only; both on the same level (group into group, subgroup into subgroup)
    if current_user.role not in SUPERVISOR_ROLES:
        raise HTTPException(status_code=403, detail="Only admins and managers can manage ticket groups")
    source = _workspace_group(db, group_id, current_user.organization_id)
    target = _workspace_group(db, payload.into_id, current_user.organization_id)

    if source.id == target.id:
        raise HTTPException(status_code=422, detail="Pick a different group to merge into")
    if (source.parent_id is None) != (target.parent_id is None):
        raise HTTPException(status_code=422, detail="Merge a group into a group, or a subgroup into a subgroup")

    if source.parent_id is None:
        # 2a. Group into group: its tickets move, and its subgroups join the target (same-name subgroups are combined)
        db.query(Ticket).filter(Ticket.group_id == source.id).update({Ticket.group_id: target.id}, synchronize_session=False)
        target_subgroups = {sg.name.lower(): sg for sg in db.query(TicketGroup).filter(TicketGroup.parent_id == target.id, TicketGroup.merged_into_id.is_(None)).all()}
        for subgroup in db.query(TicketGroup).filter(TicketGroup.parent_id == source.id, TicketGroup.merged_into_id.is_(None)).all():
            same = target_subgroups.get(subgroup.name.lower())
            if same:
                db.query(Ticket).filter(Ticket.subgroup_id == subgroup.id).update({Ticket.subgroup_id: same.id}, synchronize_session=False)
                subgroup.merged_into_id = same.id
            else:
                subgroup.parent_id = target.id
    else:
        # 2b. Subgroup into subgroup: tickets move to it (and to its group)
        db.query(Ticket).filter(Ticket.subgroup_id == source.id).update({Ticket.subgroup_id: target.id, Ticket.group_id: target.parent_id}, synchronize_session=False)

    # 3. The merged one stays as a pointer, so the AI's future use of the old name lands on the kept one
    source.merged_into_id = target.id
    db.commit()

    return {
        "merged": source.id,
        "into": {"id": target.id, "name": target.name}
    }


@router.get("/{ticket_id}")
def get_ticket(ticket_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Only tickets of the user's own workspace
    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id,
        Ticket.organization_id == current_user.organization_id
    ).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # 2. The session's messages (customer, AI, agents and activity lines)
    query = db.query(ChatMessage).options(selectinload(ChatMessage.attachment)).filter(ChatMessage.conversation_id == ticket.conversation_id)
    if ticket.first_message_id:
        query = query.filter(ChatMessage.id >= ticket.first_message_id)
    if ticket.last_message_id:
        query = query.filter(ChatMessage.id <= ticket.last_message_id)
    messages = list(reversed(query.order_by(ChatMessage.id.desc()).limit(SESSION_MESSAGES_LIMIT).all()))

    return {
        "ticket": serialize_ticket(ticket),
        "activities": [serialize_activity(a) for a in ticket.activities],
        "messages": [serialize_message(m) for m in messages],
        "is_open": ticket.status in OPEN_STATUSES
    }


def _workspace_ticket(db: Session, ticket_id: int, organization_id: int) -> Ticket:
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id, Ticket.organization_id == organization_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


def _require_handler(db: Session, user: User, ticket: Ticket):
    # Same rule as replying in the chat: the owner, a supervisor, or a role that can pick up an unassigned chat
    if not can_reply(db, user, ticket.conversation):
        owner = ticket.conversation.assigned_user
        raise HTTPException(status_code=403, detail=f"Ticket #{ticket.number} is handled by {owner.name}. Ask them or a manager to reassign it." if owner else "Your role can't work on tickets. Ask an admin or manager to assign it to you.")


@router.patch("/{ticket_id}")
def update_ticket_details(ticket_id: int, payload: UpdateTicketRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Ticket of the user's workspace, and allowed to work on it
    ticket = _workspace_ticket(db, ticket_id, current_user.organization_id)
    _require_handler(db, current_user, ticket)

    # 2. Status changes only while it's open (closing has its own step with a resolution)
    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes and ticket.status == "closed":
        raise HTTPException(status_code=422, detail="This ticket is closed")

    ticket = update_ticket(db, ticket, changes, current_user)
    return serialize_ticket(ticket)


@router.post("/{ticket_id}/notes", status_code=201)
def add_note(ticket_id: int, payload: TicketNoteRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Internal notes: any team member can add one (never sent to the customer)
    ticket = _workspace_ticket(db, ticket_id, current_user.organization_id)
    note = add_ticket_note(db, ticket, payload.content.strip(), current_user)
    return serialize_activity(note)


@router.post("/{ticket_id}/close")
def close_ticket_by_agent(ticket_id: int, payload: CloseTicketRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Open ticket of the user's workspace, and allowed to work on it
    ticket = _workspace_ticket(db, ticket_id, current_user.organization_id)
    _require_handler(db, current_user, ticket)

    if ticket.status not in OPEN_STATUSES:
        raise HTTPException(status_code=422, detail="This ticket is already closed")

    # 2. Close with the agent's resolution; the AI still files the type and groups if they're missing
    ticket = close_ticket(db, ticket, "closed_by_agent", current_user, payload.resolution.strip(), label_now=False)
    if not ticket.subgroup_id:
        file_closed_ticket_task.delay(ticket.id)

    # 3. Usually the chat goes back to the AI too (it answers the customer's next message)
    #    AI auto-reply off: no AI to hand it to; the next message reaches the team as a new ticket instead
    if not ai_auto_reply_on(db, current_user.organization_id):
        release_chat_after_close(db, ticket.conversation)
    elif payload.hand_back_to_ai:
        hand_chat_back_after_close(db, ticket.conversation, current_user)

    return serialize_ticket(ticket)


@router.post("/{ticket_id}/relabel", status_code=202)
def relabel_ticket(ticket_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # The AI rewrites subject, details and labels from the latest messages (in the background: it can take a while)
    ticket = _workspace_ticket(db, ticket_id, current_user.organization_id)
    _require_handler(db, current_user, ticket)
    relabel_ticket_task.delay(ticket.id, current_user.id)
    return {"status": "queued"}


@router.patch("/{ticket_id}/assign")
def assign_ticket(ticket_id: int, payload: AssignTicketRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Open ticket of the user's workspace
    ticket = _workspace_ticket(db, ticket_id, current_user.organization_id)
    if ticket.status not in OPEN_STATUSES:
        raise HTTPException(status_code=422, detail="This ticket is closed")

    # 2. Assigning the ticket assigns its chat (one owner for the customer), with the same rules
    conversation = ticket.conversation
    check_assign_permission(db, current_user, conversation, payload.user_id)
    assign_owner(db, conversation, payload.user_id, current_user, ticket=ticket)

    db.refresh(ticket)
    return serialize_ticket(ticket)
