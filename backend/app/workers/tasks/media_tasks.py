import base64
import hashlib
import os
import uuid
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.models.ai_chat import ChatMessage, ConversationStatus
from app.models.attachment_model import ChatAttachment
from app.models.whatsapp_model import WhatsAppNumber
from app.services.whatsapp_service import get_media_info, download_media, WhatsAppRetryableError, WhatsAppPermanentError
from app.services.document_parser import parse_document, DocumentParseError
from app.workers.tasks.chat_tasks import _get_or_create_conversation, reply_with_ai

RETRY_BASE_SECONDS = 30

# File types we store with a known extension and send to the parser
PARSEABLE_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
}


@celery_app.task(name="process_media_message_task")
def process_media_message_task(phone_number_id: str, customer_phone: str, wamid: str, kind: str, media: dict):
    db = SessionLocal()
    try:
        # 0. Which organization owns the business number the customer wrote to
        number = db.query(WhatsAppNumber.organization_id).filter(WhatsAppNumber.phone_number_id == phone_number_id).first()
        if not number:
            print(f"[WEBHOOK] Media for unknown phone_number_id {phone_number_id}; ignoring")
            return

        # 1. Get or create conversation
        conversation = _get_or_create_conversation(db, number.organization_id, phone_number_id, customer_phone)

        # 2. Save the message and its attachment (the unique wamid rejects webhooks Meta delivers twice)
        # Content is never empty so the AI chat history always has text for this message
        file_label = media.get("filename") or kind
        message = ChatMessage(
            conversation_id=conversation.id,
            sender="user",
            content=media.get("caption") or f"[Sent {kind}: {file_label}]",
            wamid=wamid
        )
        message.attachment = ChatAttachment(
            organization_id=number.organization_id,
            media_id=media.get("id"),
            kind=kind,
            mime_type=media.get("mime_type"),
            file_name=media.get("filename"),
            sha256=media.get("sha256")
        )
        db.add(message)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if db.query(ChatMessage.id).filter(ChatMessage.wamid == wamid).first():
                print(f"[DUPLICATE] Ignoring re-delivered media message {wamid}")
                return
            raise

        # 3. Download the file in the background
        download_whatsapp_media_task.delay(message.attachment.id)

    finally:
        db.close()


