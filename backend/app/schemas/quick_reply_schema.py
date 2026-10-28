import re
from pydantic import BaseModel, Field, field_validator

SHORTCUT_PATTERN = re.compile(r"^[a-z0-9_-]{1,30}$")
QUICK_REPLY_MAX_CHARS = 4096  # One WhatsApp text message


def clean_shortcut(value: str) -> str:
    # "/Refund " -> "refund"
    value = value.strip().lstrip("/").lower()
    if not SHORTCUT_PATTERN.match(value):
        raise ValueError("Shortcut can use letters, numbers, - and _ only (up to 30, no spaces)")
    return value


def clean_content(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Reply text is required")
    return value


class QuickReplyCreate(BaseModel):
    shortcut: str = Field(..., min_length=1, max_length=31)
    content: str = Field(..., min_length=1, max_length=QUICK_REPLY_MAX_CHARS)
    shared: bool = False  # True = the whole team sees it (admins and managers only)

    @field_validator("shortcut")
    @classmethod
    def validate_shortcut(cls, value: str) -> str:
        return clean_shortcut(value)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return clean_content(value)


class QuickReplyUpdate(BaseModel):
    shortcut: str = Field(..., min_length=1, max_length=31)
    content: str = Field(..., min_length=1, max_length=QUICK_REPLY_MAX_CHARS)

    @field_validator("shortcut")
    @classmethod
    def validate_shortcut(cls, value: str) -> str:
        return clean_shortcut(value)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return clean_content(value)
