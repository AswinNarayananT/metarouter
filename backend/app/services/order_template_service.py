from typing import Optional
from sqlalchemy.orm import Session
from app.models.contact_model import ContactOptOut
from app.models.conversation_model import Conversation
from app.models.organization_model import User
from app.models.order_model import Order
from app.models.whatsapp_model import WhatsAppNumber
from app.services.messaging_service import queue_template_message
from app.services.whatsapp_service import create_message_template, get_message_templates, WhatsAppRetryableError, WhatsAppPermanentError

# Order updates outside WhatsApp's 24-hour window. Meta needs them approved on each workspace's own account,
# so the app submits these itself. Meta refuses a body that starts or ends with a variable.
TEMPLATE_LANGUAGE = "en"
ORDER_TEMPLATES = {
    "accepted": {"name": "metarouter_order_accepted", "body": "Order #{{1}} is accepted! We'll message you about the next step.", "example": ["1023"]},
    "out_for_delivery": {"name": "metarouter_order_out_for_delivery", "body": "Order #{{1}} is out for delivery. Please keep this number ready.", "example": ["1023"]},
    "ready_for_pickup": {"name": "metarouter_order_ready_for_pickup", "body": "Order #{{1}} is ready to pick up. Please show this number at the store.", "example": ["1023"]},
    "rejected": {"name": "metarouter_order_rejected", "body": "Sorry, we can't take order #{{1}}. Reason: {{2}}. Please message us if you need help.", "example": ["1023", "Item out of stock"]},
}


def create_missing_order_templates(number: WhatsAppNumber) -> list:
    # Submits what this account doesn't have yet, in any state: a rejected template isn't sent again and again
    existing = {template.get("name") for template in get_message_templates(number.waba_id, number.access_token, status=None)}
    created = []
    for template in ORDER_TEMPLATES.values():
        if template["name"] not in existing:
            create_message_template(number.waba_id, number.access_token, template["name"], TEMPLATE_LANGUAGE, template["body"], template["example"])
            created.append(template["name"])
    return created


def template_parameters(order: Order, status: str, reason: Optional[str]) -> list:
    # Meta refuses line breaks in a variable
    parameters = [str(order.number)]
    if status == "rejected":
        parameters.append(" ".join((reason or "Not available").split()))
    return parameters


def send_order_template(db: Session, order: Order, conversation: Conversation, status: str, reason: Optional[str], text: str, user: User) -> bool:
    # True = the update is on its way; False = it couldn't be sent, and the team is told to reach the customer another way
    template = ORDER_TEMPLATES.get(status)
    number = db.query(WhatsAppNumber).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id, WhatsAppNumber.status == "connected").first()
    if not template or not number:
        return False

    opted_out = db.query(ContactOptOut.id).filter(ContactOptOut.organization_id == order.organization_id, ContactOptOut.customer_phone == conversation.customer_phone).first()
    if opted_out:
        return False

    # Only an approved template can be sent, and Meta decides when that is
    try:
        approved = get_message_templates(number.waba_id, number.access_token)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        print(f"[ORDER] #{order.number}: couldn't load templates: {exc}")
        return False
    if not any(t.get("name") == template["name"] and t.get("language") == TEMPLATE_LANGUAGE for t in approved):
        return False

    template_data = {"name": template["name"], "language": TEMPLATE_LANGUAGE, "parameters": template_parameters(order, status, reason)}
    queue_template_message(db, conversation, text, template_data, sent_by_user_id=user.id)
    return True
