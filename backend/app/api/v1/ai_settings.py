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
from app.workers.tasks.chat_tasks import ESCALATION_TAG, RESOLVED_TAG, HANDOVER_FALLBACK_TEXT
from app.core.features import require_feature
from app.core.redis_client import redis_client
from app.schemas.ai_simulator_schema import SimulateAIRequest
from app.services.ai_service import simulate_ai_response
from app.services.conversation_service import handover_roles

router = APIRouter(
    prefix="/ai-settings",
    tags=["AI Settings & Knowledge"],
    dependencies=[Depends(require_feature("ai_assistant"))]
)

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


@router.post("/simulate")
def simulate_ai_reply(payload: SimulateAIRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)
    organization_id = current_user.organization_id

    # 1. Each test is a Gemini call: a limit per admin protects the quota
    limit_key = f"ai_simulator:{current_user.id}"
    used = redis_client.incr(limit_key)
    if used == 1:
        redis_client.expire(limit_key, 600)  # 10 minutes
    if used > settings.AI_SIMULATOR_MAX_PER_10_MIN:
        raise HTTPException(status_code=429, detail="You've run many tests in a short time. Try again in a few minutes.")

    # 2. Same prompt, knowledge base and models as a live chat; nothing is saved or sent
    result = simulate_ai_response(db, organization_id, [turn.model_dump() for turn in payload.history], payload.message)

    sources = [
        {
            "title": chunk.title,
            "document_id": chunk.document_id,
            "score": max(0, round((1 - float(distance)) * 100)),  # Cosine similarity as a %
            "preview": chunk.content[:300]
        }
        for chunk, distance in result["matches"]
    ]

    # 3. What a real chat would do with this reply (same tags as reply_with_ai)
    raw_reply = (result["raw_reply"] or "").strip()
    roles = ", ".join(sorted(handover_roles(db, organization_id)))
    if result["error"]:
        outcome = "error"
        reply = ""
        note = "The AI couldn't answer (the model was busy or timed out). In a real chat the customer would be handed to your team."
    elif not raw_reply or ESCALATION_TAG in raw_reply:
        outcome = "escalated"
        reply = raw_reply.replace(ESCALATION_TAG, "").strip() or HANDOVER_FALLBACK_TEXT
        note = f"The chat would move to your team ({roles} can take it), its ticket becomes a team ticket and they're notified."
    elif RESOLVED_TAG in raw_reply:
        outcome = "resolved"
        reply = raw_reply.replace(RESOLVED_TAG, "").strip() or "Glad I could help! Have a great day."
        note = "The customer needs nothing else: the AI would close the ticket."
    else:
        outcome = "answered"
        reply = raw_reply
        note = "The AI answers and keeps the chat."

    return {
        "reply": reply,
        "outcome": outcome,
        "outcome_note": note,
        "sources": sources,
        "best_score": sources[0]["score"] if sources else None,
        "has_knowledge": result["has_knowledge"],
        "elapsed_ms": result["elapsed_ms"]
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
