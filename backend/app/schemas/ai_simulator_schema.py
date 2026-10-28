from typing import List, Literal
from pydantic import BaseModel, Field, field_validator

SIMULATOR_HISTORY_TURNS = 10  # Same amount of earlier conversation a live chat gives the AI


class SimulatorTurn(BaseModel):
    role: Literal["customer", "assistant"]
    text: str = Field(..., min_length=1, max_length=4096)


class SimulateAIRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[SimulatorTurn] = Field(default_factory=list, max_length=SIMULATOR_HISTORY_TURNS)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Type a question to test")
        return value
