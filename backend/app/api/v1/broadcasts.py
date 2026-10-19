import json
import math
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Form, File, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.whatsapp_model import WhatsAppNumber
from app.models.conversation_model import ChatMessage
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.services.whatsapp_service import get_message_templates, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.services.channel_service import mark_number_disconnected, NUMBER_DISCONNECTED_ERROR
from app.services.broadcast_service import parse_contacts_csv, build_audience, summarize_template, render_body, check_number_quality, tier_capacity
from app.workers.tasks.broadcast_tasks import process_broadcast_task
from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task
from app.models.conversation_model import MessageStatus

router = APIRouter(prefix="/broadcasts", tags=["Broadcasts"])

DELIVERY_STATUSES = ["pending", "sent", "delivered", "read", "failed"]


@router.get("/templates")
def list_templates(phone_number_id: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage broadcasts")

    number = _get_number(db, current_user.organization_id, phone_number_id)

    try:
        templates = get_message_templates(number.waba_id, number.access_token)
    except WhatsAppTokenError as exc:
        mark_number_disconnected(db, number, exc)
        raise HTTPException(status_code=400, detail=NUMBER_DISCONNECTED_ERROR)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not load templates from WhatsApp: {exc}")

    return {"templates": [summarize_template(t) for t in templates]}


@router.post("/preview")
def preview_broadcast(
    phone_number_id: str = Form(...),
    template_name: str = Form(...),
    template_language: str = Form(...),
    variables: str = Form("[]"),
    use_contact_name: bool = Form(False),
    consent_confirmed: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage broadcasts")

    prepared = _prepare_broadcast(db, current_user, phone_number_id, template_name, template_language, variables, use_contact_name, consent_confirmed, file)
    audience = prepared["audience"]

    # Example of the message the first customer will get
    first = next((r for r in audience["recipients"] if r["status"] == "pending"), None)
    sample_parameters = prepared["parameters"]
    if use_contact_name:
        sample_parameters = [(first or {}).get("name") or settings.BROADCAST_DEFAULT_NAME] + sample_parameters

    # Quality decides if it can start; the tier decides how many go out now vs later
    quality = check_number_quality(prepared["number"])
    capacity = tier_capacity(db, prepared["number"])
    send_now = audience["queued_count"] if capacity["remaining"] is None else min(audience["queued_count"], capacity["remaining"])

    return {
        "template": prepared["template"],
        "audience_source": prepared["audience_source"],
        "sample_message": render_body(prepared["template"]["body_text"], sample_parameters),
        "quality_rating": prepared["number"].quality_rating,
        "quality_blocked": quality["blocked"],
        "quality_warning": quality["warning"],
        "messaging_tier": prepared["number"].messaging_tier,
        "tier_limit": capacity["limit"],
        "tier_remaining": capacity["remaining"],
        "send_now_count": send_now,
        "send_later_count": audience["queued_count"] - send_now,
        "tier_resume_at": capacity["resume_at"],
        **_audience_counts(audience)
    }


@router.post("")
def create_broadcast(
    phone_number_id: str = Form(...),
    template_name: str = Form(...),
    template_language: str = Form(...),
    variables: str = Form("[]"),
    use_contact_name: bool = Form(False),
    consent_confirmed: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage broadcasts")

    prepared = _prepare_broadcast(db, current_user, phone_number_id, template_name, template_language, variables, use_contact_name, consent_confirmed, file)
    audience = prepared["audience"]

    # 1. Nothing left to send after filtering
    if audience["queued_count"] == 0:
        raise HTTPException(status_code=400, detail="No customers left to message after removing duplicates, invalid numbers, opted-out customers and customers messaged in the last 7 days")

    # 2. A flagged (RED) number can't start a broadcast; the tier is handled while sending
    quality = check_number_quality(prepared["number"])
    if quality["blocked"]:
        raise HTTPException(status_code=400, detail=quality["warning"])

    # 3. Save the broadcast with every recipient (skipped ones keep their reason)
    broadcast = Broadcast(
        organization_id=current_user.organization_id,
        phone_number_id=phone_number_id,
        template_name=template_name,
        template_language=template_language,
        template_body=prepared["template"]["body_text"],
        variables=prepared["parameters"],
        use_contact_name=use_contact_name,
        audience_source=prepared["audience_source"],
        status="queued",
        total_input=audience["total_input"],
        duplicates_removed=audience["duplicates_removed"],
        skipped_recent=audience["skipped_recent"],
        skipped_opted_out=audience["skipped_opted_out"],
        skipped_invalid=audience["skipped_invalid"],
        queued_count=audience["queued_count"],
        created_by=current_user.id,
        dispatch_token=uuid.uuid4().hex
    )
    broadcast.recipients = [BroadcastRecipient(**recipient) for recipient in audience["recipients"]]
    db.add(broadcast)
    db.commit()

    # 4. Release the messages in batches in the background (quality and tier checked before each batch)
    process_broadcast_task.delay(broadcast_id=broadcast.id, dispatch_token=broadcast.dispatch_token)

    return {
        "id": broadcast.id,
        "status": broadcast.status,
        "message": f"Broadcast queued for {broadcast.queued_count} customers",
        **_audience_counts(audience)
    }


@router.get("")
def list_broadcasts(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage broadcasts")

    query = db.query(Broadcast).filter(Broadcast.organization_id == current_user.organization_id)
    total = query.count()
    broadcasts = query.order_by(Broadcast.created_at.desc(), Broadcast.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    delivery = _delivery_counts(db, [b.id for b in broadcasts])

    return {
        "items": [_serialize_broadcast(b, delivery[b.id]) for b in broadcasts],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size))
    }


@router.get("/{broadcast_id}")
def get_broadcast(
    broadcast_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage broadcasts")

    broadcast = db.query(Broadcast).filter(
        Broadcast.id == broadcast_id,
        Broadcast.organization_id == current_user.organization_id
    ).first()

    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    # Recipients with their delivery status (skipped ones show the reason)
    query = db.query(BroadcastRecipient, ChatMessage).outerjoin(ChatMessage, BroadcastRecipient.chat_message_id == ChatMessage.id).filter(
        BroadcastRecipient.broadcast_id == broadcast.id
    )
    total = query.count()
    rows = query.order_by(BroadcastRecipient.id).offset((page - 1) * page_size).limit(page_size).all()

    return {
        **_serialize_broadcast(broadcast, _delivery_counts(db, [broadcast.id])[broadcast.id]),
        "recipients": {
            "items": [
                {
                    "customer_phone": recipient.customer_phone,
                    "name": recipient.name,
                    "status": message.status.value if message and message.status else recipient.status,
                    "skip_reason": recipient.skip_reason,
                    "error": message.error if message else None
                }
                for recipient, message in rows
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, math.ceil(total / page_size))
        }
    }


@router.post("/{broadcast_id}/resume")
def resume_broadcast(broadcast_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage broadcasts")

    broadcast = db.query(Broadcast).filter(
        Broadcast.id == broadcast_id,
        Broadcast.organization_id == current_user.organization_id
    ).with_for_update().first()

    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if broadcast.status != "paused":
        raise HTTPException(status_code=400, detail="Only a paused broadcast can be resumed")

    # 1. The number must have recovered from a low quality rating
    number = _get_number(db, current_user.organization_id, broadcast.phone_number_id)
    quality = check_number_quality(number)
    if quality["blocked"]:
        raise HTTPException(status_code=400, detail=quality["warning"])

    # 2. Clear the pause; a new token makes any older scheduled run stop
    broadcast.status = "sending"
    broadcast.pause_reason = None
    broadcast.paused_at = None
    broadcast.resume_at = None
    broadcast.dispatch_token = uuid.uuid4().hex
    db.commit()

    # 3. Re-queue messages that were held back, then continue releasing the rest
    held_back = db.query(ChatMessage.id).join(BroadcastRecipient, BroadcastRecipient.chat_message_id == ChatMessage.id).filter(
        BroadcastRecipient.broadcast_id == broadcast.id,
        ChatMessage.status == MessageStatus.PENDING
    ).order_by(ChatMessage.id).all()

    for index, row in enumerate(held_back):
        send_whatsapp_message_task.apply_async(args=[row.id], countdown=index // settings.BROADCAST_MESSAGES_PER_SECOND)

    process_broadcast_task.apply_async(
        kwargs={"broadcast_id": broadcast.id, "dispatch_token": broadcast.dispatch_token},
        countdown=math.ceil(len(held_back) / settings.BROADCAST_MESSAGES_PER_SECOND)
    )

    return {
        "id": broadcast.id,
        "status": broadcast.status,
        "message": f"Broadcast resumed, {len(held_back)} held-back messages re-queued"
    }


def _get_number(db: Session, organization_id: int, phone_number_id: str) -> WhatsAppNumber:
    number = db.query(WhatsAppNumber).filter(
        WhatsAppNumber.organization_id == organization_id,
        WhatsAppNumber.phone_number_id == phone_number_id
    ).first()

    if not number:
        raise HTTPException(status_code=404, detail="WhatsApp number not found for this workspace")

    # Templates, preview, create and resume all need a working token
    if number.status == "disconnected":
        raise HTTPException(status_code=400, detail=NUMBER_DISCONNECTED_ERROR)
    return number


def _prepare_broadcast(db: Session, current_user: User, phone_number_id: str, template_name: str, template_language: str, variables: str, use_contact_name: bool, consent_confirmed: bool, file: Optional[UploadFile]) -> dict:
    # 1. The number must belong to this workspace
    number = _get_number(db, current_user.organization_id, phone_number_id)

    # 2. The template must exist, be approved and be a supported kind
    try:
        templates = get_message_templates(number.waba_id, number.access_token)
    except WhatsAppTokenError as exc:
        mark_number_disconnected(db, number, exc)
        raise HTTPException(status_code=400, detail=NUMBER_DISCONNECTED_ERROR)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not load templates from WhatsApp: {exc}")

    match = next((t for t in templates if t.get("name") == template_name and t.get("language") == template_language), None)
    if not match:
        raise HTTPException(status_code=400, detail="Template not found or not approved for this number")

    template = summarize_template(match)
    if not template["supported"]:
        raise HTTPException(status_code=400, detail=template["unsupported_reason"])

    # 3. Variable values: same for everyone; {{1}} may come from each contact's name
    try:
        parameters = json.loads(variables or "[]")
    except ValueError:
        raise HTTPException(status_code=400, detail="variables must be a JSON list of text values")

    if not isinstance(parameters, list) or not all(isinstance(v, str) for v in parameters):
        raise HTTPException(status_code=400, detail="variables must be a JSON list of text values")

    parameters = [v.strip() for v in parameters]
    # Meta rejects empty values, new lines and tabs inside template variables
    if any(not v or "\n" in v or "\t" in v for v in parameters):
        raise HTTPException(status_code=400, detail="Variable values can't be empty or contain new lines or tabs")

    if use_contact_name and template["variable_count"] == 0:
        raise HTTPException(status_code=400, detail="This template has no {{1}} to fill with the contact's name")

    expected = template["variable_count"] - (1 if use_contact_name else 0)
    if len(parameters) != expected:
        raise HTTPException(status_code=400, detail=f"This template needs {expected} variable value(s), got {len(parameters)}")

    # 4. Audience: uploaded contact list (with consent) or all customers of the company
    contacts = None
    if file and file.filename:
        if not consent_confirmed:
            raise HTTPException(status_code=400, detail="Confirm that the people in the contact list agreed to receive WhatsApp messages from you")
        try:
            contacts = parse_contacts_csv(file.file.read(settings.BROADCAST_MAX_CSV_BYTES + 1))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    audience = build_audience(db, current_user.organization_id, contacts)

    return {
        "number": number,
        "template": template,
        "parameters": parameters,
        "audience_source": "contacts" if contacts is not None else "customers",
        "audience": audience
    }


def _audience_counts(audience: dict) -> dict:
    return {
        "total_input": audience["total_input"],
        "duplicates_removed": audience["duplicates_removed"],
        "skipped_invalid": audience["skipped_invalid"],
        "skipped_opted_out": audience["skipped_opted_out"],
        "skipped_recent": audience["skipped_recent"],
        "queued_count": audience["queued_count"]
    }


def _delivery_counts(db: Session, broadcast_ids: list) -> dict:
    counts = {broadcast_id: {status: 0 for status in DELIVERY_STATUSES} for broadcast_id in broadcast_ids}
    if not broadcast_ids:
        return counts

    rows = db.query(BroadcastRecipient.broadcast_id, ChatMessage.status, func.count(ChatMessage.id)).join(
        ChatMessage, BroadcastRecipient.chat_message_id == ChatMessage.id
    ).filter(BroadcastRecipient.broadcast_id.in_(broadcast_ids)).group_by(BroadcastRecipient.broadcast_id, ChatMessage.status).all()

    for broadcast_id, status, count in rows:
        if status:
            counts[broadcast_id][status.value] = count
    return counts


def _serialize_broadcast(broadcast: Broadcast, delivery: dict) -> dict:
    # Sending is done once every message has left the pending state
    created_messages = sum(delivery.values())
    status = broadcast.status
    if status == "sending" and delivery["pending"] == 0 and created_messages >= broadcast.queued_count:
        status = "completed"

    return {
        "id": broadcast.id,
        "phone_number_id": broadcast.phone_number_id,
        "template_name": broadcast.template_name,
        "template_language": broadcast.template_language,
        "variables": broadcast.variables,
        "use_contact_name": broadcast.use_contact_name,
        "audience_source": broadcast.audience_source,
        "status": status,
        "pause_reason": broadcast.pause_reason if status == "paused" else None,
        "paused_at": broadcast.paused_at if status == "paused" else None,
        "resume_at": broadcast.resume_at if status == "paused" else None,
        "not_released_count": max(broadcast.queued_count - created_messages, 0),  # Waiting for the tier window / resume
        "error": broadcast.error,
        "created_at": broadcast.created_at,
        "total_input": broadcast.total_input,
        "duplicates_removed": broadcast.duplicates_removed,
        "skipped_invalid": broadcast.skipped_invalid,
        "skipped_opted_out": broadcast.skipped_opted_out,
        "skipped_recent": broadcast.skipped_recent,
        "queued_count": broadcast.queued_count,
        "delivery": delivery
    }
