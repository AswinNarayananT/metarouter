from pydantic import BaseModel, Field, field_validator
from typing import Literal

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
