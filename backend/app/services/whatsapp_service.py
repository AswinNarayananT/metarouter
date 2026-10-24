from typing import Optional
import requests
from sqlalchemy.orm import Session
from app.config import settings
from app.models.conversation_model import ChatMessage, MessageStatus
from app.realtime.notify import notify_message_status

# Delivery states only move forward; FAILED can replace any of them
_STATUS_ORDER = {
    MessageStatus.PENDING: 0,
    MessageStatus.SENT: 1,
    MessageStatus.DELIVERED: 2,
    MessageStatus.READ: 3,
}


# Meta error codes that clear on their own and are safe to retry (Meta usually sends these as HTTP 400)
# 1, 2: unknown / service temporarily unavailable   4: app rate limit   80007: WABA rate limit
# 130429: throughput limit for the number   131000: something went wrong   131016: service unavailable
# 131056: too many messages to the same customer (needs a longer wait)
RETRYABLE_ERROR_CODES = {1, 2, 4, 80007, 130429, 131000, 131016, 131056}
PAIR_RATE_LIMIT_CODE = 131056


class WhatsAppRetryableError(Exception):
    """Temporary failure (network, timeout, rate limit, Meta server error) — safe to retry."""

    def __init__(self, message: str, code: Optional[int] = None):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}" if code else message)


class WhatsAppPermanentError(Exception):
    """Meta rejected the message (e.g. outside the 24-hour window, invalid number) — retrying won't help."""

    def __init__(self, code: Optional[int], message: str):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}" if code else message)


# 190: the stored access token no longer works (app removed, password changed, expired, invalidated)
TOKEN_ERROR_CODE = 190


class WhatsAppTokenError(WhatsAppPermanentError):
    def __init__(self, message: str, subcode: Optional[int] = None):
        self.subcode = subcode
        super().__init__(TOKEN_ERROR_CODE, message)


def _error_from_response(response: requests.Response) -> tuple[Optional[int], str]:
    try:
        error = response.json().get("error", {})
        detail = error.get("error_data", {}).get("details")
        message = detail or error.get("message") or response.text
        return error.get("code"), message
    except ValueError:
        return None, response.text or f"HTTP {response.status_code}"


def _raise_for_meta_error(response: requests.Response):
    if response.status_code < 400:
        return

    code, message = _error_from_response(response)

    # 1. Rate limits and temporary Meta errors -> retry (checked by Meta's error code, not only the HTTP status)
    if code in RETRYABLE_ERROR_CODES or response.status_code == 429 or response.status_code >= 500:
        raise WhatsAppRetryableError(message, code)

    # 2. Token no longer works -> the number is disconnected (the subcode tells why)
    if code == TOKEN_ERROR_CODE:
        try:
            subcode = response.json().get("error", {}).get("error_subcode")
        except ValueError:
            subcode = None
        raise WhatsAppTokenError(message, subcode)

    # 3. Everything else is a real rejection (24h window, invalid number ...) -> failed
    raise WhatsAppPermanentError(code, message)


def send_text(phone_number_id: str, access_token: str, to: str, text: str, callback_data: Optional[str] = None) -> str:
    """
    Sends a text message through the WhatsApp Cloud API and returns Meta's message id (wamid).
    `callback_data` is echoed back by Meta in status webhooks, so a send whose response was
    lost (timeout) can still be matched to our message.
    """
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text},
    }
    if callback_data:
        payload["biz_opaque_callback_data"] = callback_data

    return _post_message(url, access_token, payload)


def send_template(phone_number_id: str, access_token: str, to: str, template_data: dict, callback_data: Optional[str] = None) -> str:
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{phone_number_id}/messages"
    template = {
        "name": template_data["name"],
        "language": {"code": template_data["language"]}
    }

    # Body variables {{1}}, {{2}} ... in order
    parameters = template_data.get("parameters") or []
    if parameters:
        template["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": value} for value in parameters]
        }]

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": template
    }
    if callback_data:
        payload["biz_opaque_callback_data"] = callback_data

    return _post_message(url, access_token, payload)


def upload_media(phone_number_id: str, access_token: str, content: bytes, mime_type: str, file_name: str) -> str:
    # 1. Files an agent sends are uploaded to Meta first; the message then refers to the returned media id
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{phone_number_id}/media"
    try:
        response = requests.post(
            url,
            data={"messaging_product": "whatsapp", "type": mime_type},
            files={"file": (file_name, content, mime_type)},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS * 4  # Uploads take longer than a text send
        )
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc

    _raise_for_meta_error(response)

    try:
        return response.json()["id"]
    except (ValueError, KeyError) as exc:
        raise WhatsAppRetryableError(f"Unexpected response from Meta: {response.text[:200]}") from exc


