import hashlib
import hmac
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from app.config import settings
from app.workers.tasks.chat_tasks import process_chat_message_task
from app.workers.tasks.whatsapp_tasks import process_whatsapp_status_task, process_quality_update_task
from app.workers.tasks.media_tasks import process_media_message_task

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

# Callback URL to set in the Meta app: https://<public-host>/api/v1/webhooks/whatsapp
# (one URL for every connected number; messages are routed by metadata.phone_number_id)


@router.get("/whatsapp", response_class=PlainTextResponse)
def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    """Meta calls this once when the webhook is configured; echo the challenge if the token matches."""
    expected = settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    if (
        expected
        and hub_mode == "subscribe"
        and hub_challenge is not None
        and hmac.compare_digest(hub_verify_token or "", expected)
    ):
        return hub_challenge
    raise HTTPException(status_code=403, detail="Webhook verification failed")


def _has_valid_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """Meta signs every webhook with the app secret (HMAC-SHA256 of the raw body)."""
    if not settings.META_APP_SECRET or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(settings.META_APP_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.removeprefix("sha256="))


def _message_text(message: dict) -> str:
    msg_type = message.get("type")
    if msg_type == "text":
        return message.get("text", {}).get("body", "")
    if msg_type == "button":
        return message.get("button", {}).get("text", "")
    if msg_type == "interactive":
        interactive = message.get("interactive", {})
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return reply.get("title", "")
    # Images, documents, audio, etc. — kept as a placeholder until media handling is added
    return f"[{msg_type or 'unknown'} message]"


def _status_error(status: dict) -> Optional[str]:
    errors = status.get("errors") or []
    if not errors:
        return None
    error = errors[0]
    detail = error.get("error_data", {}).get("details") or error.get("message") or error.get("title")
    return f"[{error.get('code')}] {detail}" if error.get("code") else detail


@router.post("/whatsapp")
async def receive_whatsapp_webhook(request: Request):
    """
    Receives customer messages and delivery updates for every connected number.
    Only verifies and queues work so Meta gets a fast 200 (slow or failed responses are retried by Meta).
    """
    raw_body = await request.body()
    if not _has_valid_signature(raw_body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            # Quality / tier changes of a business number (entry id is the WABA id)
            if change.get("field") == "phone_number_quality_update":
                value = change.get("value", {})
                process_quality_update_task.delay(
                    waba_id=entry.get("id"),
                    display_phone_number=value.get("display_phone_number"),
                    event=value.get("event"),
                    current_limit=value.get("current_limit")
                )
                continue

            if change.get("field") != "messages":
                continue
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id")

            for message in value.get("messages", []):
                # Images and documents (bills, invoices) are downloaded and parsed
                media_type = message.get("type")
                media = message.get(media_type) if media_type in ("image", "document") else None
                if media and media.get("id"):
                    process_media_message_task.delay(
                        phone_number_id=phone_number_id,
                        customer_phone=message.get("from"),
                        wamid=message.get("id"),
                        kind=media_type,
                        media={
                            "id": media.get("id"),
                            "mime_type": media.get("mime_type"),
                            "sha256": media.get("sha256"),
                            "filename": media.get("filename"),
                            "caption": media.get("caption")
                        }
                    )
                    continue

                process_chat_message_task.delay(
                    phone_number_id=phone_number_id,
                    customer_phone=message.get("from"),
                    user_text=_message_text(message),
                    wamid=message.get("id"),
                )

            for status in value.get("statuses", []):
                process_whatsapp_status_task.delay(
                    wamid=status.get("id"),
                    status=status.get("status"),
                    error=_status_error(status),
                    callback_data=status.get("biz_opaque_callback_data"),
                )

    return {"status": "ok"}
