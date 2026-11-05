import json
import re
import time
import uuid
from contextlib import contextmanager
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.config import settings
from app.core.features import is_feature_enabled
from app.core.redis_client import redis_client
from app.models.conversation_model import Conversation
from app.models.product_model import Product
from app.services.messaging_service import fit, queue_interactive_message, queue_outgoing_message, OutgoingMessageError, INTERACTIVE_BODY_MAX_CHARS, MAX_LIST_ROWS, ROW_TITLE_MAX_CHARS, ROW_DESCRIPTION_MAX_CHARS
from app.services.product_service import current_products, stock_status
from app.services.order_service import price_items, place_order, publish_order, order_details_text, item_lines_text, address_label, map_link, get_customer_address, workspace_currency, last_order
from app.services.order_list_service import read_order_list
from app.services.conversation_service import record_activity, ai_auto_reply_on
from app.services.notification_service import notify_team_of_order
from app.utils.money import format_price

# Ordering in chat: the prompt after "Place an order", and the category / product list menus (tap to browse)
ORDERING_PROMPT = "What would you like to order? Just type it, send a voice note, or a photo of your list. 📝"
TAP_ORDERING_PROMPT = "What would you like to order? Tap View products to see what we have. 📝"  # AI auto-reply off: nothing reads a typed list
PRODUCT_LIST_OFFER = "You can also pick items from our product list:"
VIEW_PRODUCTS_BUTTON = {"id": "browse:categories", "title": "📋 View products"}
ORDER_AGAIN_BUTTON = {"id": "reorder:show", "title": "🔁 Order again"}
NO_PRODUCTS_TEXT = "Sorry, we don't have any products listed right now. Please tell us what you need and our team will help."
OTHER_CATEGORY = "Other"  # Products without a category
PAGE_ROWS = MAX_LIST_ROWS - 1  # A full page keeps one row for "More"

BROWSE_PREFIX = "browse:categories"
CATEGORY_PREFIX = "cat:"
PRODUCT_PREFIX = "product:"


def orderable_products(db: Session, organization_id: int):
    # What customers can see: current (not archived) products that are for sale
    return current_products(db, organization_id).filter(Product.is_active.is_(True))


def stock_label(product: Product) -> str:
    status = stock_status(product)
    if status == "out":
        return "Out of stock"
    if status == "low":
        return f"Only {product.stock_quantity} left"
    if status == "in_stock":
        return "In stock"
    return ""


def product_row_description(product: Product, currency: str) -> str:
    # "₹28 · In stock"; the full name goes here too when the title had to be shortened
    parts = [format_price(product.price, currency)]
    if stock_label(product):
        parts.append(stock_label(product))
    if len(product.name) > ROW_TITLE_MAX_CHARS:
        parts.append(product.name)
    return fit(" · ".join(parts), ROW_DESCRIPTION_MAX_CHARS)


def page_slice(items: list, page: int) -> tuple:
    # Up to 10 rows fit on one page; longer lists show 9 per page plus a "More" row
    if len(items) <= MAX_LIST_ROWS and page == 0:
        return items, False
    start = page * PAGE_ROWS
    return items[start:start + PAGE_ROWS], len(items) > start + PAGE_ROWS


def category_names(db: Session, organization_id: int) -> list:
    # Sorted by name, products without a category last (as "Other")
    rows = orderable_products(db, organization_id).with_entities(Product.category).distinct().all()
    names = sorted({(r.category or "").strip() for r in rows if (r.category or "").strip()}, key=str.lower)
    if any(not (r.category or "").strip() for r in rows):
        names.append("")
    return names


def category_menu(db: Session, organization_id: int, page: int = 0) -> Optional[dict]:
    # {"body", "menu"} for queue_interactive_message; None when nothing is for sale
    names = category_names(db, organization_id)
    if not names:
        return None
    shown, more = page_slice(names, page)
    if not shown:
        shown, more = page_slice(names, 0)
        page = 0
    rows = [{"id": f"{CATEGORY_PREFIX}0:{name}", "title": fit(name or OTHER_CATEGORY, ROW_TITLE_MAX_CHARS)} for name in shown]
    if more:
        rows.append({"id": f"{BROWSE_PREFIX}:{page + 1}", "title": "➡️ More categories"})
    return {"body": "Pick a category:", "menu": {"button": "Categories", "sections": [{"title": "Categories", "rows": rows}]}}


