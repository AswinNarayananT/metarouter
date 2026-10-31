// "40.00" + "INR" -> "₹40.00"; an unknown code falls back to "40.00 XYZ"
export function formatPrice(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

// "INR" -> "₹", for an input's prefix
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}
