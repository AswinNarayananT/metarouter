from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus
from app.models.ticket_model import Ticket, TicketActivity, TicketGroup
from app.realtime.connection_manager import org_group
from app.realtime.events import publish_event
from app.services.conversation_service import as_utc, first_name, record_activity, conversation_payload
from app.services.ticket_ai_service import label_ticket, TicketLabelError

# A ticket = one support session of a chat: it starts with the customer's first message
# and ends when the AI closes it ("anything else?" -> "no"), an agent closes it, or nobody replies for hours.

OPEN_STATUSES = ("ai_handling", "open", "in_progress", "waiting")
STATUS_LABELS = {"ai_handling": "AI handling", "open": "Open", "in_progress": "In progress", "waiting": "Waiting on customer", "closed": "Closed"}
TRANSCRIPT_MESSAGES = 60  # Most recent session messages sent to the AI for labelling


def serialize_group_ref(group: Optional[TicketGroup]) -> Optional[dict]:
    return {"id": group.id, "name": group.name} if group else None


def serialize_ticket(ticket: Ticket) -> dict:
    conversation = ticket.conversation
    return {
        "id": ticket.id,
        "number": ticket.number,
        "conversation_id": ticket.conversation_id,
        "customer_name": conversation.customer_name if conversation else None,
        "customer_phone": conversation.customer_phone if conversation else None,
        "type": ticket.type,
        "group": serialize_group_ref(ticket.group),
        "subgroup": serialize_group_ref(ticket.subgroup),
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "handled_by": ticket.handled_by,
        "assigned_to": {"id": ticket.assigned_user.id, "name": ticket.assigned_user.name} if ticket.assigned_user else None,
        "resolution": ticket.resolution,
        "close_reason": ticket.close_reason,
        "closed_at": as_utc(ticket.closed_at),
        "closed_by": {"id": ticket.closed_by.id, "name": first_name(ticket.closed_by.name)} if ticket.closed_by else None,
        "created_at": as_utc(ticket.created_at),
        "updated_at": as_utc(ticket.updated_at)
    }


def serialize_activity(activity: TicketActivity) -> dict:
    return {
        "id": activity.id,
        "type": activity.type,
        "content": activity.content,
        "user": {"id": activity.user.id, "name": first_name(activity.user.name)} if activity.user else None,
        "created_at": as_utc(activity.created_at)
    }


def publish_ticket(ticket: Ticket):
    # Every open dashboard updates the ticket list / details
    publish_event(org_group(ticket.organization_id), "ticket.updated", serialize_ticket(ticket))


def add_ticket_activity(db: Session, ticket: Ticket, type: str, content: str, user=None):
    db.add(TicketActivity(ticket_id=ticket.id, type=type, content=content, user_id=user.id if user else None))
    db.commit()


def get_open_ticket(db: Session, conversation_id: int) -> Optional[Ticket]:
    return db.query(Ticket).filter(Ticket.conversation_id == conversation_id, Ticket.status.in_(OPEN_STATUSES)).first()


def start_ticket_session(db: Session, conversation: Conversation, first_message_id: Optional[int]) -> Ticket:
    # 1. The chat already has an open ticket: this message belongs to it
    ticket = get_open_ticket(db, conversation.id)
    if ticket:
        return ticket

    # 2. New session: next number in the workspace (retried if two tickets take the same number at once)
    for _ in range(3):
        next_number = (db.query(func.max(Ticket.number)).filter(Ticket.organization_id == conversation.organization_id).scalar() or 0) + 1
        ticket = Ticket(organization_id=conversation.organization_id, number=next_number, conversation_id=conversation.id, first_message_id=first_message_id, assigned_user_id=conversation.assigned_user_id)
        db.add(ticket)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # Another message of this chat opened the session at the same moment
            existing = get_open_ticket(db, conversation.id)
            if existing:
                return existing
            continue
        add_ticket_activity(db, ticket, "created", "Conversation started")
        db.refresh(ticket)
        publish_ticket(ticket)
        return ticket
    raise RuntimeError(f"Could not open a ticket for conversation {conversation.id}")


def session_transcript(db: Session, ticket: Ticket) -> str:
    # Customer / AI / agent messages of this session, oldest first (activity lines left out)
    query = db.query(ChatMessage).filter(ChatMessage.conversation_id == ticket.conversation_id, ChatMessage.sender != "system")
    if ticket.first_message_id:
        query = query.filter(ChatMessage.id >= ticket.first_message_id)
    if ticket.last_message_id:
        query = query.filter(ChatMessage.id <= ticket.last_message_id)
    messages = list(reversed(query.order_by(ChatMessage.id.desc()).limit(TRANSCRIPT_MESSAGES).all()))

    lines = []
    for message in messages:
        if message.sender == "user":
            speaker = "Customer"
        elif message.sender == "human":
            speaker = f"Agent ({first_name(message.sent_by.name)})" if message.sent_by else "Agent"
        else:
            speaker = "AI assistant"
        lines.append(f"{speaker}: {message.content}")
    return "\n".join(lines)