def product_menu(db: Session, organization_id: int, category: str, page: int = 0) -> Optional[dict]:
    # One category's products ("" = without a category), sorted by name; None when the category is now empty
    query = orderable_products(db, organization_id)
    if category:
        query = query.filter(func.trim(Product.category) == category)
    else:
        query = query.filter((Product.category.is_(None)) | (func.trim(Product.category) == ""))
    products = query.order_by(func.lower(Product.name)).all()
    if not products:
        return None
    shown, more = page_slice(products, page)
    if not shown:
        shown, more = page_slice(products, 0)
        page = 0
    currency = workspace_currency(db, organization_id)
    rows = [{"id": f"{PRODUCT_PREFIX}{p.id}", "title": fit(p.name, ROW_TITLE_MAX_CHARS), "description": product_row_description(p, currency)} for p in shown]
    if more:
        rows.append({"id": f"{CATEGORY_PREFIX}{page + 1}:{category}", "title": "➡️ More items"})
    label = category or OTHER_CATEGORY
    return {"body": f"{label}: tap an item to add it.", "menu": {"button": "Products", "sections": [{"title": fit(label, 24), "rows": rows}]}}


def parse_category_reply(reply_id: str) -> Optional[tuple]:
    # "cat:2:Dairy" -> (2, "Dairy")
    page, _, name = reply_id[len(CATEGORY_PREFIX):].partition(":")
    return (int(page), name) if page.isdigit() else None


def parse_browse_reply(reply_id: str) -> int:
    # "browse:categories" -> 0, "browse:categories:1" -> 1
    page = reply_id[len(BROWSE_PREFIX):].lstrip(":")
    return int(page) if page.isdigit() else 0


def tapped_product(db: Session, organization_id: int, reply_id: str) -> Optional[Product]:
    # Only this workspace's products that are still for sale; anything else is ignored
    product_id = reply_id[len(PRODUCT_PREFIX):]
    if not product_id.isdigit():
        return None
    return orderable_products(db, organization_id).filter(Product.id == int(product_id)).first()


# ---- Placing an order: pick items, delivery or pickup, address, confirm ----
# No lasting cart: what the customer picks lives in Redis only while they're ordering (ORDER_SELECTION_EXPIRE_MINUTES)

SELECTION_KEY = "order:selection:{}"
LOCK_KEY = "order:lock:{}"
PLACED_KEY = "order:placed:{}"
LOCK_SECONDS = 30  # Longer than one step (a few queries and sends); released as soon as the step is done
LOCK_WAIT_SECONDS = 10
PLACED_MEMORY_SECONDS = 300  # A late second tap on Confirm is told the order is already placed
QUANTITY_PREFIX = "qty:"
ORDER_PREFIX = "order:"
PICK_PREFIX = "pick:"  # "pick:{product id}" / "pick:skip": which product an unclear list item meant
REORDER_PREFIX = "reorder:"
BODY_ROOM = INTERACTIVE_BODY_MAX_CHARS - 24  # A little spare under WhatsApp's limit

ITEM_ADDED_BUTTONS = [{"id": "order:add", "title": "➕ Add another item"}, {"id": "order:place", "title": "✅ Place order"}, {"id": "order:cancel", "title": "❌ Cancel"}]
FULFILMENT_BUTTONS = [{"id": "order:fulfil:delivery", "title": "🚚 Delivery"}, {"id": "order:fulfil:pickup", "title": "🏬 Pickup"}]
SAVED_ADDRESS_BUTTONS = [{"id": "order:address:same", "title": "✅ Same address"}, {"id": "order:address:new", "title": "📍 New address"}]
SKIP_BUTTON = [{"id": "order:address:skip", "title": "Skip"}]
CONFIRM_BUTTONS = [{"id": "order:confirm", "title": "✅ Confirm order"}, {"id": "order:cancel", "title": "❌ Cancel"}]
LAST_ORDER_BUTTONS = [{"id": "reorder:same", "title": "🔁 Same again"}, {"id": "reorder:add", "title": "➕ Add to it"}, {"id": "reorder:new", "title": "🛒 New order"}]

