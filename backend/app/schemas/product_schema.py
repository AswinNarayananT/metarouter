from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, field_validator

MAX_STOCK_CHANGE = 1_000_000


def clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Product name is required")
    return value


def clean_optional(value: Optional[str]) -> Optional[str]:
    # "  " -> None, so an emptied field clears it
    if value is None:
        return None
    value = value.strip()
    return value or None


class ProductCreate(BaseModel):
    name: str = Field(..., max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=60)
    price: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    track_stock: bool = True
    stock_quantity: int = Field(0, ge=0, le=MAX_STOCK_CHANGE * 100)
    low_stock_threshold: Optional[int] = Field(None, ge=0, le=MAX_STOCK_CHANGE * 100)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return clean_name(value)

    @field_validator("description", "category")
    @classmethod
    def validate_optional(cls, value: Optional[str]) -> Optional[str]:
        return clean_optional(value)


class ProductUpdate(BaseModel):
    # Only the fields sent are changed
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=60)
    price: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    track_stock: Optional[bool] = None
    stock_quantity: Optional[int] = Field(None, ge=0, le=MAX_STOCK_CHANGE * 100)
    low_stock_threshold: Optional[int] = Field(None, ge=0, le=MAX_STOCK_CHANGE * 100)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        return clean_name(value) if value is not None else None

    @field_validator("description", "category")
    @classmethod
    def validate_optional(cls, value: Optional[str]) -> Optional[str]:
        return clean_optional(value)


class StockAdjust(BaseModel):
    change: int = Field(..., ge=-MAX_STOCK_CHANGE, le=MAX_STOCK_CHANGE)  # +10 restock, -3 sold / correction

    @field_validator("change")
    @classmethod
    def validate_change(cls, value: int) -> int:
        if value == 0:
            raise ValueError("Change can't be 0")
        return value
