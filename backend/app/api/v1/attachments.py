import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.attachment_model import ChatAttachment
from app.workers.tasks.media_tasks import PARSEABLE_TYPES

router = APIRouter(prefix="/attachments", tags=["Chat Attachments"])

@router.get("/{attachment_id}/file")
def get_attachment_file(attachment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Only files that belong to the user's own organization
    attachment = db.query(ChatAttachment).filter(
        ChatAttachment.id == attachment_id,
        ChatAttachment.organization_id == current_user.organization_id
    ).first()

    if not attachment or attachment.download_status != "done" or not attachment.storage_path:
        raise HTTPException(status_code=404, detail="File not found")

    # 2. Resolve the path and make sure it stays inside the media folder
    media_root = os.path.realpath(settings.MEDIA_STORAGE_PATH)
    full_path = os.path.realpath(os.path.join(media_root, attachment.storage_path))
    if not full_path.startswith(media_root + os.sep) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    # 3. Images and PDFs open in the browser, anything else downloads
    disposition = "inline" if attachment.mime_type in PARSEABLE_TYPES else "attachment"
    return FileResponse(
        full_path,
        media_type=attachment.mime_type or "application/octet-stream",
        filename=attachment.file_name or os.path.basename(full_path),
        content_disposition_type=disposition,
        headers={"X-Content-Type-Options": "nosniff"}
    )