FULFILMENT_QUESTION = "How would you like to get your order?"
LOCATION_REQUEST_TEXT = "Please share your delivery location (tap the button), or type your full address."
HOUSE_DETAILS_TEXT = "Got it! Add your house/flat number and a landmark, or tap Skip."
TIMED_OUT_TEXT = "This order timed out. Tap View products to start again."
CANCELLED_TEXT = "Your order was cancelled. Tap View products whenever you're ready."
NOTHING_AVAILABLE_TEXT = "Sorry, none of these items can be ordered right now. Tap View products to pick again."
CHANGED_TEXT = "Prices or stock changed since you saw your order. Please check and confirm again."
USE_BUTTONS_TEXT = "You have an order in progress. Please use the buttons above to continue, or tap ❌ Cancel to stop."
LIST_HEAD_TEXT = "Here's what I got from your list ✅"
NOTHING_FOUND_TEXT = "Sorry, we couldn't find these: {}. Tap View products to see what we have."
LAST_ORDER_GONE_TEXT = "Sorry, the items from your last order aren't available right now. Tap View products to pick again."
ADDRESS_MAX_CHARS = 500
LEADING_NUMBER = re.compile(r"^\s*(\d{1,4})(?!\d)")  # "2", "2 packets", "3kg" -> the quantity

# Release the step lock only if this task still holds it (an expired lock may already belong to another task)
RELEASE_LOCK_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"


@contextmanager
def order_step_lock(conversation_id: int):
    # One order step at a time per chat: messages handled in parallel would otherwise overwrite each other's picks
    key, token = LOCK_KEY.format(conversation_id), uuid.uuid4().hex
    deadline = time.monotonic() + LOCK_WAIT_SECONDS
    while not redis_client.set(key, token, nx=True, ex=LOCK_SECONDS):
        if time.monotonic() > deadline:
            break  # Something is stuck: go on rather than drop the customer's message
        time.sleep(0.05)
    try:
        yield
    finally:
        redis_client.eval(RELEASE_LOCK_SCRIPT, 1, key, token)


def get_selection(conversation_id: int) -> Optional[dict]:
    raw = redis_client.get(SELECTION_KEY.format(conversation_id))
    return json.loads(raw) if raw else None


def save_selection(conversation_id: int, selection: dict):
    # Every step restarts the timer
    redis_client.set(SELECTION_KEY.format(conversation_id), json.dumps(selection), ex=settings.ORDER_SELECTION_EXPIRE_MINUTES * 60)


def clear_selection(conversation_id: int):
    redis_client.delete(SELECTION_KEY.format(conversation_id))


def order_in_progress(conversation_id: int) -> bool:
    return redis_client.exists(SELECTION_KEY.format(conversation_id)) > 0


def send_view_products(db: Session, conversation: Conversation, text: str):
    queue_interactive_message(db, conversation, text, buttons=[VIEW_PRODUCTS_BUTTON])


def send_ordering_prompt(db: Session, conversation: Conversation, offer_last_order: bool = True):
    # The start of an order: Order again appears for a returning customer
    text = ORDERING_PROMPT if ai_auto_reply_on(db, conversation.organization_id) else TAP_ORDERING_PROMPT
    returning = offer_last_order and last_order(db, conversation.organization_id, conversation.customer_phone)
    queue_interactive_message(db, conversation, text, buttons=[VIEW_PRODUCTS_BUTTON, ORDER_AGAIN_BUTTON] if returning else [VIEW_PRODUCTS_BUTTON])


def quantity_buttons(product_id: int) -> list:
    # The product is in the id, so a button from an older "How many?" can't add a different product
    return [{"id": f"{QUANTITY_PREFIX}{product_id}:{n}", "title": str(n)} for n in (1, 2, 3)]


