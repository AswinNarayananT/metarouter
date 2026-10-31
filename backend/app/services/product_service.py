from typing import Optional
from sqlalchemy import and_, func, update
from sqlalchemy.orm import Session
from app.models.product_model import Product

MAX_PRODUCTS = 5000  # Current (non-archived) products per workspace


def stock_status(product: Product) -> str:
    # not_tracked / out / low / in_stock; same rules as stock_status_filter
    if not product.track_stock:
        return "not_tracked"
    if product.stock_quantity == 0:
        return "out"
    if product.low_stock_threshold is not None and product.stock_quantity <= product.low_stock_threshold:
        return "low"
    return "in_stock"


def stock_status_filter(status: str):
    # SQL version of stock_status, for the "low" and "out" filters and the summary counts
    if status == "out":
        return and_(Product.track_stock.is_(True), Product.stock_quantity == 0)
    return and_(
        Product.track_stock.is_(True),
        Product.stock_quantity > 0,
        Product.low_stock_threshold.isnot(None),
        Product.stock_quantity <= Product.low_stock_threshold
    )


def current_products(db: Session, organization_id: int):
    return db.query(Product).filter(Product.organization_id == organization_id, Product.archived_at.is_(None))


def name_taken(db: Session, organization_id: int, name: str, exclude_id: int = None) -> bool:
    query = current_products(db, organization_id).filter(func.lower(Product.name) == name.lower())
    if exclude_id:
        query = query.filter(Product.id != exclude_id)
    return query.first() is not None


def adjust_stock(db: Session, product: Product, change: int) -> Optional[Product]:
    # One statement, so two changes at the same moment can't push stock below 0; None = not enough stock
    row = db.execute(
        update(Product)
        .where(Product.id == product.id, Product.stock_quantity + change >= 0)
        .values(stock_quantity=Product.stock_quantity + change)
        .returning(Product.stock_quantity)
    ).first()
    db.commit()
    db.refresh(product)
    return product if row else None


def serialize_product(product: Product) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "category": product.category,
        "price": f"{product.price:.2f}",
        "track_stock": product.track_stock,
        "stock_quantity": product.stock_quantity,
        "low_stock_threshold": product.low_stock_threshold,
        "stock_status": stock_status(product),
        "is_active": product.is_active,
        "archived": product.archived_at is not None,
        "updated_at": product.updated_at
    }
