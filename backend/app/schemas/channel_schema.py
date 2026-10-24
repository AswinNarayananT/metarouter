from pydantic import BaseModel, Field
from typing import Optional

# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------

class ConnectWhatsAppRequest(BaseModel):
    # From Meta's Embedded Signup popup: the one-time code (valid ~30 seconds) and what the business picked.
    # The ids come from the popup's "finished" message; if it didn't arrive, the backend finds them from the token.
    code: str = Field(..., min_length=10, max_length=2048)
    waba_id: Optional[str] = Field(None, min_length=1, max_length=64, pattern=r"^\d+$")
    phone_number_id: Optional[str] = Field(None, min_length=1, max_length=64, pattern=r"^\d+$")
    business_id: Optional[str] = Field(None, min_length=1, max_length=64, pattern=r"^\d+$")