def start_quantity_step(db: Session, conversation: Conversation, product: Product):
    with order_step_lock(conversation.id):
        # A product tapped in the list: ask how many (the order is started, or this item joins it)
        if stock_status(product) == "out":
            send_view_products(db, conversation, f"Sorry, {fit(product.name, 200)} is out of stock right now.")
            return
        selection = get_selection(conversation.id) or {"items": []}
        if len(selection["items"]) >= settings.ORDER_MAX_ITEMS and product.id not in [pid for pid, _ in selection["items"]]:
            queue_interactive_message(db, conversation, f"You can order up to {settings.ORDER_MAX_ITEMS} different items at once. Place this order first.", buttons=ITEM_ADDED_BUTTONS[1:])
            return
        selection["step"] = "quantity"
        selection["pending_product_id"] = product.id
        save_selection(conversation.id, selection)
        queue_interactive_message(db, conversation, f"How many {fit(product.name, 200)}? Tap or type a number.", buttons=quantity_buttons(product.id))


def add_pending_item(db: Session, conversation: Conversation, selection: dict, quantity: int):
    # 1. The product still for sale, and how many can actually be had (stock, per-item and per-order limits)
    product = orderable_products(db, conversation.organization_id).filter(Product.id == selection.get("pending_product_id")).first()
    selection["pending_product_id"] = None
    selection["step"] = "items"
    items = {pid: qty for pid, qty in selection["items"]}
    if not product or stock_status(product) == "out" or (product.id not in items and len(items) >= settings.ORDER_MAX_ITEMS):
        save_selection(conversation.id, selection)
        send_view_products(db, conversation, "Sorry, that item can't be added to this order.")
        return
    already = items.get(product.id, 0)
    wanted = min(already + max(quantity, 1), settings.ORDER_ITEM_MAX_QUANTITY)
    note = ""
    if product.track_stock and wanted > product.stock_quantity:
        wanted = product.stock_quantity
        note = f"Only {product.stock_quantity} left, added {wanted - already}." if wanted > already else f"Only {product.stock_quantity} left, and they're already in your order."
    items[product.id] = wanted
    selection["items"] = [[pid, qty] for pid, qty in items.items()]

    # 2. What was added, the order so far (fitted to WhatsApp's limit), and what next
    added = wanted - already
    name = fit(product.name, 150)
    head = (f"Added {name} × {added} ✅" if added > 0 else f"{name} is already in your order.") + (f"\n{note}" if note else "")
    save_selection(conversation.id, selection)
    queue_interactive_message(db, conversation, order_so_far_text(db, conversation, selection, head), buttons=ITEM_ADDED_BUTTONS)


def order_so_far_text(db: Session, conversation: Conversation, selection: dict, head: str) -> str:
    # The heading, the items and the total, fitted to WhatsApp's limit
    lines, _, total = price_items(db, conversation.organization_id, [tuple(i) for i in selection["items"]])
    currency = workspace_currency(db, conversation.organization_id)
    footer = f"Total: {format_price(total, currency)}"
    room = BODY_ROOM - len(head) - len(footer) - len("\n\nYour order so far:\n\n")
    return f"{head}\n\nYour order so far:\n{item_lines_text(lines, currency, room)}\n{footer}"


# ---- A list the customer typed, said or photographed ----

def handle_order_list(db: Session, conversation: Conversation, text: Optional[str] = None, image: Optional[bytes] = None, mime_type: Optional[str] = None) -> bool:
    # True = read as a list and answered; False = not a list, so it gets the normal reply
    organization_id = conversation.organization_id
    if not is_feature_enabled(db, organization_id, "orders") or not ai_auto_reply_on(db, organization_id):
        return False
    selection = get_selection(conversation.id)
    if selection and selection.get("step") not in ("items", "choose"):
        return False  # Past the items already (delivery, address, confirm)

    # The AI call happens outside the step lock: it's much slower than a step
    products = orderable_products(db, organization_id).order_by(func.lower(Product.name)).limit(settings.ORDER_LIST_CATALOG_MAX).all()
    lines = read_order_list(products, text=text, image=image, mime_type=mime_type)
    if not lines:
        return False

    with order_step_lock(conversation.id):
        selection = get_selection(conversation.id) or {"items": []}
        unclear, not_found = selection.get("unclear", []), selection.get("not_found", [])
        by_id = {product.id: product for product in products}
        for line in lines:
            ids = line["product_ids"]
            if len(ids) > 1:
                unclear.append(line)
            elif not ids:
                not_found.append(line["requested"])
            elif not add_list_item(selection, by_id[ids[0]], line["quantity"]):
                not_found.append(fit(by_id[ids[0]].name, 60))
        selection["unclear"], selection["not_found"] = unclear, not_found
        continue_order_list(db, conversation, selection)
    return True


