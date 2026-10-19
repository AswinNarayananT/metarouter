import csv
import io
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.config import settings
from app.models.conversation_model import Conversation, ChatMessage, MessageStatus
from app.models.contact_model import ContactOptOut
from app.models.whatsapp_model import WhatsAppNumber

PHONE_HEADERS = {"phone", "phone_number", "phone number", "mobile", "number", "whatsapp", "contact"}
NAME_HEADERS = {"name", "full_name", "full name", "customer_name", "customer name", "contact_name"}

# Unique customers a number may start business-initiated conversations with per 24 hours
TIER_LIMITS = {"TIER_50": 50, "TIER_250": 250, "TIER_1K": 1000, "TIER_2K": 2000, "TIER_10K": 10000, "TIER_100K": 100000, "TIER_UNLIMITED": None}

QUERY_CHUNK_SIZE = 1000
VARIABLE_PATTERN = re.compile(r"\{\{(\d+)\}\}")


def normalize_phone(raw) -> Optional[str]:
    text = str(raw or "").strip()
    digits = re.sub(r"\D", "", text)

    # 0091 98765 43210 -> 919876543210 (international prefix written as 00)
    if text.startswith("00"):
        digits = digits[2:]

    # Country code + number: 8 to 15 digits (E.164)
    if 8 <= len(digits) <= 15:
        return digits
    return None


def parse_contacts_csv(content: bytes) -> list:
    if len(content) > settings.BROADCAST_MAX_CSV_BYTES:
        raise ValueError(f"CSV file is larger than {settings.BROADCAST_MAX_CSV_BYTES // (1024 * 1024)} MB")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("CSV file must be UTF-8 encoded")

    rows = [row for row in csv.reader(io.StringIO(text)) if any(cell.strip() for cell in row)]
    if not rows:
        raise ValueError("CSV file is empty")

    # 1. Find the phone and name columns from the header (or treat the first column as phone)
    header = [cell.strip().lower() for cell in rows[0]]
    phone_col = next((i for i, cell in enumerate(header) if cell in PHONE_HEADERS), None)
    name_col = next((i for i, cell in enumerate(header) if cell in NAME_HEADERS), None)

    if phone_col is None:
        phone_col = 0
        # No recognised header: the first row is data only if it looks like a phone number
        data_rows = rows if normalize_phone(rows[0][0]) else rows[1:]
    else:
        data_rows = rows[1:]

    if len(data_rows) > settings.BROADCAST_MAX_RECIPIENTS:
        raise ValueError(f"CSV has more than {settings.BROADCAST_MAX_RECIPIENTS} contacts")

    # 2. Keep only phone + name
    contacts = []
    for row in data_rows:
        phone = row[phone_col] if len(row) > phone_col else ""
        name = row[name_col].strip() if name_col is not None and len(row) > name_col else ""
        contacts.append({"phone": phone, "name": name or None})

    return contacts


def build_audience(db: Session, organization_id: int, contacts: Optional[list] = None) -> dict:
    # 1. Source list: the uploaded contacts, or every customer the company has chatted with
    if contacts is None:
        phones = db.query(Conversation.customer_phone).filter(Conversation.organization_id == organization_id).distinct().all()
        contacts = [{"phone": p.customer_phone, "name": None} for p in phones]

    counts = {
        "total_input": len(contacts),
        "duplicates_removed": 0,
        "skipped_invalid": 0,
        "skipped_opted_out": 0,
        "skipped_recent": 0,
        "queued_count": 0
    }
    recipients = []
    unique = {}

    # 2. Normalise numbers and remove duplicates
    for contact in contacts:
        phone = normalize_phone(contact.get("phone"))
        if not phone:
            recipients.append({"customer_phone": str(contact.get("phone") or "")[:50], "name": contact.get("name"), "status": "skipped", "skip_reason": "invalid"})
            counts["skipped_invalid"] += 1
            continue

        if phone in unique:
            # Keep the first row, but take a name from a later duplicate if the first had none
            unique[phone]["name"] = unique[phone]["name"] or contact.get("name")
            recipients.append({"customer_phone": phone, "name": contact.get("name"), "status": "skipped", "skip_reason": "duplicate"})
            counts["duplicates_removed"] += 1
            continue

        unique[phone] = {"customer_phone": phone, "name": contact.get("name"), "status": "pending", "skip_reason": None}
        recipients.append(unique[phone])

    phones = list(unique.keys())

    # 3. Customers who opted out (replied STOP)
    opted_out = set()
    for start in range(0, len(phones), QUERY_CHUNK_SIZE):
        chunk = phones[start:start + QUERY_CHUNK_SIZE]
        rows = db.query(ContactOptOut.customer_phone).filter(
            ContactOptOut.organization_id == organization_id,
            ContactOptOut.customer_phone.in_(chunk)
        ).all()
        opted_out.update(r.customer_phone for r in rows)

    # 4. Customers we sent any message to recently (AI, agent or broadcast)
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=settings.BROADCAST_RECENT_MESSAGE_DAYS)
    recently_messaged = set()
    for start in range(0, len(phones), QUERY_CHUNK_SIZE):
        chunk = phones[start:start + QUERY_CHUNK_SIZE]
        rows = db.query(Conversation.customer_phone).join(ChatMessage, ChatMessage.conversation_id == Conversation.id).filter(
            Conversation.organization_id == organization_id,
            Conversation.customer_phone.in_(chunk),
            ChatMessage.sender != "user",
            ChatMessage.created_at >= since
        ).distinct().all()
        recently_messaged.update(r.customer_phone for r in rows)

    for phone, recipient in unique.items():
        if phone in opted_out:
            recipient["status"], recipient["skip_reason"] = "skipped", "opted_out"
            counts["skipped_opted_out"] += 1
        elif phone in recently_messaged:
            recipient["status"], recipient["skip_reason"] = "skipped", "recently_messaged"
            counts["skipped_recent"] += 1
        else:
            counts["queued_count"] += 1

    return {"recipients": recipients, **counts}


