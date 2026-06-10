import { db } from './db';
import type {
  Product,
  Sale,
  SaleItem,
  Return,
  DailyClosing,
  CartLine,
  PaymentMethod,
  OutboxOp,
} from './types';
import { uuid, nowISO, round2, dateKey, PAYMENT_LABELS } from './utils';
import { triggerSync } from './sync';

async function enqueue(op: OutboxOp, payload: any): Promise<void> {
  await db.outbox.add({
    id: uuid(),
    op,
    payload,
    created_at: nowISO(),
    attempts: 0,
    last_error: null,
  });
  // Im Hintergrund versuchen zu syncen (no-op wenn offline / nicht konfiguriert)
  triggerSync();
}

// ---------- Belegnummer (lokal fortlaufend) ----------
async function nextReceiptNumber(): Promise<number> {
  return db.transaction('rw', db.meta, async () => {
    const rec = await db.meta.get('receipt_counter');
    const next = ((rec?.value as number) || 0) + 1;
    await db.meta.put({ key: 'receipt_counter', value: next });
    return next;
  });
}

// ============================================================
// Produkte
// ============================================================
export async function listProducts(includeArchived = false): Promise<Product[]> {
  const all = await db.products.toArray();
  const filtered = includeArchived ? all : all.filter((p) => !p.archived);
  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

export async function upsertProduct(
  input: Partial<Product> & { name: string }
): Promise<Product> {
  const existing = input.id ? await db.products.get(input.id) : undefined;
  const ts = nowISO();
  const product: Product = {
    id: existing?.id ?? input.id ?? uuid(),
    name: input.name,
    category: input.category ?? existing?.category ?? null,
    image_url: input.image_url ?? existing?.image_url ?? null,
    purchase_price: input.purchase_price ?? existing?.purchase_price ?? 0,
    selling_price: input.selling_price ?? existing?.selling_price ?? 0,
    vat_rate: input.vat_rate ?? existing?.vat_rate ?? null,
    deposit: input.deposit ?? existing?.deposit ?? 0,
    stock: input.stock ?? existing?.stock ?? 0,
    min_stock: input.min_stock ?? existing?.min_stock ?? 0,
    type: input.type ?? existing?.type ?? 'sale',
    active: input.active ?? existing?.active ?? true,
    archived: input.archived ?? existing?.archived ?? false,
    is_seed: input.is_seed ?? existing?.is_seed ?? false,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
  };
  await db.products.put(product);
  await enqueue('product.upsert', product);
  return product;
}

export async function deleteProduct(id: string): Promise<void> {
  await db.products.delete(id);
  await enqueue('product.delete', { id });
}

export async function archiveProduct(id: string, archived = true): Promise<void> {
  const p = await db.products.get(id);
  if (!p) return;
  await upsertProduct({ ...p, archived });
}

export async function adjustStock(id: string, newStock: number): Promise<void> {
  const p = await db.products.get(id);
  if (!p) return;
  await upsertProduct({ ...p, stock: newStock });
}

// Alle Testdaten (is_seed) entfernen.
// IndexedDB indexiert keine Booleans, daher manuell filtern.
export async function deleteSeedData(): Promise<number> {
  const all = await db.products.toArray();
  const toDelete = all.filter((p) => p.is_seed);
  for (const p of toDelete) {
    await deleteProduct(p.id);
  }
  await db.meta.put({ key: 'seeded', value: true }); // nicht erneut seeden
  return toDelete.length;
}

// ============================================================
// Verkauf
// ============================================================
export interface CompleteSaleInput {
  lines: CartLine[];
  payment_method: PaymentMethod;
  cash_given?: number | null;
}

export interface CompletedSale {
  sale: Sale;
  items: SaleItem[];
}

export async function completeSale(input: CompleteSaleInput): Promise<CompletedSale> {
  const { lines, payment_method } = input;
  if (lines.length === 0) throw new Error('Warenkorb ist leer');

  const saleId = uuid();
  const ts = nowISO();
  const receipt = await nextReceiptNumber();

  let total = 0;
  let totalDeposit = 0;
  const items: SaleItem[] = lines.map((line) => {
    const lineGoods = line.product.selling_price * line.quantity;
    const lineDeposit = (line.product.deposit || 0) * line.quantity;
    total += lineGoods + lineDeposit;
    totalDeposit += lineDeposit;
    return {
      id: uuid(),
      sale_id: saleId,
      product_id: line.product.id,
      product_name: line.product.name,
      quantity: line.quantity,
      unit_price: line.product.selling_price,
      deposit: line.product.deposit || 0,
      created_at: ts,
    };
  });

  total = round2(total);
  totalDeposit = round2(totalDeposit);

  const cashGiven =
    payment_method === 'cash' && input.cash_given != null ? input.cash_given : null;
  const cashChange = cashGiven != null ? round2(cashGiven - total) : null;

  const sale: Sale = {
    id: saleId,
    receipt_number: receipt,
    total,
    total_deposit: totalDeposit,
    payment_method,
    cash_given: cashGiven,
    cash_change: cashChange,
    status: 'completed',
    cancelled_at: null,
    location_id: null,
    employee_id: null,
    synced: false,
    created_at: ts,
  };

  // Optimistisches Update: lokal speichern + Bestand sofort reduzieren
  await db.transaction('rw', db.sales, db.sale_items, db.products, async () => {
    await db.sales.add(sale);
    await db.sale_items.bulkAdd(items);
    for (const line of lines) {
      const p = await db.products.get(line.product.id);
      if (p) {
        await db.products.update(p.id, { stock: p.stock - line.quantity });
      }
    }
  });

  await enqueue('sale.create', { sale, items });
  return { sale, items };
}

// Schnell-Storno: Verkauf vollständig rückgängig machen.
export async function cancelSale(saleId: string): Promise<void> {
  const sale = await db.sales.get(saleId);
  if (!sale) throw new Error('Verkauf nicht gefunden');
  if (sale.status === 'cancelled') return;

  const items = await db.sale_items.where('sale_id').equals(saleId).toArray();
  const ts = nowISO();

  await db.transaction('rw', db.sales, db.products, async () => {
    await db.sales.update(saleId, { status: 'cancelled', cancelled_at: ts });
    for (const it of items) {
      const p = await db.products.get(it.product_id);
      if (p) {
        await db.products.update(p.id, { stock: p.stock + it.quantity });
      }
    }
  });

  await enqueue('sale.cancel', { id: saleId, cancelled_at: ts });
}

// Stornierten Verkauf endgültig löschen. Nur erlaubt, wenn bereits
// storniert (Bestand wurde dabei schon zurückgebucht). Zugehörige
// Positionen und Rückgaben werden mit entfernt.
export async function deleteSale(saleId: string): Promise<void> {
  const sale = await db.sales.get(saleId);
  if (!sale) return;
  if (sale.status !== 'cancelled') {
    throw new Error('Nur stornierte Verkäufe können gelöscht werden');
  }

  await db.transaction('rw', db.sales, db.sale_items, db.returns, async () => {
    await db.sale_items.where('sale_id').equals(saleId).delete();
    await db.returns.where('sale_id').equals(saleId).delete();
    await db.sales.delete(saleId);
  });

  await enqueue('sale.delete', { id: saleId });
}

export async function listSales(): Promise<Sale[]> {
  const all = await db.sales.toArray();
  return all.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getSaleWithItems(
  saleId: string
): Promise<{ sale: Sale; items: SaleItem[] } | null> {
  const sale = await db.sales.get(saleId);
  if (!sale) return null;
  const items = await db.sale_items.where('sale_id').equals(saleId).toArray();
  return { sale, items };
}

export async function getLastSale(): Promise<Sale | null> {
  const sales = await listSales();
  return sales[0] ?? null;
}

// ============================================================
// Rückgaben
// ============================================================
export async function getReturnedQuantities(
  saleId: string
): Promise<Record<string, number>> {
  const rets = await db.returns.where('sale_id').equals(saleId).toArray();
  const map: Record<string, number> = {};
  for (const r of rets) {
    map[r.sale_item_id] = (map[r.sale_item_id] || 0) + r.quantity;
  }
  return map;
}

export async function createReturn(
  saleItemId: string,
  quantity: number,
  reason?: string
): Promise<Return> {
  const item = await db.sale_items.get(saleItemId);
  if (!item) throw new Error('Position nicht gefunden');
  if (quantity <= 0) throw new Error('Menge muss > 0 sein');

  const already = await getReturnedQuantities(item.sale_id);
  const returnedSoFar = already[saleItemId] || 0;
  if (returnedSoFar + quantity > item.quantity) {
    throw new Error('Mehr zurückgegeben als verkauft');
  }

  const refund = round2((item.unit_price + (item.deposit || 0)) * quantity);
  const ts = nowISO();
  const ret: Return = {
    id: uuid(),
    sale_id: item.sale_id,
    sale_item_id: saleItemId,
    product_id: item.product_id,
    quantity,
    refund_amount: refund,
    reason: reason ?? null,
    created_at: ts,
  };

  await db.transaction('rw', db.returns, db.products, async () => {
    await db.returns.add(ret);
    const p = await db.products.get(item.product_id);
    if (p) {
      await db.products.update(p.id, { stock: p.stock + quantity });
    }
  });

  await enqueue('return.create', ret);
  return ret;
}

export async function listReturns(): Promise<Return[]> {
  return db.returns.toArray();
}

// ============================================================
// Tagesabschluss
// ============================================================
export async function computeDaySummary(day: Date): Promise<{
  salesCount: number;
  totalSales: number;
  byPayment: Record<PaymentMethod, number>;
  cashExpected: number;
}> {
  const key = dateKey(day);
  const sales = (await db.sales.toArray()).filter(
    (s) => dateKey(new Date(s.created_at)) === key && s.status === 'completed'
  );
  const returns = (await db.returns.toArray()).filter(
    (r) => dateKey(new Date(r.created_at)) === key
  );

  const byPayment: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    paypal: 0,
    other: 0,
  };
  let totalSales = 0;
  for (const s of sales) {
    byPayment[s.payment_method] += s.total;
    totalSales += s.total;
  }

  // Bar-Rückgaben mindern den Bartopf. Ohne expliziter Rückzahlungsart
  // nehmen wir an, dass Rückgaben in bar erstattet werden.
  let cashReturns = 0;
  for (const r of returns) cashReturns += r.refund_amount;

  totalSales = round2(totalSales - returns.reduce((a, r) => a + r.refund_amount, 0));
  const cashExpected = round2(byPayment.cash - cashReturns);

  return {
    salesCount: sales.length,
    totalSales,
    byPayment,
    cashExpected,
  };
}

export async function saveDailyClosing(input: {
  day: Date;
  cashCounted: number;
  notes?: string;
}): Promise<DailyClosing> {
  const summary = await computeDaySummary(input.day);
  const closing: DailyClosing = {
    id: uuid(),
    closing_date: dateKey(input.day),
    total_sales: summary.totalSales,
    sales_count: summary.salesCount,
    cash_expected: summary.cashExpected,
    cash_counted: input.cashCounted,
    difference: round2(input.cashCounted - summary.cashExpected),
    by_payment: summary.byPayment,
    notes: input.notes ?? null,
    location_id: null,
    created_at: nowISO(),
  };
  await db.daily_closings.add(closing);
  await enqueue('closing.create', closing);
  return closing;
}

export async function listClosings(): Promise<DailyClosing[]> {
  const all = await db.daily_closings.toArray();
  return all.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export { PAYMENT_LABELS };
