from pydantic import BaseModel, Field
from typing import Literal, Optional

# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------

class OrderStatusRequest(BaseModel):
    status: Literal["accepted", "out_for_delivery", "ready_for_pickup", "delivered", "picked_up", "rejected", "cancelled"]
    reason: Optional[str] = Field(None, max_length=300)  # Required to reject (sent to the customer) or cancel
