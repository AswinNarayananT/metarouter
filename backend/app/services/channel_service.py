from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.whatsapp_model import WhatsAppNumber
from app.services.whatsapp_service import WhatsAppTokenError

NUMBER_DISCONNECTED_ERROR = "WhatsApp number disconnected — reconnect it in Channels"

# Why the connection stopped, by Meta's error_subcode (only 458 means the client removed our access)
DISCONNECT_EXPLANATIONS = {
    458: "MetaRouter's access was removed from your Meta Business settings (Business Integrations). If that wasn't intended, reconnect to restore it.",
    460: "The Facebook account used to connect WhatsApp changed its password, which disconnects connected apps.",
    459: "Meta needs the account owner to log in to Facebook and confirm the account.",
    464: "Meta needs the account owner to log in to Facebook and confirm the account.",
    463: "The connection to WhatsApp expired."
}
DEFAULT_DISCONNECT_EXPLANATION = "WhatsApp stopped accepting our connection to your number. If this keeps happening, contact support."


def disconnect_explanation(subcode: Optional[int]) -> str:
    return DISCONNECT_EXPLANATIONS.get(subcode, DEFAULT_DISCONNECT_EXPLANATION)


def number_is_disconnected(db: Session, organization_id: int, phone_number_id: Optional[str]) -> bool:
    number = db.query(WhatsAppNumber.status).filter(WhatsAppNumber.organization_id == organization_id, WhatsAppNumber.phone_number_id == phone_number_id).first()
    return bool(number) and number.status == "disconnected"


def mark_number_disconnected(db: Session, number: WhatsAppNumber, exc: WhatsAppTokenError) -> bool:
    # Imported here because whatsapp_tasks imports this service
    from app.workers.tasks.whatsapp_tasks import pause_number_broadcasts

    # 1. Only the connected -> disconnected change acts, so parallel 190s pause and log once
    changed = db.query(WhatsAppNumber).filter(WhatsAppNumber.id == number.id, WhatsAppNumber.status == "connected").update({
        "status": "disconnected",
        "disconnected_at": datetime.now(timezone.utc),
        "disconnect_reason": exc.message[:1000],
        "disconnect_subcode": exc.subcode
    }, synchronize_session=False)
    if not changed:
        db.commit()
        return False
    db.refresh(number)

    # 2. Pause the number's running broadcasts until it is reconnected
    paused = pause_number_broadcasts(db, number, reason="number_disconnected")
    db.commit()
    # The workspace sees it in the app (numbers API -> disconnected banner)
    print(f"[NUMBER DISCONNECTED] {number.display_phone_number} (subcode {exc.subcode}): {exc.message} — paused {paused} broadcasts")
    return True
