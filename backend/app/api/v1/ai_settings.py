from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import hashlib
import os
import uuid
from datetime import datetime, timezone
from app.database import get_db
from app.config import settings
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.ai_settings_model import OrganizationAISettings
from app.models.knowledge_model import KnowledgeDocument
from app.workers.tasks.knowledge_tasks import process_knowledge_document_task

router = APIRouter(prefix="/ai-settings", tags=["AI Settings & Knowledge"])

VALID_HANDOVER_ROLES = {"admin", "manager", "service"}
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
    current_user: User = Depends(get_current_workspace_user)
):
    _require_admin(current_user)
    settings_obj = db.query(OrganizationAISettings).filter_by(organization_id=current_user.organization_id).first()
    return _serialize(settings_obj)


@router.post("/")
async def save_ai_settings(
    bot_name: str = Form(...),
    system_instructions: str = Form(""),
    allowed_roles_for_handover: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
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

    return {
        "status": "success",
        "message": "AI settings updated successfully.",
        "settings": _serialize(settings_obj),
    }


@router.get("/knowledge")
def list_knowledge_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)

    documents = db.query(KnowledgeDocument).filter(KnowledgeDocument.organization_id == current_user.organization_id).order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc()).all()

    return {"documents": [_serialize_document(d) for d in documents], "max_documents": settings.KNOWLEDGE_MAX_DOCUMENTS}


@router.post("/knowledge", status_code=202)
def upload_knowledge_document(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)
    organization_id = current_user.organization_id

    # 1. Must be a PDF within the size limit (read one byte more to detect bigger files)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Knowledge base file must be a PDF")

    content = file.file.read(settings.KNOWLEDGE_MAX_PDF_BYTES + 1)
    if len(content) > settings.KNOWLEDGE_MAX_PDF_BYTES:
        raise HTTPException(status_code=422, detail=f"PDF must be {settings.KNOWLEDGE_MAX_PDF_BYTES // (1024 * 1024)} MB or smaller")
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="This file is not a valid PDF")

    # 2. Same file already uploaded (failed uploads can be uploaded again)
    sha256 = hashlib.sha256(content).hexdigest()
    duplicate = db.query(KnowledgeDocument).filter(KnowledgeDocument.organization_id == organization_id, KnowledgeDocument.sha256 == sha256, KnowledgeDocument.status != "failed").first()
    if duplicate:
        raise HTTPException(status_code=409, detail=f"This PDF is already in the knowledge base as \"{duplicate.file_name}\"")

    count = db.query(KnowledgeDocument.id).filter(KnowledgeDocument.organization_id == organization_id).count()
    if count >= settings.KNOWLEDGE_MAX_DOCUMENTS:
        raise HTTPException(status_code=400, detail=f"The knowledge base can hold {settings.KNOWLEDGE_MAX_DOCUMENTS} documents. Delete one to upload another.")

    # 3. Save as org_<id>/<random name>.pdf (never trust the uploaded file name); temp file first so a crash leaves no half file
    relative_path = os.path.join(f"org_{organization_id}", f"{uuid.uuid4().hex}.pdf")
    full_path = os.path.join(settings.KNOWLEDGE_STORAGE_PATH, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path + ".part", "wb") as f:
        f.write(content)
    os.replace(full_path + ".part", full_path)

    # 4. Save the document and process it in the background
    document = KnowledgeDocument(
        organization_id=organization_id,
        file_name=os.path.basename(file.filename)[:255],
        storage_path=relative_path,
        file_size=len(content),
        sha256=sha256,
        status="processing",
        processing_started_at=datetime.now(timezone.utc),
        uploaded_by=current_user.id
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    process_knowledge_document_task.delay(document.id)

    return {"message": "PDF uploaded. The assistant can use it once processing finishes.", "document": _serialize_document(document)}


@router.post("/knowledge/{document_id}/retry")
def retry_knowledge_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)

    document = _get_document(db, current_user.organization_id, document_id)
    if document.status != "failed":
        raise HTTPException(status_code=400, detail="Only a failed document can be processed again")
    if not document.storage_path:
        raise HTTPException(status_code=400, detail="The PDF file is no longer stored. Upload it again.")

    document.status = "processing"
    document.error = None
    document.processing_started_at = datetime.now(timezone.utc)
    db.commit()

    process_knowledge_document_task.delay(document.id)

    return {"message": "Processing the PDF again", "document": _serialize_document(document)}


@router.delete("/knowledge/{document_id}")
def delete_knowledge_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)

    document = _get_document(db, current_user.organization_id, document_id)
    storage_path = document.storage_path

    # 1. Delete the document; its chunks go with it, so the assistant stops using it right away
    db.delete(document)
    db.commit()

    # 2. Remove the stored file
    if storage_path:
        full_path = os.path.join(settings.KNOWLEDGE_STORAGE_PATH, storage_path)
        if os.path.exists(full_path):
            os.remove(full_path)

    return {"message": "Document removed from the knowledge base"}


def _get_document(db: Session, organization_id: int, document_id: int) -> KnowledgeDocument:
    document = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == document_id, KnowledgeDocument.organization_id == organization_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _serialize_document(document: KnowledgeDocument) -> dict:
    return {
        "id": document.id,
        "file_name": document.file_name,
        "file_size": document.file_size,
        "page_count": document.page_count,
        "status": document.status,
        "error": document.error,
        "chunk_count": document.chunk_count,
        "can_retry": document.status == "failed" and bool(document.storage_path),
        "created_at": document.created_at,
        "processed_at": document.processed_at
    }
