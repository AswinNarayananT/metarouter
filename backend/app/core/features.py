from typing import Dict, Any, Callable
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.organization_model import Organization, User, DEFAULT_ORGANIZATION_FEATURES
from app.models.platform_module_model import PlatformModule
from app.core.deps import get_current_workspace_user


def get_organization_features(db: Session, organization_id: int) -> Dict[str, bool]:
    """
    Computes the complete, resolved dictionary of active features for a given organization.
    Merges platform module default settings with organization-specific JSONB overrides.
    If a module is globally inactive (is_active=False), it will always evaluate to False.
    """
    # 1. Fetch all platform modules
    modules = db.query(PlatformModule).all()
    
    # 2. Fetch organization features JSONB
    org = db.query(Organization.features).filter(Organization.id == organization_id).first()
    org_overrides: Dict[str, Any] = (org[0] if org and org[0] else {})

    resolved: Dict[str, bool] = {}

    # If no modules are in the database yet, fall back to DEFAULT_ORGANIZATION_FEATURES
    if not modules:
        resolved = dict(DEFAULT_ORGANIZATION_FEATURES)
        resolved.update({k: bool(v) for k, v in org_overrides.items()})
        return resolved

    for m in modules:
        # A globally inactive module is completely disabled platform-wide
        if not m.is_active:
            resolved[m.key] = False
        elif m.key in org_overrides:
            resolved[m.key] = bool(org_overrides[m.key])
        else:
            resolved[m.key] = bool(m.default_enabled)

    return resolved


def is_feature_enabled(db: Session, organization_id: int, feature_key: str) -> bool:
    """Checks if a single feature key is currently enabled for an organization."""
    features = get_organization_features(db, organization_id)
    return features.get(feature_key, False)


def require_feature(feature_key: str) -> Callable:
    """
    FastAPI Dependency Guard: locks an endpoint or entire router to organizations
    that have this specific feature enabled.

    Usage:
        router = APIRouter(
            prefix="/orders",
            dependencies=[Depends(get_current_workspace_user), Depends(require_feature("orders"))]
        )
    """
    def dependency(
        current_user: User = Depends(get_current_workspace_user),
        db: Session = Depends(get_db)
    ) -> bool:
        if not is_feature_enabled(db, current_user.organization_id, feature_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "FEATURE_DISABLED",
                    "feature": feature_key,
                    "message": f"The '{feature_key}' feature is disabled for your workspace. Please contact support or your account administrator to activate it.",
                }
            )
        return True

    return dependency
