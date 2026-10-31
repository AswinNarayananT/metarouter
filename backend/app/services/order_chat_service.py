from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.organization_model import Organization
from app.models.product_model import Product
from app.services.messaging_service import fit, MAX_LIST_ROWS, ROW_TITLE_MAX_CHARS, ROW_DESCRIPTION_MAX_CHARS
from app.services.product_service import current_products, stock_status
from app.utils.money import format_price

# Ordering in chat: the prompt after "Place an order", and the category / product list menus (tap to browse)
ORDERING_PROMPT = "What would you like to order? Just type it, send a voice note, or a photo of your list. 📝"
PRODUCT_LIST_OFFER = "You can also pick items from our product list:"
VIEW_PRODUCTS_BUTTON = {"id": "browse:categories", "title": "📋 View products"}
NO_PRODUCTS_TEXT = "Sorry, we don't have any products listed right now. Please tell us what you need and our team will help."
OTHER_CATEGORY = "Other"  # Products without a category
PAGE_ROWS = MAX_LIST_ROWS - 1  # A full page keeps one row for "More"

BROWSE_PREFIX = "browse:categories"
CATEGORY_PREFIX = "cat:"
PRODUCT_PREFIX = "product:"


def orderable_products(db: Session, organization_id: int):
    # What customers can see: current (not archived) products that are for sale
    return current_products(db, organization_id).filter(Product.is_active.is_(True))


def workspace_currency(db: Session, organization_id: int) -> str:
    return db.query(Organization.currency).filter(Organization.id == organization_id).scalar() or "INR"


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
    return {"body": f"{label}: tap an item to see its price.", "menu": {"button": "Products", "sections": [{"title": fit(label, 24), "rows": rows}]}}


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


def product_detail_text(product: Product, currency: str) -> str:
    # Until the in-chat cart exists: what the item costs and whether it's available
    if stock_status(product) == "out":
        return f"Sorry, {product.name} is out of stock right now."
    stock = f" ({stock_label(product)})" if stock_label(product) else ""
    return f"{product.name}: {format_price(product.price, currency)}{stock}. How many would you like?"
