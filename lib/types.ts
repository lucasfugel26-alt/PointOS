export type PaymentMethod = 'cash' | 'card' | 'paypal' | 'other';
export type SaleStatus = 'completed' | 'cancelled';
export type ProductType = 'sale' | 'rental';

export interface Product {
  id: string;
  name: string;
  category: string | null;
  image_url: string | null;
  purchase_price: number; // EK
  selling_price: number; // VK
  vat_rate: number | null; // Phase 2
  deposit: number; // Pfand pro Einheit
  stock: number;
  min_stock: number;
  type: ProductType;
  active: boolean;
  archived: boolean;
  is_seed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number; // eingefroren
  deposit: number; // Pfand pro Einheit
  created_at: string;
}

export interface Sale {
  id: string;
  receipt_number: number;
  total: number;
  total_deposit: number;
  payment_method: PaymentMethod;
  cash_given: number | null;
  cash_change: number | null;
  status: SaleStatus;
  cancelled_at: string | null;
  location_id: string | null;
  employee_id: string | null;
  synced: boolean;
  created_at: string;
}

export interface Return {
  id: string;
  sale_id: string;
  sale_item_id: string;
  product_id: string;
  quantity: number;
  refund_amount: number;
  reason: string | null;
  created_at: string;
}

export interface DailyClosing {
  id: string;
  closing_date: string;
  total_sales: number;
  sales_count: number;
  cash_expected: number;
  cash_counted: number;
  difference: number;
  by_payment: Record<PaymentMethod, number>;
  notes: string | null;
  location_id: string | null;
  created_at: string;
}

export type OutboxOp =
  | 'sale.create'
  | 'sale.cancel'
  | 'sale.delete'
  | 'return.create'
  | 'product.upsert'
  | 'product.delete'
  | 'closing.create';

export interface OutboxEntry {
  id: string; // client UUID – Idempotenz
  op: OutboxOp;
  payload: any;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

// Warenkorb (nur lokal, nicht persistiert)
export interface CartLine {
  product: Product;
  quantity: number;
}
