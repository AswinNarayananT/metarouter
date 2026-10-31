import type { Product } from '@/types/productTypes';

const STYLES = {
  in_stock: 'bg-primary/10 text-primary border-primary/20',
  low: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
  out: 'bg-error/10 text-error border-error/20',
  not_tracked: 'bg-surface-container text-on-surface-variant border-outline-variant/40',
};

export function StockBadge({ product }: { product: Product }) {
  const label = {
    in_stock: `In stock · ${product.stock_quantity}`,
    low: `Low · ${product.stock_quantity}`,
    out: 'Out of stock',
    not_tracked: 'Not tracked',
  }[product.stock_status];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${STYLES[product.stock_status]}`}>
      {label}
    </span>
  );
}
