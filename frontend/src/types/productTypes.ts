// Shapes from backend/app/api/v1/products.py
export type StockStatus = 'not_tracked' | 'in_stock' | 'low' | 'out';
export type ProductStatusFilter = 'all' | 'low' | 'out' | 'archived';

export interface Product {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: string; // Decimal string: "40.00"
  track_stock: boolean;
  stock_quantity: number; // Kept when tracking is off
  low_stock_threshold: number | null; // At or below this = low (null = no warning)
  stock_status: StockStatus;
  is_active: boolean; // For sale
  archived: boolean;
  updated_at: string | null;
}

export interface ProductInput {
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  track_stock: boolean;
  stock_quantity?: number; // Left out when tracking is off, so the saved values are kept
  low_stock_threshold?: number | null;
  is_active: boolean;
}

export interface ProductsPage {
  products: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: { total: number; low: number; out: number }; // Current products, ignoring the filters
  currency: string;
}

export interface FetchProductsParams {
  q?: string;
  category?: string;
  status: ProductStatusFilter;
  page: number;
  page_size: number;
}

// A failed save: field = 'name' when the name is already used, so the form points at it
export interface ProductSaveError {
  message: string;
  field: 'name' | null;
}
