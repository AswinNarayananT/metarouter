from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.core.deps import get_current_super_admin
from app.models.admin_model import SuperAdmin
from app.models.platform_module_model import PlatformModule
from app.models.organization_model import Organization
from app.services.audit_service import record_audit_log, get_client_ip
from app.core.features import get_organization_features
from app.schemas.module_schema import (
    PlatformModuleResponse,
    CreateModuleRequest,
    UpdateModuleRequest,
    OrganizationFeaturesResponse,
    OrganizationFeatureItem,
    UpdateOrganizationFeaturesRequest,
)

router = APIRouter(
    prefix="/superadmin",
    tags=["Super Admin Platform Modules"],
    dependencies=[Depends(get_current_super_admin)],
)


# ============================================================================
# 1. Platform Modules Catalog Endpoints
# ============================================================================

@router.get("/modules", response_model=List[PlatformModuleResponse])
def list_platform_modules(
    category: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Lists all global platform modules in MetaRouter."""
    query = db.query(PlatformModule)
    if category and category.lower() != "all":
        query = query.filter(func.lower(PlatformModule.category) == category.lower())
    if is_active is not None:
        query = query.filter(PlatformModule.is_active == is_active)

    return query.order_by(PlatformModule.category, PlatformModule.name).all()


@router.post("/modules", response_model=PlatformModuleResponse, status_code=status.HTTP_201_CREATED)
def create_platform_module(
    payload: CreateModuleRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    """Creates a new platform module available to all workspaces."""
    key = payload.key.lower().strip()

    if db.query(PlatformModule).filter(PlatformModule.key == key).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A module with key '{key}' already exists."
        )

    module = PlatformModule(
        key=key,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        category=payload.category.strip() if payload.category else "General",
        icon=payload.icon.strip() if payload.icon else "Box",
        is_active=payload.is_active,
        default_enabled=payload.default_enabled,
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    record_audit_log(
        db,
        action="MODULE_CREATED",
        category="system",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="module",
        target_id=module.id,
        target_name=module.name,
        details={
            "key": module.key,
            "category": module.category,
            "default_enabled": module.default_enabled,
            "is_active": module.is_active,
        },
        ip_address=get_client_ip(request),
        status="success",
    )

    return module


@router.patch("/modules/{module_id}", response_model=PlatformModuleResponse)
def update_platform_module(
    module_id: int,
    payload: UpdateModuleRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    """Updates an existing platform module's metadata or global status."""
    module = db.query(PlatformModule).filter(PlatformModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    changes = {}
    if payload.name is not None:
        module.name = payload.name.strip()
        changes["name"] = module.name
    if payload.description is not None:
        module.description = payload.description.strip() if payload.description else None
        changes["description"] = module.description
    if payload.category is not None:
        module.category = payload.category.strip()
        changes["category"] = module.category
    if payload.icon is not None:
        module.icon = payload.icon.strip()
        changes["icon"] = module.icon
    if payload.is_active is not None:
        module.is_active = payload.is_active
        changes["is_active"] = module.is_active
    if payload.default_enabled is not None:
        module.default_enabled = payload.default_enabled
        changes["default_enabled"] = module.default_enabled

    db.commit()
    db.refresh(module)

    record_audit_log(
        db,
        action="MODULE_UPDATED",
        category="system",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="module",
        target_id=module.id,
        target_name=module.name,
        details={"changes": changes},
        ip_address=get_client_ip(request),
        status="success",
    )

    return module


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_platform_module(
    module_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    """Permanently deletes a module from the platform catalog."""
    module = db.query(PlatformModule).filter(PlatformModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    module_name = module.name
    module_key = module.key

    db.delete(module)
    db.commit()

    record_audit_log(
        db,
        action="MODULE_DELETED",
        category="system",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="module",
        target_id=module_id,
        target_name=module_name,
        details={"key": module_key},
        ip_address=get_client_ip(request),
        status="warning",
    )

    return None


# ============================================================================
# 2. Workspace Specific Module Management Endpoints
# ============================================================================

@router.get("/organizations/{org_id}/features", response_model=OrganizationFeaturesResponse)
def get_organization_features_config(
    org_id: int,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """
    Returns all platform modules with their resolved toggle states and custom override flags
    for a specific organization.
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    modules = db.query(PlatformModule).order_by(PlatformModule.category, PlatformModule.name).all()
    org_overrides = dict(org.features or {})
    resolved_features = get_organization_features(db, org_id)

    feature_items = []
    for m in modules:
        is_override = m.key in org_overrides and bool(org_overrides[m.key]) != m.default_enabled
        is_enabled = resolved_features.get(m.key, False)
        feature_items.append(
            OrganizationFeatureItem(
                key=m.key,
                name=m.name,
                description=m.description,
                category=m.category,
                icon=m.icon,
                is_active_globally=m.is_active,
                default_enabled=m.default_enabled,
                enabled_for_workspace=is_enabled,
                is_custom_override=is_override,
            )
        )

    return OrganizationFeaturesResponse(
        organization_id=org.id,
        organization_name=org.name,
        features=resolved_features,
        modules=feature_items,
    )


@router.patch("/organizations/{org_id}/features", response_model=OrganizationFeaturesResponse)
def update_organization_features_config(
    org_id: int,
    payload: UpdateOrganizationFeaturesRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    """
    Updates custom feature toggles for a specific organization and logs the audit event.
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    from sqlalchemy.orm.attributes import flag_modified

    # Only modules that exist; a value equal to the module's default is dropped, so the workspace follows the default again
    defaults = {m.key: m.default_enabled for m in db.query(PlatformModule).all()}
    unknown = [key for key in payload.features if key not in defaults]
    if unknown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown module(s): {', '.join(unknown)}")

    old_overrides = dict(org.features or {})
    merged_overrides = {key: value for key, value in {**old_overrides, **payload.features}.items() if key in defaults and bool(value) != defaults[key]}

    org.features = merged_overrides
    flag_modified(org, "features")
    db.commit()
    db.refresh(org)

    record_audit_log(
        db,
        action="ORGANIZATION_MODULES_UPDATED",
        category="organization",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="organization",
        target_id=org.id,
        target_name=org.name,
        details={
            "updated_features": payload.features,
            "previous_features": old_overrides,
        },
        ip_address=get_client_ip(request),
        status="success",
    )

    # Return refreshed configuration
    return get_organization_features_config(org_id=org_id, db=db, _=current_admin)
