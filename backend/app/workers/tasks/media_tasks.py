import base64
import hashlib
import os
import uuid
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.models.conversation_model import ChatMessage, ConversationStatus
from app.models.attachment_model import ChatAttachment
from app.models.whatsapp_model import WhatsAppNumber
from app.models.organization_model import Organization
from app.services.whatsapp_service import get_media_info, download_media, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.services.channel_service import mark_number_disconnected, number_is_disconnected, NUMBER_DISCONNECTED_ERROR
from app.services.document_parser_service import parse_document, transcribe_audio, DocumentParseError
from app.workers.tasks.chat_tasks import _get_or_create_conversation, reply_with_ai, update_customer_profile
from app.core.redis_client import redis_client
from app.realtime.notify import notify_new_messages, notify_attachment_updated
from app.services.ticket_service import start_ticket_session

RETRY_BASE_SECONDS = 30
MEDIA_LOCK_SECONDS = 300  # Longer than a 25 MB download / one Gemini parse; released as soon as the task finishes
RETRY_MARKER_GRACE_SECONDS = 120


def media_retry_marker_key(attachment_id: int) -> str:
    return f"media:retry:{attachment_id}"

# File types we store with a known extension and send to the parser
PARSEABLE_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
}
# Every type we keep a proper extension for (voice notes, videos, stickers too)
STORED_EXTENSIONS = {
    **PARSEABLE_TYPES,
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/amr": ".amr",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
}
# What the customer's message says before the file is read (never empty, so the AI history has text)
MEDIA_LABELS = {"audio": "[Voice note]", "video": "[Sent a video]", "sticker": "[Sticker]"}
VIDEO_SUMMARY = "[Video received] The customer sent a video. You can't watch videos: kindly ask them to describe the issue in a message or send a photo instead."


