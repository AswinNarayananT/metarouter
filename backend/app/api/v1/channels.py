from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.whatsapp_model import WhatsAppNumber
from app.services.channel_service import disconnect_explanation

router = APIRouter(prefix="/channels", tags=["Channels"])

@router.get("/whatsapp/numbers")
def list_whatsapp_numbers(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Connected WhatsApp numbers of the user's organization (the access token is never returned)
    numbers = db.query(WhatsAppNumber).filter(
        WhatsAppNumber.organization_id == current_user.organization_id
    ).order_by(WhatsAppNumber.created_at.asc()).all()

    return {
        "numbers": [
            {
                "id": number.id,
                "phone_number_id": number.phone_number_id,
                "display_phone_number": number.display_phone_number,
                "quality_rating": number.quality_rating,
                "messaging_tier": number.messaging_tier,
                "status": number.status,
                "disconnected_at": number.disconnected_at,
                "disconnect_message": disconnect_explanation(number.disconnect_subcode) if number.status == "disconnected" else None,
                "created_at": number.created_at
            }
            for number in numbers
        ]
    }