def add_list_item(selection: dict, product: Product, quantity: int) -> bool:
    # False when it can't be added (out of stock, or the order is full)
    items = {pid: qty for pid, qty in selection["items"]}
    if stock_status(product) == "out" or (product.id not in items and len(items) >= settings.ORDER_MAX_ITEMS):
        return False
    wanted = min(items.get(product.id, 0) + quantity, settings.ORDER_ITEM_MAX_QUANTITY)
    items[product.id] = min(wanted, product.stock_quantity) if product.track_stock else wanted
    selection["items"] = [[pid, qty] for pid, qty in items.items()]
    return True


def continue_order_list(db: Session, conversation: Conversation, selection: dict):
    # Ask about the next unclear item, or show the order once there are none left
    while selection["unclear"]:
        line = selection["unclear"][0]
        products = [p for p in orderable_products(db, conversation.organization_id).filter(Product.id.in_(line["product_ids"])).order_by(func.lower(Product.name)).all() if stock_status(p) != "out"]
        if len(products) > 1:
            ask_unclear_item(db, conversation, selection, line, products)
            return
        selection["unclear"].pop(0)
        if not products or not add_list_item(selection, products[0], line["quantity"]):
            selection["not_found"].append(line["requested"])

    not_found = ", ".join(selection.pop("not_found"))
    selection.pop("unclear")
    if not selection["items"]:
        clear_selection(conversation.id)
        send_view_products(db, conversation, NOTHING_FOUND_TEXT.format(fit(not_found, 600)))
        return
    selection["step"] = "items"
    head = LIST_HEAD_TEXT + (f"\nCouldn't add: {fit(not_found, 300)}" if not_found else "")
    save_selection(conversation.id, selection)
    queue_interactive_message(db, conversation, order_so_far_text(db, conversation, selection, head), buttons=ITEM_ADDED_BUTTONS)


def ask_unclear_item(db: Session, conversation: Conversation, selection: dict, line: dict, products: list):
    selection["step"] = "choose"
    save_selection(conversation.id, selection)
    currency = workspace_currency(db, conversation.organization_id)
    rows = [{"id": f"{PICK_PREFIX}{p.id}", "title": fit(p.name, ROW_TITLE_MAX_CHARS), "description": product_row_description(p, currency)} for p in products]
    rows.append({"id": f"{PICK_PREFIX}skip", "title": "Skip this item"})
    queue_interactive_message(db, conversation, f"Which {line['requested']} did you mean?", menu={"button": "Choose", "sections": [{"title": "Choose one", "rows": rows}]})


def handle_pick(db: Session, conversation: Conversation, reply_id: str):
    selection = get_selection(conversation.id)
    if not selection or selection.get("step") != "choose" or not selection.get("unclear"):
        return  # An older menu: this one was answered already
    line = selection["unclear"][0]
    choice = reply_id[len(PICK_PREFIX):]
    if choice != "skip":
        if not choice.isdigit() or int(choice) not in line["product_ids"]:
            return  # A menu for an earlier item
        product = orderable_products(db, conversation.organization_id).filter(Product.id == int(choice)).first()
        if not product or not add_list_item(selection, product, line["quantity"]):
            selection["not_found"].append(line["requested"])
    selection["unclear"].pop(0)
    continue_order_list(db, conversation, selection)


# ---- Order again: the customer's last order at today's prices ----

