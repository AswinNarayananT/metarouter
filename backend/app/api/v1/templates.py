from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.core.deps import get_current_workspace_user
from app.core.features import require_feature
from app.database import get_db
from app.models.broadcast_model import Broadcast
from app.models.organization_model import User
from app.models.whatsapp_model import WhatsAppNumber
from app.schemas.template_schema import TemplateCreate, APP_TEMPLATE_PREFIX
from app.services.audit_service import record_audit_log, get_client_ip
from app.services.broadcast_service import summarize_template
from app.services.channel_service import get_workspace_number, mark_number_disconnected, NUMBER_DISCONNECTED_ERROR
from app.services.whatsapp_service import create_message_template, delete_message_template, get_message_templates, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError

# Templates live on each workspace's own WhatsApp Business account: Meta holds them and their approval status
router = APIRouter(prefix="/templates", tags=["Templates"], dependencies=[Depends(require_feature("broadcasts"))])

UNFINISHED_BROADCAST_STATUSES = ["queued", "sending", "paused"]


def _require_admin(current_user: User):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage templates")


def _token_lost(db: Session, number: WhatsAppNumber, exc: WhatsAppTokenError) -> HTTPException:
    mark_number_disconnected(db, number, exc)
    return HTTPException(status_code=400, detail=NUMBER_DISCONNECTED_ERROR)


@router.get("")
def list_templates(phone_number_id: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only, on this workspace's own number
    _require_admin(current_user)
    number = get_workspace_number(db, current_user.organization_id, phone_number_id)

    # 2. Every template in any state, as Meta has it now
    try:
        templates = get_message_templates(number.waba_id, number.access_token, status=None)
    except WhatsAppTokenError as exc:
        raise _token_lost(db, number, exc)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not load templates from WhatsApp: {exc}")

    return {"templates": [{**summarize_template(template), "app_template": template.get("name", "").startswith(APP_TEMPLATE_PREFIX)} for template in templates]}


@router.post("", status_code=201)
def create_template(payload: TemplateCreate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only, on this workspace's own number
    _require_admin(current_user)
    number = get_workspace_number(db, current_user.organization_id, payload.phone_number_id)

    # 2. Send it to Meta for review
    try:
        create_message_template(number.waba_id, number.access_token, payload.name, payload.language, payload.body, payload.examples, payload.category)
    except WhatsAppTokenError as exc:
        raise _token_lost(db, number, exc)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"WhatsApp didn't accept this template: {exc}")

    # 3. Record who submitted it
    record_audit_log(db, action="TEMPLATE_SUBMITTED", category="organization", actor_email=current_user.email, actor_type="user", actor_id=current_user.id, target_type="template", target_name=payload.name, details={"organization_id": current_user.organization_id, "category": payload.category, "language": payload.language}, ip_address=get_client_ip(request))
    return {"name": payload.name, "language": payload.language}


@router.delete("")
def delete_template(request: Request, phone_number_id: str = Query(...), name: str = Query(..., min_length=1, max_length=512), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only, on this workspace's own number
    _require_admin(current_user)
    number = get_workspace_number(db, current_user.organization_id, phone_number_id)

    # 2. Order updates depend on the app's own templates, and an unfinished broadcast still sends this one
    if name.startswith(APP_TEMPLATE_PREFIX):
        raise HTTPException(status_code=403, detail="This template is used for order updates and can't be deleted")
    in_use = db.query(Broadcast.id).filter(Broadcast.organization_id == current_user.organization_id, Broadcast.template_name == name, Broadcast.status.in_(UNFINISHED_BROADCAST_STATUSES)).first()
    if in_use:
        raise HTTPException(status_code=409, detail="A broadcast is still sending this template. Try again when it has finished.")

    # 3. Delete it on Meta
    try:
        delete_message_template(number.waba_id, number.access_token, name)
    except WhatsAppTokenError as exc:
        raise _token_lost(db, number, exc)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"WhatsApp didn't delete this template: {exc}")

    # 4. Record who deleted it
    record_audit_log(db, action="TEMPLATE_DELETED", category="organization", actor_email=current_user.email, actor_type="user", actor_id=current_user.id, target_type="template", target_name=name, details={"organization_id": current_user.organization_id}, ip_address=get_client_ip(request))
    return {"message": "Template deleted"}