@celery_app.task(name="download_whatsapp_media_task", bind=True, max_retries=4)
def download_whatsapp_media_task(self, attachment_id: int):
    db = SessionLocal()
    try:
        attachment = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()

        # 1. Only download once (a re-run or duplicate task does nothing)
        if not attachment or attachment.download_status != "pending":
            return

        conversation = attachment.message.conversation
        number = db.query(WhatsAppNumber).filter(
            WhatsAppNumber.organization_id == attachment.organization_id,
            WhatsAppNumber.phone_number_id == conversation.phone_number_id
        ).first()
        if not number:
            _mark_download_failed(db, attachment, "No WhatsApp number connected for this conversation")
            return

        try:
            # 2. Ask Meta for a fresh download URL (each URL expires after 5 minutes)
            info = get_media_info(attachment.media_id, number.access_token)
            if info["file_size"] and info["file_size"] > settings.MEDIA_MAX_DOWNLOAD_BYTES:
                raise WhatsAppPermanentError(None, f"File is larger than the {settings.MEDIA_MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB limit")

            # 3. Download and make sure the file arrived complete
            content = download_media(info["url"], number.access_token, settings.MEDIA_MAX_DOWNLOAD_BYTES)
            expected_sha256 = info["sha256"] or attachment.sha256
            digest = hashlib.sha256(content)
            if expected_sha256 and expected_sha256 not in (digest.hexdigest(), base64.b64encode(digest.digest()).decode()):
                raise WhatsAppRetryableError("Downloaded file does not match Meta's sha256")

        except WhatsAppPermanentError as exc:
            _mark_download_failed(db, attachment, str(exc))
            return
        except WhatsAppRetryableError as exc:
            if self.request.retries >= self.max_retries:
                _mark_download_failed(db, attachment, f"Gave up after {self.max_retries + 1} attempts: {exc}")
                return
            # 30s, 60s, 120s, 240s
            raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)

        # 4. Save as org_<id>/<yyyy>/<mm>/<random name><ext> (never trust the customer's file name)
        mime_type = info["mime_type"] or attachment.mime_type
        now = datetime.now(timezone.utc)
        relative_path = os.path.join(f"org_{attachment.organization_id}", now.strftime("%Y"), now.strftime("%m"), f"{uuid.uuid4().hex}{PARSEABLE_TYPES.get(mime_type, '.bin')}")
        full_path = os.path.join(settings.MEDIA_STORAGE_PATH, relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        # Write to a temp file first so a crash never leaves a half-written file behind
        with open(full_path + ".part", "wb") as f:
            f.write(content)
        os.replace(full_path + ".part", full_path)

        attachment.storage_path = relative_path
        attachment.mime_type = mime_type
        attachment.file_size = len(content)
        attachment.sha256 = digest.hexdigest()
        attachment.download_status = "done"

        # 5. Parse supported documents, skip everything else
        if mime_type in PARSEABLE_TYPES and len(content) <= settings.MEDIA_MAX_PARSE_BYTES:
            db.commit()
            parse_document_task.delay(attachment.id)
        else:
            attachment.parse_status = "skipped"
            attachment.error = "File type is not supported for reading" if mime_type not in PARSEABLE_TYPES else "File is too large to read automatically"
            db.commit()
            _acknowledge_document(db, attachment, f"[Document received] The customer sent a {attachment.kind} ({mime_type}) that can't be read automatically.")

    finally:
        db.close()


@celery_app.task(name="parse_document_task", bind=True, max_retries=2)
def parse_document_task(self, attachment_id: int):
    db = SessionLocal()
    try:
        attachment = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()

        # 1. Only parse downloaded files that haven't been parsed yet
        if not attachment or attachment.download_status != "done" or attachment.parse_status != "pending":
            return

        # 2. Read the stored file
        with open(os.path.join(settings.MEDIA_STORAGE_PATH, attachment.storage_path), "rb") as f:
            content = f.read()

        # 3. Extract the details with Gemini
        try:
            parsed = parse_document(content, attachment.mime_type)
        except DocumentParseError as exc:
            if self.request.retries < self.max_retries:
                # 30s, 60s
                raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)
            attachment.parse_status = "failed"
            attachment.error = str(exc)
            db.commit()
            print(f"[PARSE FAILED] attachment={attachment.id}: {exc}")
            _acknowledge_document(db, attachment, f"[Document received] The customer sent a {attachment.kind} that could not be read automatically.")
            return

        # 4. Save the results (shape matches the frontend ParsedDocument type)
        attachment.document_type = parsed["document_type"]
        attachment.confidence = parsed["confidence"]
        attachment.parsed_data = {
            "fields": parsed["fields"],
            "line_items": parsed["line_items"],
            "totals": parsed["totals"]
        }
        attachment.parse_status = "parsed"
        attachment.parsed_at = datetime.now(timezone.utc)
        attachment.error = None
        db.commit()

        # 5. Let the AI acknowledge what it read
        details = [f"{f['label']}: {f['value']}" for f in parsed["fields"]] + [f"{t['label']}: {t['value']}" for t in parsed["totals"]]
        summary = f"[Document received] The customer sent a {parsed['document_type']}. Details read from it: " + "; ".join(details)
        _acknowledge_document(db, attachment, summary)

    finally:
        db.close()


def _mark_download_failed(db: Session, attachment: ChatAttachment, error: str):
    attachment.download_status = "failed"
    attachment.parse_status = "skipped"
    attachment.error = error
    db.commit()
    print(f"[MEDIA DOWNLOAD FAILED] attachment={attachment.id}: {error}")
    _acknowledge_document(db, attachment, f"[Document received] The customer sent a {attachment.kind} that could not be downloaded.")


def _acknowledge_document(db: Session, attachment: ChatAttachment, summary: str):
    # AI stays silent while a team member is handling the chat
    conversation = attachment.message.conversation
    if conversation.status == ConversationStatus.HUMAN_TAKEOVER:
        return
    reply_with_ai(db, conversation, summary)