def last_order_items(db: Session, conversation: Conversation) -> list:
    # (product id, quantity) pairs; a product deleted since has no id, and is left out
    order = last_order(db, conversation.organization_id, conversation.customer_phone)
    return [(item.product_id, item.quantity) for item in order.items if item.product_id] if order else []


def handle_reorder(db: Session, conversation: Conversation, reply_id: str):
    if reply_id == "reorder:new":
        send_ordering_prompt(db, conversation, offer_last_order=False)
        return

    lines, problems, total = price_items(db, conversation.organization_id, last_order_items(db, conversation))
    if not lines:
        send_view_products(db, conversation, LAST_ORDER_GONE_TEXT)
        return

    if reply_id == "reorder:show":
        currency = workspace_currency(db, conversation.organization_id)
        warnings = "\n".join(f"⚠️ {fit(p['name'], 60)} {p['reason']}" for p in problems[:5])
        footer = f"Total now: {format_price(total, currency)}" + (f"\n{warnings}" if warnings else "")
        room = BODY_ROOM - len(footer) - len("Your last order:\n\n")
        queue_interactive_message(db, conversation, f"Your last order:\n{item_lines_text(lines, currency, room)}\n{footer}", buttons=LAST_ORDER_BUTTONS)
        return

    selection = {"items": [[line["product_id"], line["quantity"]] for line in lines], "step": "items"}
    if reply_id == "reorder:add":
        save_selection(conversation.id, selection)
        queue_interactive_message(db, conversation, order_so_far_text(db, conversation, selection, "Your last order is in ✅"), buttons=ITEM_ADDED_BUTTONS)
    elif reply_id == "reorder:same":
        selection["step"] = "fulfilment"
        save_selection(conversation.id, selection)
        queue_interactive_message(db, conversation, FULFILMENT_QUESTION, buttons=FULFILMENT_BUTTONS)


def ask_address(db: Session, conversation: Conversation, selection: dict):
    # Delivery: the saved address first ("Same address / New address"), otherwise ask for a location
    saved = get_customer_address(db, conversation.organization_id, conversation.customer_phone)
    if saved and address_label(saved):
        selection["step"] = "address_confirm"
        save_selection(conversation.id, selection)
        text = f"Deliver to this address?\n📍 {fit(address_label(saved), 700)}"
        if saved.get("latitude") is not None and saved.get("longitude") is not None:
            text += f"\n{map_link(saved['latitude'], saved['longitude'])}"
        queue_interactive_message(db, conversation, text, buttons=SAVED_ADDRESS_BUTTONS)
        return
    request_location(db, conversation, selection)


def request_location(db: Session, conversation: Conversation, selection: dict):
    selection["step"] = "address"
    selection["address"] = None
    save_selection(conversation.id, selection)
    queue_interactive_message(db, conversation, LOCATION_REQUEST_TEXT, request_location=True)


def quote_of(lines: list, total) -> list:
    return [[line["product_id"], line["quantity"], str(line["unit_price"])] for line in lines] + [str(total)]


def send_order_details(db: Session, conversation: Conversation, selection: dict, note: Optional[str] = None):
    # Today's prices; what changed is said, and the quote is kept so Confirm can tell if it changed again
    lines, problems, total = price_items(db, conversation.organization_id, [tuple(i) for i in selection["items"]])
    if not lines:
        clear_selection(conversation.id)
        send_view_products(db, conversation, NOTHING_AVAILABLE_TEXT)
        return
    selection["items"] = [[line["product_id"], line["quantity"]] for line in lines]
    selection["quote"] = quote_of(lines, total)
    selection["step"] = "confirm"

    # The note and what changed first, then the details in the room that's left (all within WhatsApp's limit)
    currency = workspace_currency(db, conversation.organization_id)
    prefix = [note] if note else []
    if problems:
        warnings = [f"⚠️ {fit(p['name'], 60)} {p['reason']}" for p in problems[:5]]
        if len(problems) > 5:
            warnings.append(f"…and {len(problems) - 5} more changes")
        prefix.append("\n".join(warnings))
    head = "\n\n".join(prefix)
    room = BODY_ROOM - (len(head) + 2 if head else 0)
    details = order_details_text(lines, total, currency, selection["fulfilment"], selection.get("address"), room)
    save_selection(conversation.id, selection)
    queue_interactive_message(db, conversation, f"{head}\n\n{details}" if head else details, buttons=CONFIRM_BUTTONS)


