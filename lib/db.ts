import Dexie, { Table } from 'dexie';
import type {
  Product,
  Sale,
  SaleItem,
  Return,
  DailyClosing,
  OutboxEntry,
} from './types';

// IndexedDB ist die lokale Quelle der Wahrheit (Offline-First).
// Supabase wird im Hintergrund über die Outbox synchronisiert.
export class PointOSDexie extends Dexie {
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  sale_items!: Table<SaleItem, string>;
  returns!: Table<Return, string>;
  daily_closings!: Table<DailyClosing, string>;
  outbox!: Table<OutboxEntry, string>;
  // einfacher Key/Value-Speicher für Zähler etc.
  meta!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('pointos');
    this.version(1).stores({
      products: 'id, name, category',
      sales: 'id, receipt_number, status, payment_method, created_at',
      sale_items: 'id, sale_id, product_id',
      returns: 'id, sale_id, sale_item_id, product_id, created_at',
      daily_closings: 'id, closing_date, created_at',
      outbox: 'id, op, created_at',
      meta: 'key',
    });
  }
}

let _db: PointOSDexie | null = null;

export function getDb(): PointOSDexie {
  if (!_db) {
    _db = new PointOSDexie();
  }
  return _db;
}

export const db = getDb();
