from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import secrets
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.whatsapp_model import WhatsAppNumber
from app.schemas.channel_schema import ConnectWhatsAppRequest
from app.services.channel_service import disconnect_explanation, MANUAL_DISCONNECT_SUBCODE
from app.services.whatsapp_service import exchange_signup_code, granted_waba_ids, waba_phone_number_ids, phone_number_details, register_phone_number, deregister_phone_number, subscribe_app_to_waba, unsubscribe_app_from_waba, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.workers.tasks.whatsapp_tasks import pause_number_broadcasts

# Always available (core): every messaging module needs a connected number
router = APIRouter(prefix="/channels", tags=["Channels"])


def _require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage channels")


def _number_data(number: WhatsAppNumber) -> dict:
    return {
        "id": number.id,
        "phone_number_id": number.phone_number_id,
        "display_phone_number": number.display_phone_number,
        "verified_name": number.verified_name,
        "quality_rating": number.quality_rating,
        "messaging_tier": number.messaging_tier,
        "status": number.status,
        "disconnected_at": number.disconnected_at,
        "disconnect_message": disconnect_explanation(number.disconnect_subcode) if number.status == "disconnected" else None,
        "created_at": number.created_at
    }


@router.get("/whatsapp/numbers")
def list_whatsapp_numbers(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Connected WhatsApp numbers of the user's organization (the access token is never returned)
    numbers = db.query(WhatsAppNumber).filter(
        WhatsAppNumber.organization_id == current_user.organization_id
    ).order_by(WhatsAppNumber.created_at.asc()).all()

    return {
        "numbers": [_number_data(number) for number in numbers]
    }


@router.get("/whatsapp/signup-config")
def whatsapp_signup_config(current_user: User = Depends(get_current_workspace_user)):
    # 1. What the browser needs to open Meta's Embedded Signup popup (public ids from .env; never the app secret)
    _require_admin(current_user)
    if not settings.META_APP_ID or not settings.META_CONFIG_ID:
        raise HTTPException(status_code=503, detail="WhatsApp connection isn't set up on the server yet (META_APP_ID / META_CONFIG_ID missing)")

    return {
        "app_id": settings.META_APP_ID,
        "config_id": settings.META_CONFIG_ID,
        "api_version": settings.META_API_VERSION
    }


@router.post("/whatsapp/connect", status_code=201)
def connect_whatsapp_number(payload: ConnectWhatsAppRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)

    try:
        # 1. The popup's one-time code -> the business's token (app secret used here, server-side only)
        access_token = exchange_signup_code(payload.code)

        # 2. Which account and number: the popup's ids if it sent them, always checked against what the business
        #    actually gave this token (never trust the browser's ids alone); otherwise found from the token itself
        granted = granted_waba_ids(access_token, payload.business_id)
        if payload.waba_id and payload.waba_id not in granted:
            raise HTTPException(status_code=403, detail="This WhatsApp Business Account wasn't shared with MetaRouter. Run the setup again and select it.")
        accounts = [payload.waba_id] if payload.waba_id else sorted(granted)
        if not accounts:
            raise HTTPException(status_code=422, detail="No WhatsApp Business Account was shared in the setup. Run it again and complete every step.")

        candidates = [(waba_id, number_id) for waba_id in accounts for number_id in waba_phone_number_ids(waba_id, access_token)]
        if payload.phone_number_id:
            candidates = [c for c in candidates if c[1] == payload.phone_number_id]
            if not candidates:
                raise HTTPException(status_code=403, detail="This phone number doesn't belong to the selected WhatsApp Business Account")
        else:
            # The popup's "finished" message didn't arrive: pick the one number not connected here yet
            connected_ids = {row.phone_number_id for row in db.query(WhatsAppNumber.phone_number_id).filter(WhatsAppNumber.status == "connected").all()}
            candidates = [c for c in candidates if c[1] not in connected_ids]
            if not candidates:
                raise HTTPException(status_code=422, detail="No new phone number was found in the shared account. Run the setup again and add your number.")
            if len(candidates) > 1:
                raise HTTPException(status_code=422, detail="Several phone numbers were shared. Run the setup again and add just the one to connect.")
        waba_id, phone_number_id = candidates[0]

        # 3. A number belongs to one workspace only
        existing = db.query(WhatsAppNumber).filter(WhatsAppNumber.phone_number_id == phone_number_id).first()
        if existing and existing.organization_id != current_user.organization_id:
            raise HTTPException(status_code=409, detail="This WhatsApp number is already connected to another workspace")

        # 4. Turn the number on for the Cloud API (re-use the PIN when reconnecting a number we registered before)
        pin = existing.registration_pin if existing and existing.registration_pin else f"{secrets.randbelow(10 ** 6):06d}"
        register_phone_number(phone_number_id, access_token, pin)

        # 5. Customer messages and delivery updates of this account come to our webhook
        subscribe_app_to_waba(waba_id, access_token)

        # 6. Number details for the Channels page
        details = phone_number_details(phone_number_id, access_token)
    except WhatsAppTokenError as exc:
        raise HTTPException(status_code=400, detail=f"Meta didn't accept the connection: {exc.message}. Run the setup again.")
    except WhatsAppPermanentError as exc:
        raise HTTPException(status_code=400, detail=f"Meta rejected the setup: {exc}")
    except WhatsAppRetryableError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't reach Meta right now: {exc}. Please try again.")

    # 7. Save (or bring back) the number for this workspace; the token and PIN are encrypted at rest
    number = existing or WhatsAppNumber(organization_id=current_user.organization_id, phone_number_id=phone_number_id)
    number.waba_id = waba_id
    number.access_token = access_token
    number.registration_pin = pin
    number.display_phone_number = details.get("display_phone_number") or phone_number_id
    number.verified_name = details.get("verified_name")
    number.quality_rating = details.get("quality_rating") or "GREEN"
    number.messaging_tier = details.get("messaging_limit_tier") or "TIER_1K"
    number.status = "connected"
    number.disconnected_at = None
    number.disconnect_reason = None
    number.disconnect_subcode = None
    db.add(number)
    db.commit()
    db.refresh(number)
    print(f"[CHANNELS] {current_user.email} connected {number.display_phone_number} (WABA {number.waba_id}) to org {number.organization_id}")

    return _number_data(number)


@router.post("/whatsapp/numbers/{number_id}/disconnect")
def disconnect_whatsapp_number(number_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admin, and a number of this workspace that is connected
    _require_admin(current_user)
    number = db.query(WhatsAppNumber).filter(
        WhatsAppNumber.id == number_id,
        WhatsAppNumber.organization_id == current_user.organization_id
    ).first()

    if not number:
        raise HTTPException(status_code=404, detail="WhatsApp number not found")
    if number.status == "disconnected":
        raise HTTPException(status_code=422, detail="This number is already disconnected")

    # 2. Tell Meta: stop sending this account's webhooks (unless another of our numbers uses the same account),
    #    and switch the number off for the Cloud API. Meta errors don't block the local disconnect.
    warnings = []
    others_on_account = db.query(WhatsAppNumber.id).filter(
        WhatsAppNumber.waba_id == number.waba_id,
        WhatsAppNumber.id != number.id,
        WhatsAppNumber.status == "connected"
    ).first()
    try:
        if not others_on_account:
            unsubscribe_app_from_waba(number.waba_id, number.access_token)
        deregister_phone_number(number.phone_number_id, number.access_token)
    except (WhatsAppTokenError, WhatsAppPermanentError, WhatsAppRetryableError) as exc:
        warnings.append(f"Meta: {exc}")

    # 3. Disconnected here: nothing is sent from it; chats, tickets and history are kept; its broadcasts pause
    number.status = "disconnected"
    number.disconnected_at = datetime.now(timezone.utc)
    number.disconnect_reason = f"Disconnected by {current_user.name}"
    number.disconnect_subcode = MANUAL_DISCONNECT_SUBCODE
    pause_number_broadcasts(db, number, reason="number_disconnected")
    db.commit()
    db.refresh(number)
    print(f"[CHANNELS] {current_user.email} disconnected {number.display_phone_number}" + (f" ({'; '.join(warnings)})" if warnings else ""))

    return {
        "number": _number_data(number),
        "warnings": warnings
    }
