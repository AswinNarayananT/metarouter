from pydantic import BaseModel, Field
from typing import Literal, Optional

TicketType = Literal["enquiry", "problem", "complaint"]

# ------------------------------------------------------------------
# AI output schema (ticket labelling)
# ------------------------------------------------------------------

class TicketLabelResult(BaseModel):
    type: TicketType
    group: str = Field(description="Broad topic, reused from the existing list when one fits, e.g. 'Fees & Payments'")
    subgroup: str = Field(description="Specific issue inside the group, reused when one fits, e.g. 'Receipt not received'")
    subject: str = Field(description="One-line summary of what the customer needed, max 80 characters")
    description: str = Field(description="2-4 sentences: the customer's situation and request, with key details (dates, references)")
    resolution: str = Field(description="How it was answered or solved; empty string if it wasn't solved yet")


# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------

class UpdateTicketRequest(BaseModel):
    # Only the fields sent are changed
    subject: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    type: Optional[TicketType] = None
    group_id: Optional[int] = None
    subgroup_id: Optional[int] = None
    status: Optional[Literal["open", "in_progress", "waiting"]] = None


class TicketNoteRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CloseTicketRequest(BaseModel):
    resolution: str = Field(..., min_length=3, max_length=2000)  # How it was solved (required to close)
    hand_back_to_ai: bool = True                                 # The AI answers the customer's next message again


class AssignTicketRequest(BaseModel):
    user_id: Optional[int] = None


class RenameTicketGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class MergeTicketGroupRequest(BaseModel):
    # The group / subgroup this one is folded into (its tickets move there)
    into_id: int