def send_media(phone_number_id: str, access_token: str, to: str, kind: str, media_id: str, caption: Optional[str] = None, file_name: Optional[str] = None, callback_data: Optional[str] = None) -> str:
    # kind = "image" or "document"; documents keep their file name on the customer's phone
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{phone_number_id}/messages"
    media = {"id": media_id}
    if caption:
        media["caption"] = caption
    if kind == "document" and file_name:
        media["filename"] = file_name

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": kind,
        kind: media
    }
    if callback_data:
        payload["biz_opaque_callback_data"] = callback_data

    return _post_message(url, access_token, payload)


def _post_message(url: str, access_token: str, payload: dict) -> str:
    try:
        response = requests.post(url, json=payload, headers={"Authorization": f"Bearer {access_token}"}, timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc

    _raise_for_meta_error(response)

    try:
        return response.json()["messages"][0]["id"]
    except (ValueError, KeyError, IndexError) as exc:
        raise WhatsAppRetryableError(f"Unexpected response from Meta: {response.text[:200]}") from exc


def get_phone_number_status(phone_number_id: str, access_token: str) -> dict:
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{phone_number_id}"

    try:
        response = requests.get(url, params={"fields": "quality_rating,messaging_limit_tier"}, headers={"Authorization": f"Bearer {access_token}"}, timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc

    _raise_for_meta_error(response)

    data = response.json()
    return {
        "quality_rating": data.get("quality_rating"),
        "messaging_limit_tier": data.get("messaging_limit_tier")
    }


def get_message_templates(waba_id: str, access_token: str, max_pages: int = 10) -> list:
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{waba_id}/message_templates"
    params = {"status": "APPROVED", "fields": "name,language,category,status,parameter_format,components", "limit": 100}
    templates = []

    # Meta pages the list; follow "next" links up to max_pages
    for _ in range(max_pages):
        try:
            response = requests.get(url, params=params, headers={"Authorization": f"Bearer {access_token}"}, timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS)
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise WhatsAppRetryableError(f"Network error: {exc}") from exc

        _raise_for_meta_error(response)

        data = response.json()
        templates.extend(data.get("data", []))

        next_url = data.get("paging", {}).get("next")
        if not next_url:
            break
        url, params = next_url, None  # The next link already contains the query

    return templates


def callback_data_for(message_id: int) -> str:
    return f"msg:{message_id}"


def message_id_from_callback_data(callback_data: Optional[str]) -> Optional[int]:
    if callback_data and callback_data.startswith("msg:"):
        try:
            return int(callback_data[4:])
        except ValueError:
            return None
    return None


def apply_status_update(
    db: Session,
    wamid: str,
    status: MessageStatus,
    error: Optional[str] = None,
    message_id: Optional[int] = None,
) -> bool:
    """
    Applies a delivery update from Meta's status webhook. Returns True if the message changed.
    Updates can arrive out of order, so a status never moves backwards (e.g. delivered after read).

    `message_id` (from biz_opaque_callback_data) finds messages whose send response was lost:
    Meta accepted them, but we never received the wamid.
    """
    message = db.query(ChatMessage).filter(ChatMessage.wamid == wamid).first()
    if not message and message_id:
        message = db.get(ChatMessage, message_id)
        if message and message.wamid not in (None, wamid):
            return False  # callback data points at a different, already-identified message
    if not message:
        return False

    if status != MessageStatus.FAILED:
        # We marked it failed without ever getting a wamid (e.g. timed out), but Meta says it
        # went out — trust Meta. A failure Meta itself reported (wamid known) stays failed.
        lost_response = message.status == MessageStatus.FAILED and message.wamid is None
        if message.status == MessageStatus.FAILED and not lost_response:
            return False
        if not lost_response and message.status is not None and _STATUS_ORDER[status] <= _STATUS_ORDER.get(message.status, -1):
            return False

    message.wamid = message.wamid or wamid
    message.status = status
    message.error = error if status == MessageStatus.FAILED else None
    db.commit()

    # Move the delivery tick in the dashboard
    notify_message_status(message)
    return True


def get_media_info(media_id: str, access_token: str) -> dict:
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{media_id}"

    try:
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc

    # Rate limits retry; 400 / 401 / 404 means the media id is invalid or older than 30 days
    _raise_for_meta_error(response)

    data = response.json()
    return {
        "url": data.get("url"),
        "mime_type": data.get("mime_type"),
        "file_size": data.get("file_size"),
        "sha256": data.get("sha256")
    }


def download_media(url: str, access_token: str, max_bytes: int) -> bytes:
    try:
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS, stream=True)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc

    # The download URL expires after 5 minutes; a retry fetches a fresh one
    if response.status_code >= 400:
        raise WhatsAppRetryableError(f"Media download failed with HTTP {response.status_code}")

    # Read in chunks and stop early if the file is bigger than allowed
    content = bytearray()
    try:
        for chunk in response.iter_content(chunk_size=65536):
            content.extend(chunk)
            if len(content) > max_bytes:
                raise WhatsAppPermanentError(None, f"File is larger than the {max_bytes // (1024 * 1024)} MB limit")
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc
    finally:
        response.close()

    return bytes(content)


# ------------------------------------------------------------------
# Embedded Signup: connecting a business's number (server-to-server only; the app secret never leaves here)
# ------------------------------------------------------------------

def _graph_call(method: str, path: str, access_token: Optional[str] = None, params: Optional[dict] = None, body: Optional[dict] = None) -> dict:
    url = f"{settings.META_GRAPH_API_URL}/{settings.META_API_VERSION}/{path}"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
    try:
        response = requests.request(method, url, params=params, json=body, headers=headers, timeout=settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise WhatsAppRetryableError(f"Network error: {exc}") from exc
    _raise_for_meta_error(response)
    try:
        return response.json()
    except ValueError as exc:
        raise WhatsAppRetryableError(f"Unexpected response from Meta: {response.text[:200]}") from exc


def exchange_signup_code(code: str) -> str:
    # The popup's one-time code (valid ~30 seconds) -> the business's long-lived token
    data = _graph_call("GET", "oauth/access_token", params={"client_id": settings.META_APP_ID, "client_secret": settings.META_APP_SECRET, "code": code})
    token = data.get("access_token")
    if not token:
        raise WhatsAppPermanentError(None, "Meta didn't return an access token")
    return token


def granted_waba_ids(access_token: str, business_id: Optional[str] = None) -> set:
    # WhatsApp Business Accounts the business actually gave this token (so a tampered request can't claim another one)
    data = _graph_call("GET", "debug_token", params={"input_token": access_token, "access_token": f"{settings.META_APP_ID}|{settings.META_APP_SECRET}"})
    info = data.get("data") or {}
    whatsapp_scopes = [scope for scope in info.get("granular_scopes") or [] if scope.get("scope") in ("whatsapp_business_management", "whatsapp_business_messaging")]
    print(f"[SIGNUP] debug_token: {info}")
    targets = {target for scope in whatsapp_scopes for target in (scope.get("target_ids") or [])}
    if targets or not whatsapp_scopes:
        return targets

    # A WhatsApp scope with no target list: ask the business the popup reported for its accounts (the token only sees what Meta lets it)
    if not business_id:
        return targets
    for edge in ("owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"):
        try:
            data = _graph_call("GET", f"{business_id}/{edge}", access_token, params={"fields": "id", "limit": 100})
        except WhatsAppPermanentError as exc:
            print(f"[SIGNUP] {business_id}/{edge} failed: {exc}")
            continue
        targets |= {account.get("id") for account in data.get("data") or []}
    print(f"[SIGNUP] accounts found through business {business_id}: {sorted(targets)}")
    return targets


def waba_phone_number_ids(waba_id: str, access_token: str) -> set:
    data = _graph_call("GET", f"{waba_id}/phone_numbers", access_token, params={"fields": "id", "limit": 100})
    return {number.get("id") for number in data.get("data") or []}


def phone_number_details(phone_number_id: str, access_token: str) -> dict:
    return _graph_call("GET", phone_number_id, access_token, params={"fields": "display_phone_number,verified_name,quality_rating,messaging_limit_tier"})


def register_phone_number(phone_number_id: str, access_token: str, pin: str) -> None:
    # Turns the number on for the Cloud API; the PIN becomes its two-step verification PIN
    _graph_call("POST", f"{phone_number_id}/register", access_token, body={"messaging_product": "whatsapp", "pin": pin})


def deregister_phone_number(phone_number_id: str, access_token: str) -> None:
    _graph_call("POST", f"{phone_number_id}/deregister", access_token)


def subscribe_app_to_waba(waba_id: str, access_token: str) -> None:
    # Customer messages and delivery updates of this account arrive at our webhook
    _graph_call("POST", f"{waba_id}/subscribed_apps", access_token)


def unsubscribe_app_from_waba(waba_id: str, access_token: str) -> None:
    _graph_call("DELETE", f"{waba_id}/subscribed_apps", access_token)