def find_or_create_group(db: Session, organization_id: int, name: str, parent_id: Optional[int]) -> Optional[TicketGroup]:
    # 1. Same name (any capitalisation) already exists: reuse it, following merges to the group that was kept
    name = (name or "").strip()[:120]
    if not name:
        return None
    group = db.query(TicketGroup).filter(
        TicketGroup.organization_id == organization_id,
        TicketGroup.parent_id == parent_id if parent_id else TicketGroup.parent_id.is_(None),
        func.lower(TicketGroup.name) == name.lower()
    ).first()
    while group and group.merged_into_id:
        group = db.get(TicketGroup, group.merged_into_id)
    if group:
        return group

    # 2. New one
    group = TicketGroup(organization_id=organization_id, parent_id=parent_id, name=name)
    db.add(group)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.query(TicketGroup).filter(TicketGroup.organization_id == organization_id, TicketGroup.parent_id == parent_id, TicketGroup.name == name).first()
    return group


def existing_group_pairs(db: Session, organization_id: int) -> list:
    # "Group > Subgroup" pairs the AI should reuse (merged duplicates left out)
    groups = db.query(TicketGroup).filter(TicketGroup.organization_id == organization_id, TicketGroup.merged_into_id.is_(None)).all()
    names = {g.id: g.name for g in groups if g.parent_id is None}
    return sorted((names[g.parent_id], g.name) for g in groups if g.parent_id in names)


def apply_ai_labels(db: Session, ticket: Ticket, include_resolution: bool, relabel_groups: bool = False) -> bool:
    # 1. Ask the AI to file the session (type, group, subgroup, subject, details, resolution)
    transcript = session_transcript(db, ticket)
    if not transcript:
        return False
    try:
        labels = label_ticket(transcript, existing_group_pairs(db, ticket.organization_id))
    except TicketLabelError as e:
        print(f"[TICKET] #{ticket.number}: labelling failed ({e}); keeping the current details")
        return False

    # 2. Type and groups are set once (at escalation or close); relabelling later would split the same problem
    #    into near-duplicate subgroups ("Missing receipt" vs "Receipt not received")
    if not ticket.subgroup_id or relabel_groups:
        group = find_or_create_group(db, ticket.organization_id, labels["group"], None)
        subgroup = find_or_create_group(db, ticket.organization_id, labels["subgroup"], group.id) if group else None
        ticket.type = labels["type"]
        ticket.group_id = group.id if group else None
        ticket.subgroup_id = subgroup.id if subgroup else None
    ticket.subject = (labels["subject"] or ticket.subject)[:255]
    ticket.description = labels["description"] or ticket.description
    if include_resolution and labels["resolution"]:
        ticket.resolution = labels["resolution"]
    db.commit()
    return True


def escalate_ticket(db: Session, conversation: Conversation, user=None) -> Ticket:
    # The AI (or an agent taking over) hands the session to the team: the ticket becomes a team ticket
    ticket = get_open_ticket(db, conversation.id)
    if not ticket:
        last_customer_id = db.query(func.max(ChatMessage.id)).filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender == "user").scalar()
        ticket = start_ticket_session(db, conversation, last_customer_id)

    was_ai = ticket.status == "ai_handling"
    ticket.status = "open" if was_ai else ticket.status
    ticket.handled_by = "human"
    db.commit()

    # Only the AI's escalation fills in the details now (an agent's takeover is labelled when it closes)
    if user is None:
        apply_ai_labels(db, ticket, include_resolution=False)
    if was_ai:
        add_ticket_activity(db, ticket, "escalated", f"{first_name(user.name)} moved it from the AI to the team" if user else "The AI handed this ticket to the team", user)
        record_activity(db, conversation, f"Ticket #{ticket.number} opened for the team", user)
    db.refresh(ticket)
    publish_ticket(ticket)
    return ticket


def sync_ticket_owner(db: Session, conversation: Conversation, user=None):
    # The open ticket follows the chat's owner (assign / reassign / unassign)
    ticket = get_open_ticket(db, conversation.id)
    if not ticket or ticket.assigned_user_id == conversation.assigned_user_id:
        return
    ticket.assigned_user_id = conversation.assigned_user_id
    db.commit()
    db.refresh(ticket)
    owner = ticket.assigned_user
    add_ticket_activity(db, ticket, "assigned", f"Assigned to {first_name(owner.name)}" if owner else "Unassigned", user)
    publish_ticket(ticket)


def mark_ticket_in_progress(db: Session, conversation: Conversation, user):
    # An agent replied: the team ticket is being worked on
    ticket = get_open_ticket(db, conversation.id)
    if not ticket or ticket.status != "open":
        return
    ticket.status = "in_progress"
    db.commit()
    add_ticket_activity(db, ticket, "status", f"{first_name(user.name)} started working on it", user)
    db.refresh(ticket)
    publish_ticket(ticket)