def summarize_template(template: dict) -> dict:
    components = template.get("components") or []
    body = next((c for c in components if c.get("type") == "BODY"), {})
    header = next((c for c in components if c.get("type") == "HEADER"), None)
    buttons = next((c for c in components if c.get("type") == "BUTTONS"), {})
    body_text = body.get("text", "")

    # Only body variables with positional {{1}}, {{2}} are supported for now
    reason = None
    if template.get("parameter_format") == "NAMED":
        reason = "Templates with named variables are not supported yet"
    elif header and header.get("format") not in (None, "TEXT"):
        reason = "Templates with an image, video or document header are not supported yet"
    elif header and "{{" in (header.get("text") or ""):
        reason = "Templates with header variables are not supported yet"
    elif any("{{" in (button.get("url") or "") for button in buttons.get("buttons", [])):
        reason = "Templates with button variables are not supported yet"

    return {
        "name": template.get("name"),
        "language": template.get("language"),
        "category": template.get("category"),
        "body_text": body_text,
        "variable_count": len(set(VARIABLE_PATTERN.findall(body_text))),
        "supported": reason is None,
        "unsupported_reason": reason
    }


def render_body(body_text: str, parameters: list) -> str:
    def replace(match):
        index = int(match.group(1)) - 1
        return parameters[index] if 0 <= index < len(parameters) else match.group(0)

    return VARIABLE_PATTERN.sub(replace, body_text or "")


def check_number_quality(number: WhatsAppNumber) -> dict:
    # RED (flagged by Meta) blocks broadcasts; YELLOW is allowed with a warning
    if number.quality_rating == "RED":
        return {"blocked": True, "warning": "This number's quality is low (flagged by WhatsApp). Broadcasts are paused until it recovers."}
    if number.quality_rating == "YELLOW":
        return {"blocked": False, "warning": "This number's quality is medium. Sending marketing messages now may lower it further."}
    return {"blocked": False, "warning": None}


def tier_capacity(db: Session, number: WhatsAppNumber) -> dict:
    limit = TIER_LIMITS.get(number.messaging_tier or "TIER_1K", 1000)
    if limit is None:
        return {"limit": None, "used": 0, "remaining": None, "resume_at": None}

    # 1. Unique customers this number sent templates to in the last 24 hours (failed sends don't count)
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    counted = db.query(Conversation.customer_phone, func.min(ChatMessage.created_at).label("first_sent")).join(ChatMessage, ChatMessage.conversation_id == Conversation.id).filter(
        Conversation.organization_id == number.organization_id,
        Conversation.phone_number_id == number.phone_number_id,
        ChatMessage.message_type == "template",
        ChatMessage.status != MessageStatus.FAILED,
        ChatMessage.created_at >= since
    ).group_by(Conversation.customer_phone).all()

    used = len(counted)
    remaining = max(limit - used, 0)

    # 2. When the window frees up again: the oldest counted send turns 24 hours old
    resume_at = None
    if counted and remaining == 0:
        oldest = min(row.first_sent for row in counted)
        resume_at = oldest.replace(tzinfo=timezone.utc) + timedelta(hours=24, minutes=1)

    return {"limit": limit, "used": used, "remaining": remaining, "resume_at": resume_at}
