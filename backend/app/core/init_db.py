from sqlalchemy.orm import Session
from app.models.admin_model import SuperAdmin
from app.models.platform_module_model import PlatformModule
from app.models.organization_model import DEFAULT_ORGANIZATION_FEATURES
from app.core.security import get_password_hash
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# How each module switch first appears in Super Admin (its default state comes from DEFAULT_ORGANIZATION_FEATURES)
PLATFORM_MODULES = {
    "customer_chats": ("Customer Chats", "Live inbox, the AI assistant's replies, and tickets for every customer conversation.", "Messaging", "MessageSquare"),
    "broadcasts": ("WhatsApp Broadcasts", "Outbound marketing campaigns, bulk pre-approved template dispatches.", "Marketing", "Send"),
    "orders": ("Orders & Commerce", "E-commerce order tracking, catalog, delivery updates, and cart receipts via WhatsApp.", "Commerce", "ShoppingBag"),
}

def init_super_admin(db: Session) -> None:
    try:
        existing_admin = db.query(SuperAdmin).filter(SuperAdmin.email == settings.SUPER_ADMIN_EMAIL).first()
        if not existing_admin:
            hashed_password = get_password_hash(settings.SUPER_ADMIN_PASSWORD)
            super_admin = SuperAdmin(
                name=settings.SUPER_ADMIN_NAME,
                email=settings.SUPER_ADMIN_EMAIL,
                hashed_password=hashed_password
            )
            db.add(super_admin)
            db.commit()
            logger.info(f"-> Super Admin created successfully: {settings.SUPER_ADMIN_EMAIL}")
        else:
            logger.info(f"-> Super Admin already exists: {settings.SUPER_ADMIN_EMAIL}")
    except Exception as e:
        logger.warning(f"-> Tables not ready yet during startup, skipping seeder: {e}")
        db.rollback()


def init_platform_modules(db: Session) -> None:
    # Adds any module switch that has no row (fresh database, or deleted in Super Admin); existing rows keep the super admin's edits
    try:
        existing = {key for (key,) in db.query(PlatformModule.key).all()}
        missing = [key for key in DEFAULT_ORGANIZATION_FEATURES if key not in existing]
        for key in missing:
            name, description, category, icon = PLATFORM_MODULES[key]
            db.add(PlatformModule(key=key, name=name, description=description, category=category, icon=icon, is_active=True, default_enabled=DEFAULT_ORGANIZATION_FEATURES[key]))
        db.commit()
        if missing:
            logger.info(f"-> Platform modules created: {', '.join(missing)}")
    except Exception as e:
        logger.warning(f"-> Tables not ready yet during startup, skipping module seeder: {e}")
        db.rollback()