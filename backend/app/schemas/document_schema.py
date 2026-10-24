from pydantic import BaseModel, Field
from typing import List

# Shape Gemini must return for a parsed document (matches the frontend ParsedDocument type)
class ParsedField(BaseModel):
    label: str
    value: str

class ParsedLineItem(BaseModel):
    description: str
    qty: float
    amount: str

class ParsedTotal(BaseModel):
    label: str
    value: str
    emphasis: bool  # True for the final total

class ParsedDocumentResult(BaseModel):
    document_type: str
    confidence: float  # 0 - 1
    fields: List[ParsedField]
    line_items: List[ParsedLineItem]
    totals: List[ParsedTotal]


class VoiceNoteTranscript(BaseModel):
    has_speech: bool = Field(description="True only if a person is clearly speaking words; false for silence, tones, music or noise")
    transcript: str = Field(description="Exactly what the customer said, in the language they spoke")
    language: str = Field(description="Language spoken, in English, e.g. 'Malayalam', 'English', 'Hindi'")
    english: str = Field(description="English translation of the transcript; empty string if they spoke English")
