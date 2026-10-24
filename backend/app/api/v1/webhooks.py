import hashlib
import hmac
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from app.config import settings
from app.workers.tasks.chat_tasks import process_chat_message_task, process_reaction_task
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


# Files the customer can send: downloaded by the media task (voice notes are transcribed, documents parsed)
MEDIA_TYPES = ("image", "document", "audio", "video", "sticker")


def _describe_message(message: dict) -> dict:
    # Text the chat (and the AI) sees for a non-file message, plus details kept for the bubble
    msg_type = message.get("type")
    if msg_type == "text":
        return {"text": message.get("text", {}).get("body", ""), "message_type": "text"}
    if msg_type == "button":
        return {"text": message.get("button", {}).get("text", ""), "message_type": "text"}
    if msg_type == "interactive":
        interactive = message.get("interactive", {})
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return {"text": reply.get("title", ""), "message_type": "text"}

    if msg_type == "location":
        # "📍 Shared location: Brototype, Infopark Rd (10.0159, 76.3419)" - the AI can answer about it
        location = message.get("location", {})
        place = ", ".join(p for p in (location.get("name"), location.get("address")) if p)
        coordinates = f"{location.get('latitude')}, {location.get('longitude')}"
        return {
            "text": f"📍 Shared location: {place} ({coordinates})" if place else f"📍 Shared location ({coordinates})",
            "message_type": "location",
            "message_data": {k: location.get(k) for k in ("latitude", "longitude", "name", "address", "url")}
        }

    if msg_type == "contacts":
        # "👤 Shared contact: Rahul, +91 98765 43210"
        cards = [
            {"name": (c.get("name") or {}).get("formatted_name"), "phones": [p.get("phone") for p in c.get("phones", []) if p.get("phone")]}
            for c in message.get("contacts", [])
        ]
        summary = "; ".join(", ".join([card["name"] or "Contact"] + card["phones"]) for card in cards)
        return {"text": f"👤 Shared contact: {summary}", "message_type": "contacts", "message_data": {"contacts": cards}}

    # Polls, orders, unsupported types ...: kept as a note, nothing for the AI to answer
    return {"text": f"[Customer sent a message type that isn't supported: {msg_type or 'unknown'}]", "message_type": "unsupported", "ai_reply": False}


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

            # Who sent the messages: WhatsApp profile name and business-scoped user id, by number
            profiles = {
                contact.get("wa_id"): {
                    "name": (contact.get("profile") or {}).get("name"),
                    "user_id": contact.get("user_id")
                }
                for contact in value.get("contacts", [])
            }

            for message in value.get("messages", []):
                profile = profiles.get(message.get("from")) or {}
                customer = {
                    "customer_name": profile.get("name"),
                    "customer_user_id": profile.get("user_id") or message.get("user_id"),
                    "referral": message.get("referral")  # Only on a first message from a Click-to-WhatsApp ad
                }

                # Emoji reaction to one of our messages: shown on that message, no reply
                if message.get("type") == "reaction":
                    reaction = message.get("reaction") or {}
                    if reaction.get("message_id"):
                        process_reaction_task.delay(phone_number_id=phone_number_id, reacted_wamid=reaction["message_id"], emoji=reaction.get("emoji"))
                    continue

                # Files: images, documents, voice notes, videos and stickers are downloaded (and read / transcribed)
                media_type = message.get("type")
                media = message.get(media_type) if media_type in MEDIA_TYPES else None
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
                        },
                        **customer
                    )
                    continue

                described = _describe_message(message)
                process_chat_message_task.delay(
                    phone_number_id=phone_number_id,
                    customer_phone=message.get("from"),
                    user_text=described["text"],
                    wamid=message.get("id"),
                    message_type=described["message_type"],
                    message_data=described.get("message_data"),
                    ai_reply=described.get("ai_reply", True),
                    **customer
                )

            for status in value.get("statuses", []):
                process_whatsapp_status_task.delay(
                    wamid=status.get("id"),
                    status=status.get("status"),
                    error=_status_error(status),
                    callback_data=status.get("biz_opaque_callback_data"),
                )

    return {"status": "ok"}
