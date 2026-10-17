from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import shutil
import os
import tempfile
from app.database import get_db
from app.core.deps import get_current_tenant_user
from app.models.organization_model import User
from app.models.ai_chat import OrganizationAISettings
from app.services.vector_service import process_and_store_pdf

router = APIRouter(prefix="/ai-settings", tags=["AI Settings & Knowledge"])

VALID_HANDOVER_ROLES = {"admin", "manager", "service"}
MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
DEFAULT_BOT_NAME = "Support Assistant"
DEFAULT_HANDOVER_ROLES = "admin,manager"


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can manage AI settings")


def _serialize(settings_obj: Optional[OrganizationAISettings]) -> dict:
    roles = settings_obj.allowed_roles_for_handover if settings_obj else DEFAULT_HANDOVER_ROLES
    return {
        "bot_name": settings_obj.bot_name if settings_obj else DEFAULT_BOT_NAME,
        "system_instructions": (settings_obj.system_instructions if settings_obj else None) or "",
        "allowed_roles_for_handover": [r for r in (roles or "").split(",") if r],
        "is_active": settings_obj.is_active if settings_obj else True,
    }


@router.get("/")
def get_ai_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user)
):
    _require_admin(current_user)
    settings_obj = db.query(OrganizationAISettings).filter_by(organization_id=current_user.organization_id).first()
    return _serialize(settings_obj)


@router.post("/")
async def save_ai_settings(
    bot_name: str = Form(...),
    system_instructions: str = Form(""),
    allowed_roles_for_handover: str = Form(...),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user)
):
    _require_admin(current_user)
    organization_id = current_user.organization_id

    # 1. Validate inputs
    bot_name = bot_name.strip()
    if not 2 <= len(bot_name) <= 100:
        raise HTTPException(status_code=422, detail="Bot name must be between 2 and 100 characters")
    if len(system_instructions) > 4000:
        raise HTTPException(status_code=422, detail="Instructions must be 4000 characters or less")

    roles = [r.strip().lower() for r in allowed_roles_for_handover.split(",") if r.strip()]
    if not roles:
        raise HTTPException(status_code=422, detail="Select at least one role for human handover")
    invalid_roles = set(roles) - VALID_HANDOVER_ROLES
    if invalid_roles:
        raise HTTPException(status_code=422, detail=f"Invalid roles: {', '.join(sorted(invalid_roles))}")

    if file and file.filename:
        if not file.filename.lower().endswith(".pdf") or file.content_type not in ("application/pdf", "application/octet-stream"):
            raise HTTPException(status_code=422, detail="Knowledge base file must be a PDF")
        if file.size is not None and file.size > MAX_PDF_SIZE_BYTES:
            raise HTTPException(status_code=422, detail="PDF must be 10 MB or smaller")

    # 2. Update or create organization AI settings
    settings_obj = db.query(OrganizationAISettings).filter_by(organization_id=organization_id).first()
    if not settings_obj:
        settings_obj = OrganizationAISettings(organization_id=organization_id)
        db.add(settings_obj)

    settings_obj.bot_name = bot_name
    settings_obj.system_instructions = system_instructions.strip()
    settings_obj.allowed_roles_for_handover = ",".join(dict.fromkeys(roles))
    db.commit()
    db.refresh(settings_obj)

    # 3. Process uploaded PDF if provided (temp file avoids name collisions / path tricks in the filename)
    if file and file.filename:
        fd, temp_path = tempfile.mkstemp(suffix=".pdf")
        try:
            with os.fdopen(fd, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            process_and_store_pdf(db, organization_id, temp_path, os.path.basename(file.filename))
        except Exception as e:
            # Settings above are already committed; drop any partially added chunks
            db.rollback()
            print(f"Knowledge base processing error: {e}")
            raise HTTPException(
                status_code=502,
                detail="Settings were saved, but the PDF could not be processed. Please try uploading it again.",
            )
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    return {
        "status": "success",
        "message": "AI settings and knowledge base updated successfully.",
        "settings": _serialize(settings_obj),
    }