def confirm_order(db: Session, conversation: Conversation, selection: dict):
    # 1. Only from the details the customer is looking at (an older Confirm button shows the current details instead)
    if selection.get("step") != "confirm":
        if selection.get("fulfilment") == "delivery" and not address_label(selection.get("address")):
            ask_address(db, conversation, selection)
        elif selection.get("fulfilment") in ("delivery", "pickup"):
            send_order_details(db, conversation, selection)
        else:
            selection["step"] = "fulfilment"
            save_selection(conversation.id, selection)
            queue_interactive_message(db, conversation, FULFILMENT_QUESTION, buttons=FULFILMENT_BUTTONS)
        return

    # 2. Prices or stock changed since the details were shown: show them again instead of placing
    lines, problems, total = price_items(db, conversation.organization_id, [tuple(i) for i in selection["items"]])
    if problems or quote_of(lines, total) != selection.get("quote"):
        send_order_details(db, conversation, selection, note=CHANGED_TEXT)
        return

    # 3. Place it: the order number goes to the customer (and to delivery / pickup staff); the uid never leaves the backend
    order = place_order(db, conversation, [tuple(i) for i in selection["items"]], selection["fulfilment"], selection.get("address"))
    clear_selection(conversation.id)
    redis_client.set(PLACED_KEY.format(conversation.id), order.number, ex=PLACED_MEMORY_SECONDS)

    # 4. Tell the customer and the team (each step on its own: the order exists whatever happens next)
    show = "Show this number to the delivery person." if order.fulfilment == "delivery" else "Show this number when you pick it up."
    head = f"✅ Order #{order.number} is placed! {show} We'll message you when it's accepted."
    details = order_details_text(lines, order.total, order.currency, order.fulfilment, selection.get("address"), 3000)
    how = "Delivery" if order.fulfilment == "delivery" else "Pickup"
    for step in (
        lambda: queue_outgoing_message(db, conversation, sender="model", content=f"{head}\n\n{details}"),
        lambda: record_activity(db, conversation, f"Order #{order.number} placed ({format_price(order.total, order.currency)}, {how})"),
        lambda: notify_team_of_order(db, conversation, order),
        lambda: publish_order(order),
    ):
        try:
            step()
        except Exception as exc:
            db.rollback()
            print(f"[ORDER] #{order.number} (org {order.organization_id}) placed, but a follow-up step failed: {exc}")


def handle_order_tap(db: Session, conversation: Conversation, reply_id: Optional[str]) -> bool:
    # Quantity / order buttons; True = handled. Orders switched off: the tap is just text for the normal flow
    if not reply_id or not reply_id.startswith((QUANTITY_PREFIX, ORDER_PREFIX, PICK_PREFIX, REORDER_PREFIX)):
        return False
    if not is_feature_enabled(db, conversation.organization_id, "orders"):
        return False
    with order_step_lock(conversation.id):
        if reply_id.startswith(PICK_PREFIX):
            handle_pick(db, conversation, reply_id)
        elif reply_id.startswith(REORDER_PREFIX):
            handle_reorder(db, conversation, reply_id)
        else:
            handle_order_tap_locked(db, conversation, reply_id)
    return True


