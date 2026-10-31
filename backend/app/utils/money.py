from decimal import Decimal

# Symbols for the supported currencies that have a common one; others are written as "AED 40"
CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "SGD": "S$", "AUD": "A$", "CAD": "C$"}


def format_price(amount, currency: str) -> str:
    # 285 -> "₹285", 28.5 -> "₹28.50" (whole amounts without decimals, for short WhatsApp lines)
    value = Decimal(str(amount))
    number = f"{value:,.0f}" if value == value.to_integral_value() else f"{value:,.2f}"
    symbol = CURRENCY_SYMBOLS.get(currency)
    return f"{symbol}{number}" if symbol else f"{currency} {number}"
