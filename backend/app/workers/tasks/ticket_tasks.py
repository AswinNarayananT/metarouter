from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.models.ticket_model import Ticket
from app.models.organization_model import User
from app.services.conversation_service import first_name
from app.services.ticket_service import apply_ai_labels, add_ticket_activity, publish_ticket


@celery_app.task(name="relabel_ticket_task")
def relabel_ticket_task(ticket_id: int, user_id: int):
    # "Refresh with AI": rewrite subject, details, type and groups from the session's latest messages
    db = SessionLocal()
    try:
        ticket = db.get(Ticket, ticket_id)
        if not ticket:
            return
        if apply_ai_labels(db, ticket, include_resolution=ticket.status == "closed", relabel_groups=True):
            db.refresh(ticket)
            user = db.get(User, user_id)
            add_ticket_activity(db, ticket, "labels", f"The AI refreshed the subject, details and labels (asked by {first_name(user.name) if user else 'a team member'})", user)
        publish_ticket(ticket)
    finally:
        db.close()


@celery_app.task(name="file_closed_ticket_task")
def file_closed_ticket_task(ticket_id: int):
    # A ticket an agent closed before the AI filed it: add the type and groups (the agent's subject / resolution stay)
    db = SessionLocal()
    try:
        ticket = db.get(Ticket, ticket_id)
        if not ticket or ticket.subgroup_id:
            return
        subject, description = ticket.subject, ticket.description
        if apply_ai_labels(db, ticket, include_resolution=False):
            # Keep what the team wrote; only fill the details if they were empty
            if subject and subject != "New conversation":
                ticket.subject = subject
            if description:
                ticket.description = description
            db.commit()
            db.refresh(ticket)
            publish_ticket(ticket)
    finally:
        db.close()
