from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional

ConversationStatusValue = Literal["active", "human_takeover"]

# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------

class SendMessageRequest(BaseModel):
    # Longer text is split into several WhatsApp messages by the messaging service
    content: str = Field(..., min_length=1, max_length=20000)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message can't be empty")
        return value


class UpdateConversationRequest(BaseModel):
    status: ConversationStatusValue


class AssignConversationRequest(BaseModel):
    # Team member to assign, or null to put the chat back in the unassigned queue
    user_id: Optional[int] = None


class SendTemplateRequest(BaseModel):
    # An approved WhatsApp template: works outside the 24-hour window and reopens the chat
    template_name: str = Field(..., min_length=1, max_length=512)
    language: str = Field(..., min_length=2, max_length=20)
    parameters: List[str] = Field(default_factory=list, max_length=20)  # Values for {{1}}, {{2}} ...
