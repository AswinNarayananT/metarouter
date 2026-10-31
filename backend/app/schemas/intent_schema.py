from typing import Literal
from pydantic import BaseModel


class IntentResult(BaseModel):
    intent: Literal["order", "support", "other", "unclear"]  # What the customer's first message is for
