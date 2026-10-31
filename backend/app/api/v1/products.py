import math
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.core.features import require_feature
from app.models.organization_model import Organization, User
from app.models.product_model import Product
from app.schemas.product_schema import ProductCreate, ProductUpdate, StockAdjust
from app.services.conversation_service import SUPERVISOR_ROLES
from app.services.product_service import MAX_PRODUCTS, current_products, name_taken, adjust_stock, stock_status_filter, serialize_product

router = APIRouter(
    prefix="/products",
    tags=["Products"],
    dependencies=[Depends(require_feature("orders"))]
)

NOT_NULLABLE_FIELDS = {"name", "price", "track_stock", "stock_quantity", "is_active"}  # Sending null for these changes nothing


def _require_supervisor(user: User):
    if user.role not in SUPERVISOR_ROLES:
        raise HTTPException(status_code=403, detail="Only admins and managers can change products")


def _name_clash(name: str) -> HTTPException:
    return HTTPException(status_code=409, detail=f'A product named "{name}" already exists')


def _limit_reached(db: Session, organization_id: int) -> bool:
    return current_products(db, organization_id).count() >= MAX_PRODUCTS


def _get_product(db: Session, product_id: int, user: User, include_archived: bool = False) -> Product:
    # Strictly within this workspace; another workspace's product looks like it doesn't exist
    query = db.query(Product).filter(Product.id == product_id, Product.organization_id == user.organization_id)
    if not include_archived:
        query = query.filter(Product.archived_at.is_(None))
    product = query.first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def _save(db: Session, product: Product):
    # The unique index also catches two saves of the same name at the same moment
    name = product.name
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        if "uq_products_name_current" in str(e.orig):
            raise _name_clash(name)
        raise
    db.refresh(product)


@router.get("")
def list_products(q: Optional[str] = None, category: Optional[str] = None, status: Literal["all", "low", "out", "archived"] = "all", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    org_id = current_user.organization_id

    # 1. Filters
    query = db.query(Product).filter(Product.organization_id == org_id)
    query = query.filter(Product.archived_at.isnot(None)) if status == "archived" else query.filter(Product.archived_at.is_(None))
    if status in ("low", "out"):
        query = query.filter(stock_status_filter(status))
    if category:
        query = query.filter(Product.category == category)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Product.name.ilike(term), Product.category.ilike(term)))

    # 2. Page
    total = query.count()
    products = query.order_by(func.lower(Product.name), Product.id).offset((page - 1) * page_size).limit(page_size).all()

    # 3. Header counts: current products, ignoring the filters
    current = current_products(db, org_id)
    summary = {
        "total": current.count(),
        "low": current.filter(stock_status_filter("low")).count(),
        "out": current.filter(stock_status_filter("out")).count()
    }
    currency = db.query(Organization.currency).filter(Organization.id == org_id).scalar()

    return {
        "products": [serialize_product(p) for p in products],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "summary": summary,
        "currency": currency
    }


@router.get("/categories")
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    rows = current_products(db, current_user.organization_id).with_entities(Product.category).filter(Product.category.isnot(None)).distinct().order_by(Product.category).all()

    return {
        "categories": [r[0] for r in rows]
    }


@router.post("", status_code=201)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_supervisor(current_user)

    # 1. Unique name and workspace limit
    if name_taken(db, current_user.organization_id, payload.name):
        raise _name_clash(payload.name)
    if _limit_reached(db, current_user.organization_id):
        raise HTTPException(status_code=400, detail=f"A workspace can hold up to {MAX_PRODUCTS} products")

    # 2. Save
    product = Product(organization_id=current_user.organization_id, created_by_id=current_user.id, **payload.model_dump())
    db.add(product)
    _save(db, product)

    return serialize_product(product)


@router.patch("/{product_id}")
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_supervisor(current_user)
    product = _get_product(db, product_id, current_user)

    # 1. Only the fields sent
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k not in NOT_NULLABLE_FIELDS}

    # 2. Unique name
    if "name" in changes and name_taken(db, current_user.organization_id, changes["name"], exclude_id=product.id):
        raise _name_clash(changes["name"])

    # 3. Save
    for field, value in changes.items():
        setattr(product, field, value)
    _save(db, product)

    return serialize_product(product)


@router.post("/{product_id}/archive")
def archive_product(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_supervisor(current_user)
    product = _get_product(db, product_id, current_user, include_archived=True)

    if product.archived_at is None:
        product.archived_at = func.now()
        db.commit()
        db.refresh(product)

    return serialize_product(product)


@router.post("/{product_id}/restore")
def restore_product(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_supervisor(current_user)
    product = _get_product(db, product_id, current_user, include_archived=True)

    if product.archived_at is not None:
        # 1. Its name may have been reused while it was archived, and the workspace may be full
        if name_taken(db, current_user.organization_id, product.name):
            raise _name_clash(product.name)
        if _limit_reached(db, current_user.organization_id):
            raise HTTPException(status_code=400, detail=f"A workspace can hold up to {MAX_PRODUCTS} products")

        # 2. Save
        product.archived_at = None
        _save(db, product)

    return serialize_product(product)


@router.post("/{product_id}/stock")
def change_stock(product_id: int, payload: StockAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_supervisor(current_user)
    product = _get_product(db, product_id, current_user)

    if not product.track_stock:
        raise HTTPException(status_code=400, detail="This product doesn't track stock")

    if not adjust_stock(db, product, payload.change):
        raise HTTPException(status_code=409, detail=f"Only {product.stock_quantity} left in stock")

    return serialize_product(product)
