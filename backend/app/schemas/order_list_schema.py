from pydantic import BaseModel


class OrderListLine(BaseModel):
    requested: str          # The item as the customer wrote or said it
    quantity: int
    product_ids: list[int]  # One = a clear match, several = the customer must choose, none = not sold here


class OrderListResult(BaseModel):
    lines: list[OrderListLine]  # Empty when the message isn't a list of things to buy