def hand_ticket_back_to_ai(db: Session, conversation: Conversation, user):
    # The agent is done: the AI asks "anything else?" and closes the ticket when the customer says no
    ticket = get_open_ticket(db, conversation.id)
    if not ticket:
        return None
    ticket.status = "ai_handling"
    ticket.assigned_user_id = None
    db.commit()
    add_ticket_activity(db, ticket, "status", f"{first_name(user.name)} handed it back to the AI to finish", user)
    db.refresh(ticket)
    publish_ticket(ticket)
    return ticket


def close_ticket(db: Session, ticket: Ticket, reason: str, user=None, resolution: Optional[str] = None, label_now: bool = True) -> Ticket:
    # 1. The session ends at the chat's latest message
    ticket.last_message_id = db.query(func.max(ChatMessage.id)).filter(ChatMessage.conversation_id == ticket.conversation_id).scalar()
    db.commit()

    # 2. Final labels and resolution from the whole session (an agent's own resolution text wins)
    #    From the dashboard the labelling runs in the background instead, so closing is instant
    if label_now:
        apply_ai_labels(db, ticket, include_resolution=resolution is None)
    if resolution:
        ticket.resolution = resolution
    if reason == "no_reply" and not ticket.resolution:
        ticket.resolution = "Closed: no reply from the customer"
    ticket.status = "closed"
    ticket.close_reason = reason
    ticket.closed_at = datetime.now(timezone.utc)
    ticket.closed_by_user_id = user.id if user else None
    db.commit()
    db.refresh(ticket)

    # 3. Timeline, chat line and live update
    who = {"resolved_by_ai": "the AI", "no_reply": "the system (no reply for a while)"}.get(reason, first_name(user.name) if user else "the team")
    add_ticket_activity(db, ticket, "closed", f"Closed by {who}", user)
    record_activity(db, ticket.conversation, f"Ticket #{ticket.number} closed by {who}", user)
    publish_ticket(ticket)
    return ticket


TYPE_LABELS = {"enquiry": "Enquiry", "problem": "Problem", "complaint": "Complaint"}


def update_ticket(db: Session, ticket: Ticket, changes: dict, user) -> Ticket:
    # 1. Apply only what changed, one timeline line per change
    name = first_name(user.name)
    lines = []
    if "subject" in changes and changes["subject"] and changes["subject"] != ticket.subject:
        ticket.subject = changes["subject"][:255]
        lines.append(("labels", f"{name} changed the subject"))
    if "description" in changes and changes["description"] != ticket.description:
        ticket.description = changes["description"]
        lines.append(("labels", f"{name} updated the details"))
    if "type" in changes and changes["type"] and changes["type"] != ticket.type:
        ticket.type = changes["type"]
        lines.append(("labels", f"{name} set the type to {TYPE_LABELS[ticket.type]}"))
    if "group_id" in changes and changes["group_id"] != ticket.group_id:
        group = db.query(TicketGroup).filter(TicketGroup.id == changes["group_id"], TicketGroup.organization_id == ticket.organization_id, TicketGroup.parent_id.is_(None)).first() if changes["group_id"] else None
        ticket.group_id = group.id if group else None
        ticket.subgroup_id = None  # A subgroup belongs to its group
        lines.append(("labels", f"{name} moved it to {group.name}" if group else f"{name} removed the group"))
    if "subgroup_id" in changes and changes["subgroup_id"] != ticket.subgroup_id:
        subgroup = db.query(TicketGroup).filter(TicketGroup.id == changes["subgroup_id"], TicketGroup.parent_id == ticket.group_id).first() if changes["subgroup_id"] else None
        ticket.subgroup_id = subgroup.id if subgroup else None
        if subgroup:
            lines.append(("labels", f"{name} set the subgroup to {subgroup.name}"))
    if "status" in changes and changes["status"] and changes["status"] != ticket.status and ticket.status != "closed":
        ticket.status = changes["status"]
        lines.append(("status", f"{name} changed status to {STATUS_LABELS[ticket.status]}"))

    if not lines:
        return ticket
    db.commit()
    for type, content in lines:
        add_ticket_activity(db, ticket, type, content, user)
    db.refresh(ticket)
    publish_ticket(ticket)
    return ticket


def add_ticket_note(db: Session, ticket: Ticket, content: str, user) -> TicketActivity:
    # Internal note: for the team only, never sent to the customer
    note = TicketActivity(ticket_id=ticket.id, type="note", content=content, user_id=user.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    publish_ticket(ticket)
    return note


def hand_chat_back_after_close(db: Session, conversation: Conversation, user):
    # Closing a ticket from the dashboard: the AI answers the customer's next message again
    if conversation.status == ConversationStatus.ACTIVE and conversation.assigned_user_id is None:
        return
    conversation.status = ConversationStatus.ACTIVE
    conversation.assigned_user_id = None
    conversation.assigned_at = None
    db.commit()
    record_activity(db, conversation, f"{first_name(user.name)} handed the chat back to the AI", user)
    publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_payload(db, conversation))