def handle_order_tap_locked(db: Session, conversation: Conversation, reply_id: str):
    # 1. Nothing picked any more: just placed (a second tap), cancelled, or timed out
    selection = get_selection(conversation.id)
    if not selection or (not selection.get("items") and not reply_id.startswith(QUANTITY_PREFIX) and reply_id != "order:cancel"):
        placed = redis_client.get(PLACED_KEY.format(conversation.id))
        if placed and reply_id.startswith(ORDER_PREFIX):
            send_view_products(db, conversation, f"Order #{placed.decode()} is already placed. Tap View products to order something else.")
        elif reply_id == "order:cancel":
            send_view_products(db, conversation, CANCELLED_TEXT)
        else:
            send_view_products(db, conversation, TIMED_OUT_TEXT)
        return

    # 2. A quantity for the product being asked about (an older button for another product is ignored)
    if reply_id.startswith(QUANTITY_PREFIX):
        product_id, _, quantity = reply_id[len(QUANTITY_PREFIX):].partition(":")
        if selection.get("step") == "quantity" and product_id.isdigit() and int(product_id) == selection.get("pending_product_id") and quantity.isdigit():
            add_pending_item(db, conversation, selection, int(quantity))
        return

    # 3. The order buttons
    if reply_id == "order:cancel":
        clear_selection(conversation.id)
        send_view_products(db, conversation, CANCELLED_TEXT)
    elif reply_id == "order:add":
        save_selection(conversation.id, selection)
        menu = category_menu(db, conversation.organization_id)
        if menu:
            queue_interactive_message(db, conversation, menu["body"], menu=menu["menu"])
        else:
            queue_outgoing_message(db, conversation, sender="model", content=NO_PRODUCTS_TEXT)
    elif reply_id == "order:place":
        selection["step"] = "fulfilment"
        save_selection(conversation.id, selection)
        queue_interactive_message(db, conversation, FULFILMENT_QUESTION, buttons=FULFILMENT_BUTTONS)
    elif reply_id in ("order:fulfil:delivery", "order:fulfil:pickup"):
        selection["fulfilment"] = reply_id.rsplit(":", 1)[1]
        if selection["fulfilment"] == "pickup":
            selection["address"] = None
            send_order_details(db, conversation, selection)
        else:
            ask_address(db, conversation, selection)
    elif reply_id == "order:address:same":
        saved = get_customer_address(db, conversation.organization_id, conversation.customer_phone)
        if selection.get("fulfilment") == "delivery" and saved and address_label(saved):
            selection["address"] = saved
            send_order_details(db, conversation, selection)
        else:
            request_location(db, conversation, selection)
    elif reply_id == "order:address:new":
        request_location(db, conversation, selection)
    elif reply_id == "order:address:skip":
        if selection.get("step") == "address_details" and address_label(selection.get("address")):
            send_order_details(db, conversation, selection)
        else:
            request_location(db, conversation, selection)
    elif reply_id == "order:confirm":
        confirm_order(db, conversation, selection)


def handle_order_step(db: Session, conversation: Conversation, user_text: str, location: Optional[dict]) -> bool:
    # A typed answer while an order waits for one: a quantity, an address, or a shared location pin; True = handled
    # (only for what the customer typed or shared: never button titles or media notices, see respond_to_customer)
    if not order_in_progress(conversation.id) or not is_feature_enabled(db, conversation.organization_id, "orders"):
        return False
    with order_step_lock(conversation.id):
        selection = get_selection(conversation.id)
        if not selection:
            return False
        step = selection.get("step")
        text = (user_text or "").strip()

        if step == "quantity" and not location:
            number = LEADING_NUMBER.match(text)
            if number and int(number.group(1)) > 0:
                add_pending_item(db, conversation, selection, int(number.group(1)))
                return True
            return False

        if step in ("address", "address_details", "address_confirm") and selection.get("fulfilment") == "delivery" and location and location.get("latitude") is not None and location.get("longitude") is not None:
            # A pin: keep it, then ask for the house / flat details (or Skip)
            place = ", ".join(p for p in (location.get("name"), location.get("address")) if p)
            selection["address"] = {"address": None, "latitude": location["latitude"], "longitude": location["longitude"], "location_name": place[:255] or None}
            selection["step"] = "address_details"
            save_selection(conversation.id, selection)
            queue_interactive_message(db, conversation, HOUSE_DETAILS_TEXT, buttons=SKIP_BUTTON)
            return True

        if step in ("address", "address_details") and text and not location:
            address = selection.get("address") if step == "address_details" else None
            selection["address"] = {**(address or {"latitude": None, "longitude": None, "location_name": None}), "address": text[:ADDRESS_MAX_CHARS]}
            send_order_details(db, conversation, selection)
            return True
        return False
