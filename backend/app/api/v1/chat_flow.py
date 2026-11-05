


from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.core.features import require_feature
from app.models.organization_model import User
from app.models.chat_flow_model import ChatFlow
from app.schemas.chat_flow_schema import ChatFlowDocument
from app.services.chat_flow_service import load_flow, enabled_modules, off_box_types, unadded_module_titles

router = APIRouter(
    prefix="/chat-flow",
    tags=["Chat Menu"],
    dependencies=[Depends(require_feature("customer_chats"))]  # The menu is part of Customer Chats
)


def _require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can change the chat menu")


def _validation_message(error: ValidationError) -> str:
    # The first problem, readable: "Option "Late delivery" has no next step" / "nodes.2.text: String should have at most 1024 characters"
    first = error.errors()[0]
    message = first["msg"].removeprefix("Value error, ")
    location = ".".join(str(part) for part in first["loc"] if not isinstance(part, str) or part not in ("question", "answer", "order", "problem", "team", "ai"))
    return f"{location}: {message}" if location else message


@router.get("")
def get_chat_flow(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)
    flow, is_default = load_flow(db, current_user.organization_id)
    known_modules = db.query(ChatFlow.known_modules).filter(ChatFlow.organization_id == current_user.organization_id).scalar()

    return {
        "flow": flow,
        "is_default": is_default,
        "off_box_types": sorted(off_box_types(db, current_user.organization_id)),
        "unadded_modules": [] if is_default else unadded_module_titles(flow, known_modules, enabled_modules(db, current_user.organization_id))
    }


@router.put("")
def save_chat_flow(payload: dict = Body(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    _require_admin(current_user)

    # 1. Check the whole menu (every option leads somewhere, WhatsApp's limits)
    try:
        document = ChatFlowDocument.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=_validation_message(e))

    # 2. Replace the workspace's menu (modules on now count as seen: one the admin removed stays removed)
    chat_flow = db.query(ChatFlow).filter(ChatFlow.organization_id == current_user.organization_id).first()
    if not chat_flow:
        chat_flow = ChatFlow(organization_id=current_user.organization_id)
        db.add(chat_flow)
    chat_flow.flow = document.model_dump(exclude_none=True)
    chat_flow.known_modules = sorted(set(chat_flow.known_modules or []) | enabled_modules(db, current_user.organization_id))
    chat_flow.updated_by_id = current_user.id
    db.commit()

    return {
        "flow": chat_flow.flow,
        "is_default": False,
        "off_box_types": sorted(off_box_types(db, current_user.organization_id))
    }


@router.delete("")
def reset_chat_flow(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Back to the default menu (order / problem / something else)
    _require_admin(current_user)
    db.query(ChatFlow).filter(ChatFlow.organization_id == current_user.organization_id).delete()
    db.commit()

    flow, is_default = load_flow(db, current_user.organization_id)
    return {
        "flow": flow,
        "is_default": is_default,
        "off_box_types": sorted(off_box_types(db, current_user.organization_id))
    }
