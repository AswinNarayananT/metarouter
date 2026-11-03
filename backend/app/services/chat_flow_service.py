from typing import Optional
from sqlalchemy.orm import Session
from app.models.ai_settings_model import OrganizationAISettings
from app.models.chat_flow_model import ChatFlow
from app.models.conversation_model import Conversation
from app.models.organization_model import Organization
from app.services.conversation_service import first_name
from app.services.intent_service import INTENT_OPTIONS, OTHER_OPTION, DEFAULT_GREETING
from app.services.messaging_service import fit, INTERACTIVE_BODY_MAX_CHARS, MAX_REPLY_BUTTONS, BUTTON_TITLE_MAX_CHARS, SECTION_TITLE_MAX_CHARS

# The admin's chat menu (Chat Menu page): a start question, follow-up questions, answers and built-in flows.
# Taps carry "flow:{box id}:{option id}"; the ids are looked up in the workspace's own menu.
FLOW_REPLY_PREFIX = "flow:"
DEFAULT_MENU_BUTTON = "Options"
FALLBACK_QUESTION_TEXT = "Please choose an option:"  # A question whose text came out empty ("{name}" with no name)
DEFAULT_FLOW_BOX_TYPES = {"order": "order", "support": "problem", "other": "ai"}  # Default menu option -> the box it leads to


def default_flow(db: Session, organization_id: int) -> dict:
    # Today's menu as a document: the greeting from AI settings (or the default), then order / problem / something else
    greeting = db.query(OrganizationAISettings.greeting_message).filter(OrganizationAISettings.organization_id == organization_id).scalar()
    options = INTENT_OPTIONS + [OTHER_OPTION]

    nodes = [{
        "id": "start",
        "type": "question",
        "text": (greeting or "").strip() or DEFAULT_GREETING,
        "menu_button": None,
        "options": [{"id": option["id"], "title": option["title"], "description": None, "next": option["id"]} for option in options],
        "position": {"x": 0, "y": 0}
    }]
    for index, option in enumerate(options):
        box = {"id": option["id"], "type": DEFAULT_FLOW_BOX_TYPES[option["id"]], "position": {"x": 420, "y": index * 160}}
        if box["type"] != "order":
            box["text"] = None
        nodes.append(box)

    return {"start": "start", "nodes": nodes}


def load_flow(db: Session, organization_id: int) -> tuple[dict, bool]:
    # The saved menu, or the default one (True = default)
    saved = db.query(ChatFlow.flow).filter(ChatFlow.organization_id == organization_id).scalar()
    if saved:
        return saved, False
    return default_flow(db, organization_id), True


def find_node(flow: dict, node_id: Optional[str]) -> Optional[dict]:
    return next((node for node in flow.get("nodes") or [] if node.get("id") == node_id), None)


def visible_options(flow: dict, node: dict, orders_on: bool) -> list:
    # Options leading to an Order box are hidden while Orders is off
    visible = []
    for option in node.get("options") or []:
        target = find_node(flow, option.get("next"))
        if not target or (target["type"] == "order" and not orders_on):
            continue
        visible.append(option)
    return visible


def render_text(db: Session, conversation: Conversation, text: str) -> str:
    # {name} = " " + the customer's first name (or nothing), {org} = the workspace name
    if "{name}" in text:
        name = first_name(conversation.customer_name) if conversation.customer_name else ""
        text = text.replace("{name}", f" {name}" if name else "")
    if "{org}" in text:
        org_name = db.query(Organization.name).filter(Organization.id == conversation.organization_id).scalar() or "us"
        text = text.replace("{org}", org_name)
    return text.strip()


def question_message(db: Session, conversation: Conversation, flow: dict, node: dict, orders_on: bool) -> dict:
    # Up to 3 short options go out as buttons, more (or longer titles) as a list; no option left = the text alone
    options = visible_options(flow, node, orders_on)
    body = fit(render_text(db, conversation, node["text"]) or FALLBACK_QUESTION_TEXT, INTERACTIVE_BODY_MAX_CHARS)
    if not options:
        return {"body": body}

    if len(options) <= MAX_REPLY_BUTTONS and all(len(option["title"]) <= BUTTON_TITLE_MAX_CHARS for option in options):
        return {"body": body, "buttons": [{"id": f"{FLOW_REPLY_PREFIX}{node['id']}:{option['id']}", "title": option["title"]} for option in options]}

    button = node.get("menu_button") or DEFAULT_MENU_BUTTON
    rows = []
    for option in options:
        row = {"id": f"{FLOW_REPLY_PREFIX}{node['id']}:{option['id']}", "title": option["title"]}
        if option.get("description"):
            row["description"] = option["description"]
        rows.append(row)
    return {"body": body, "menu": {"button": button, "sections": [{"title": fit(button, SECTION_TITLE_MAX_CHARS), "rows": rows}]}}


def tapped_node(flow: dict, reply_id: str, orders_on: bool) -> Optional[dict]:
    # "flow:{box id}:{option id}" -> the box the option leads to (None: deleted since, or hidden now)
    parts = reply_id[len(FLOW_REPLY_PREFIX):].split(":")
    if len(parts) != 2:
        return None
    node = find_node(flow, parts[0])
    if not node or node["type"] != "question":
        return None
    option = next((option for option in visible_options(flow, node, orders_on) if option["id"] == parts[1]), None)
    return find_node(flow, option["next"]) if option else None