@celery_app.task(name="process_media_message_task")
def process_media_message_task(phone_number_id: str, customer_phone: str, wamid: str, kind: str, media: dict, customer_name: Optional[str] = None, customer_user_id: Optional[str] = None, referral: Optional[dict] = None):
    db = SessionLocal()
    try:
        # 0. Which organization owns the business number the customer wrote to
        number = db.query(WhatsAppNumber.organization_id).filter(WhatsAppNumber.phone_number_id == phone_number_id).first()
        if not number:
            print(f"[WEBHOOK] Media for unknown phone_number_id {phone_number_id}; ignoring")
            return

        # 1. Get or create conversation, and keep the customer's name / id / ad up to date
        conversation = _get_or_create_conversation(db, number.organization_id, phone_number_id, customer_phone)
        update_customer_profile(db, conversation, customer_name, customer_user_id, referral)

        # 2. Save the message and its attachment (the unique wamid rejects webhooks Meta delivers twice)
        # Content is never empty so the AI chat history always has text for this message
        # Photos have no file name: "[Sent an image]" instead of "[Sent image: image]"
        if kind in MEDIA_LABELS:
            file_label = MEDIA_LABELS[kind]
        else:
            file_label = f"[Sent {kind}: {media.get('filename')}]" if media.get("filename") else f"[Sent {'an image' if kind == 'image' else 'a document'}]"
        message = ChatMessage(
            conversation_id=conversation.id,
            sender="user",
            message_type=kind,
            content=media.get("caption") or file_label,
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
        notify_new_messages(db, [message])
        start_ticket_session(db, conversation, message.id)

        # 3. Download the file in the background
        download_whatsapp_media_task.delay(message.attachment.id)

    finally:
        db.close()


@celery_app.task(name="download_whatsapp_media_task", bind=True, max_retries=4)
def download_whatsapp_media_task(self, attachment_id: int):
    db = SessionLocal()
    lock_key = f"media:download-lock:{attachment_id}"
    locked = False
    try:
        attachment = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()

        # 1. Only download once (a re-run or duplicate task does nothing)
        if not attachment or attachment.download_status != "pending":
            return

        # Only one worker downloads a file at a time (the sweeper may queue it again)
        locked = bool(redis_client.set(lock_key, 1, nx=True, ex=MEDIA_LOCK_SECONDS))
        if not locked:
            return

        conversation = attachment.message.conversation
        number = db.query(WhatsAppNumber).filter(
            WhatsAppNumber.organization_id == attachment.organization_id,
            WhatsAppNumber.phone_number_id == conversation.phone_number_id
        ).first()
        if not number:
            _mark_download_failed(db, attachment, "No WhatsApp number connected for this conversation")
            return

        # Disconnected number: the token can't download the file
        if number.status == "disconnected":
            _mark_download_failed(db, attachment, NUMBER_DISCONNECTED_ERROR)
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

        except WhatsAppTokenError as exc:
            mark_number_disconnected(db, number, exc)
            _mark_download_failed(db, attachment, NUMBER_DISCONNECTED_ERROR)
            return
        except WhatsAppPermanentError as exc:
            _mark_download_failed(db, attachment, str(exc))
            return
        except WhatsAppRetryableError as exc:
            if self.request.retries >= self.max_retries:
                _mark_download_failed(db, attachment, f"Gave up after {self.max_retries + 1} attempts: {exc}")
                return
            # 30s, 60s, 120s, 240s; tell the stuck-media sweeper a retry is already scheduled
            countdown = RETRY_BASE_SECONDS * 2 ** self.request.retries
            redis_client.set(media_retry_marker_key(attachment.id), 1, ex=countdown + RETRY_MARKER_GRACE_SECONDS)
            raise self.retry(exc=exc, countdown=countdown)

        # 4. Save as org_<id>/<yyyy>/<mm>/<random name><ext> (never trust the customer's file name)
        # Voice notes come as "audio/ogg; codecs=opus": the base type picks the extension
        mime_type = (info["mime_type"] or attachment.mime_type or "").split(";")[0].strip()
        now = datetime.now(timezone.utc)
        relative_path = os.path.join(f"org_{attachment.organization_id}", now.strftime("%Y"), now.strftime("%m"), f"{uuid.uuid4().hex}{STORED_EXTENSIONS.get(mime_type, '.bin')}")
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

        # 5. Voice notes: transcribe (same step as parsing, so the stuck-media sweeper retries it too)
        if attachment.kind == "audio" and len(content) <= settings.MEDIA_MAX_PARSE_BYTES:
            db.commit()
            notify_attachment_updated(attachment)
            parse_document_task.delay(attachment.id)
        elif attachment.kind == "video":
            # Videos are shown to the team; the AI asks the customer to describe it instead
            attachment.parse_status = "skipped"
            attachment.error = "Videos aren't watched automatically"
            db.commit()
            notify_attachment_updated(attachment)
            _acknowledge_document(db, attachment, VIDEO_SUMMARY)
        elif attachment.kind == "sticker":
            # A sticker is like a reaction: shown, but nothing to answer
            attachment.parse_status = "skipped"
            db.commit()
            notify_attachment_updated(attachment)
        # Parse supported documents, skip everything else
        elif mime_type in PARSEABLE_TYPES and len(content) <= settings.MEDIA_MAX_PARSE_BYTES:
            db.commit()
            notify_attachment_updated(attachment)
            parse_document_task.delay(attachment.id)
        else:
            attachment.parse_status = "skipped"
            attachment.error = "File type is not supported for reading" if mime_type not in PARSEABLE_TYPES else "File is too large to read automatically"
            db.commit()
            notify_attachment_updated(attachment)
            _acknowledge_document(db, attachment, f"[Document received] The customer sent a {attachment.kind} ({mime_type}) that can't be read automatically.")

    finally:
        # Release the lock so a scheduled retry can run
        if locked:
            redis_client.delete(lock_key)
        db.close()


@celery_app.task(name="parse_document_task", bind=True, max_retries=2)
def parse_document_task(self, attachment_id: int):
    db = SessionLocal()
    lock_key = f"media:parse-lock:{attachment_id}"
    locked = False
    try:
        attachment = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()

        # 1. Only parse downloaded files that haven't been parsed yet
        if not attachment or attachment.download_status != "done" or attachment.parse_status != "pending":
            return

        # Only one worker parses a file at a time, so the AI acknowledges it once
        locked = bool(redis_client.set(lock_key, 1, nx=True, ex=MEDIA_LOCK_SECONDS))
        if not locked:
            return

        # 2. Read the stored file
        with open(os.path.join(settings.MEDIA_STORAGE_PATH, attachment.storage_path), "rb") as f:
            content = f.read()

        # Voice note: transcribe instead of parsing
        if attachment.kind == "audio":
            _transcribe_voice_note(self, db, attachment, content)
            return

        # 3. Extract the details with Gemini
        try:
            parsed = parse_document(content, attachment.mime_type)
        except DocumentParseError as exc:
            if self.request.retries < self.max_retries:
                # 30s, 60s; tell the stuck-media sweeper a retry is already scheduled
                countdown = RETRY_BASE_SECONDS * 2 ** self.request.retries
                redis_client.set(media_retry_marker_key(attachment.id), 1, ex=countdown + RETRY_MARKER_GRACE_SECONDS)
                raise self.retry(exc=exc, countdown=countdown)
            attachment.parse_status = "failed"
            attachment.error = str(exc)
            db.commit()
            notify_attachment_updated(attachment)
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
        notify_attachment_updated(attachment)

        # 5. Let the AI acknowledge what it read
        details = [f"{f['label']}: {f['value']}" for f in parsed["fields"]] + [f"{t['label']}: {t['value']}" for t in parsed["totals"]]
        summary = f"[Document received] The customer sent a {parsed['document_type']}. Details read from it: " + "; ".join(details)
        _acknowledge_document(db, attachment, summary)

    finally:
        if locked:
            redis_client.delete(lock_key)
        db.close()


def _transcribe_voice_note(task, db: Session, attachment: ChatAttachment, content: bytes):
    # 1. Speech -> text (original language + English)
    try:
        result = transcribe_audio(content, attachment.mime_type)
    except DocumentParseError as exc:
        if task.request.retries < task.max_retries:
            countdown = RETRY_BASE_SECONDS * 2 ** task.request.retries
            redis_client.set(media_retry_marker_key(attachment.id), 1, ex=countdown + RETRY_MARKER_GRACE_SECONDS)
            raise task.retry(exc=exc, countdown=countdown)
        attachment.parse_status = "failed"
        attachment.error = str(exc)
        db.commit()
        notify_attachment_updated(attachment)
        print(f"[TRANSCRIBE FAILED] attachment={attachment.id}: {exc}")
        _acknowledge_document(db, attachment, "[Voice note received] The customer sent a voice note that couldn't be understood. Kindly ask them to type their message.")
        return

    # 2. Keep it on the attachment, and make the transcript the message text (AI history, tickets, chat preview)
    transcript = (result["transcript"] or "").strip()
    attachment.document_type = "Voice note"
    attachment.parsed_data = {"transcript": transcript, "language": result["language"], "english": (result["english"] or "").strip()}
    attachment.parse_status = "parsed"
    attachment.parsed_at = datetime.now(timezone.utc)
    attachment.error = None
    message = attachment.message
    if transcript:
        message.content = transcript
    db.commit()
    notify_attachment_updated(attachment)
    notify_new_messages(db, [message])  # The bubble and chat list show the words instead of "[Voice note]"

    # 3. The AI answers what was said, as if it had been typed
    if transcript:
        _acknowledge_document(db, attachment, transcript)
    else:
        _acknowledge_document(db, attachment, "[Voice note received] The voice note had no clear speech. Kindly ask the customer to repeat it or type their message.")


def _mark_download_failed(db: Session, attachment: ChatAttachment, error: str):
    attachment.download_status = "failed"
    attachment.parse_status = "skipped"
    attachment.error = error
    db.commit()
    notify_attachment_updated(attachment)
    print(f"[MEDIA DOWNLOAD FAILED] attachment={attachment.id}: {error}")
    if attachment.kind == "sticker":
        return  # Nothing to answer
    what = {"audio": "voice note", "video": "video"}.get(attachment.kind, attachment.kind)
    _acknowledge_document(db, attachment, f"[{what.capitalize()} received] The customer sent a {what} that could not be downloaded. Kindly ask them to send it again or type their message.")


def _acknowledge_document(db: Session, attachment: ChatAttachment, summary: str):
    # AI stays silent while a team member is handling the chat
    conversation = attachment.message.conversation
    if conversation.status == ConversationStatus.HUMAN_TAKEOVER:
        return
    # ... and when the number is disconnected (the reply couldn't be delivered)
    if number_is_disconnected(db, conversation.organization_id, conversation.phone_number_id):
        return
    # ... and when the workspace is inactive (suspended)
    org = db.query(Organization).filter(Organization.id == conversation.organization_id).first()
    if not org or org.subscription_status == "inactive" or org.subscription_status != "active":
        return
    reply_with_ai(db, conversation, summary)

