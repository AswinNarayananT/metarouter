from sqlalchemy.orm import Session
from app.models.admin_model import SuperAdmin
from app.core.security import get_password_hash
from app.config import settings
import logging

logger = logging.getLogger(__name__)

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