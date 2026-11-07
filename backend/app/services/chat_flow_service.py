from copy import deepcopy
from typing import Optional
from sqlalchemy.orm import Session
from app.models.ai_settings_model import OrganizationAISettings
from app.models.chat_flow_model import ChatFlow
from app.models.conversation_model import Conversation
from app.models.organization_model import Organization
from app.services.conversation_service import first_name
from app.services.intent_service import INTENT_OPTIONS, ADDABLE_MODULE_OPTIONS, enabled_intent_options, OTHER_OPTION, DEFAULT_GREETING
from app.services.messaging_service import fit, INTERACTIVE_BODY_MAX_CHARS, MAX_REPLY_BUTTONS, MAX_LIST_ROWS, BUTTON_TITLE_MAX_CHARS, SECTION_TITLE_MAX_CHARS

# The admin's chat menu (Chat Menu page): a start question, follow-up questions, answers and built-in flows.
# Taps carry "flow:{box id}:{option id}"; the ids are looked up in the workspace's own menu.
FLOW_REPLY_PREFIX = "flow:"
DEFAULT_MENU_BUTTON = "Options"
FALLBACK_QUESTION_TEXT = "Please choose an option:"  # A question whose text came out empty ("{name}" with no name)
AUTO_ID_PREFIX = "auto_"  # Boxes and options a module added: fixed ids, so taps stay valid between messages
BOX_COLUMN_WIDTH = 420
BOX_ROW_HEIGHT = 160


def default_flow(db: Session, organization_id: int) -> dict:
    # Today's menu as a document: the greeting from AI settings (or the default), then order (while Orders is on) / problem / something else
    greeting = db.query(OrganizationAISettings.greeting_message).filter(OrganizationAISettings.organization_id == organization_id).scalar()
    options = enabled_intent_options(db, organization_id) + [OTHER_OPTION]

    nodes = [{
        "id": "start",
        "type": "question",
        "text": (greeting or "").strip() or DEFAULT_GREETING,
        "menu_button": None,
        "options": [{"id": option["id"], "title": option["title"], "description": None, "next": option["id"]} for option in options],
        "position": {"x": 0, "y": 0}
    }]
    for index, option in enumerate(options):
        box = {"id": option["id"], "type": option["box"], "position": {"x": BOX_COLUMN_WIDTH, "y": index * BOX_ROW_HEIGHT}}
        if box["type"] != "order":
            box["text"] = None
        nodes.append(box)

    return {"start": "start", "nodes": nodes}


def enabled_modules(db: Session, organization_id: int) -> set:
    return {option["module"] for option in enabled_intent_options(db, organization_id)}


def off_box_types(db: Session, organization_id: int) -> set:
    # Box types whose module is off: options leading to them are hidden
    modules = enabled_modules(db, organization_id)
    return {option["box"] for option in INTENT_OPTIONS if option["module"] not in modules}


def with_new_modules(flow: dict, known_modules: list, modules: set) -> dict:
    # Modules turned on since the admin last saved join the start question; nothing is stored until the admin saves
    flow = deepcopy(flow)
    start = find_node(flow, flow["start"])
    for module_option in ADDABLE_MODULE_OPTIONS:
        if module_option["module"] not in modules or module_option["module"] in known_modules:
            continue
        # Already in the menu, no room left, or WhatsApp would refuse a second option with this title
        titles = {option["title"].lower() for option in start["options"]}
        if any(node["type"] == module_option["box"] for node in flow["nodes"]) or len(start["options"]) >= MAX_LIST_ROWS or module_option["title"].lower() in titles:
            continue

        box_id = f"{AUTO_ID_PREFIX}{module_option['id']}"
        lowest = max(node["position"]["y"] for node in flow["nodes"])
        box = {"id": box_id, "type": module_option["box"], "position": {"x": start["position"]["x"] + BOX_COLUMN_WIDTH, "y": lowest + BOX_ROW_HEIGHT}}
        if box["type"] != "order":
            box["text"] = None
        flow["nodes"].append(box)
        start["options"].append({"id": box_id, "title": module_option["title"], "description": None, "next": box_id})
    return flow


def unadded_module_titles(flow: dict, known_modules: list, modules: set) -> list:
    # Modules that are on but couldn't join the menu (no room, or an option already has that title): the admin is told
    start = find_node(flow, flow["start"])
    box_types = {node["type"] for node in flow["nodes"]}
    return [option["title"] for option in ADDABLE_MODULE_OPTIONS if option["module"] in modules and option["module"] not in known_modules and option["box"] not in box_types]


def load_flow(db: Session, organization_id: int) -> tuple[dict, bool]:
    # The saved menu (with any module turned on since), or the default one (True = default)
    saved = db.query(ChatFlow.flow, ChatFlow.known_modules).filter(ChatFlow.organization_id == organization_id).first()
    if saved:
        return with_new_modules(saved.flow, saved.known_modules, enabled_modules(db, organization_id)), False
    return default_flow(db, organization_id), True


def find_node(flow: dict, node_id: Optional[str]) -> Optional[dict]:
    return next((node for node in flow.get("nodes") or [] if node.get("id") == node_id), None)


def visible_options(flow: dict, node: dict, off_boxes: set) -> list:
    # Options leading to a box whose module is off are hidden
    visible = []
    for option in node.get("options") or []:
        target = find_node(flow, option.get("next"))
        if not target or target["type"] in off_boxes:
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


def question_message(db: Session, conversation: Conversation, flow: dict, node: dict, off_boxes: set, text: Optional[str] = None) -> dict:
    # Up to 3 short options go out as buttons, more (or longer titles) as a list; no option left = the text alone
    # text: the same options asked in other words (not the greeting again)
    options = visible_options(flow, node, off_boxes)
    body = fit(render_text(db, conversation, text or node["text"]) or FALLBACK_QUESTION_TEXT, INTERACTIVE_BODY_MAX_CHARS)
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


def tapped_node(flow: dict, reply_id: str, off_boxes: set) -> Optional[dict]:
    # "flow:{box id}:{option id}" -> the box the option leads to (None: deleted since, or hidden now)
    parts = reply_id[len(FLOW_REPLY_PREFIX):].split(":")
    if len(parts) != 2:
        return None
    node = find_node(flow, parts[0])
    if not node or node["type"] != "question":
        return None
    option = next((option for option in visible_options(flow, node, off_boxes) if option["id"] == parts[1]), None)
    return find_node(flow, option["next"]) if option else None
