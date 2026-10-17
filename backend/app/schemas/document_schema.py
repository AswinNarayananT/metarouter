from pydantic import BaseModel
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
