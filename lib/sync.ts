import { db } from './db';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { OutboxEntry } from './types';

// ---------- Sync-Status (Pub/Sub für UI-Indikator) ----------
export interface SyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
  configured: boolean;
  lastSync: string | null;
}

type Listener = (s: SyncState) => void;

const state: SyncState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pending: 0,
  syncing: false,
  configured: isSupabaseConfigured(),
  lastSync: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l({ ...state });
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l);
  l({ ...state });
  return () => listeners.delete(l);
}

export function getSyncState(): SyncState {
  return { ...state };
}

async function refreshPending() {
  state.pending = await db.outbox.count();
  emit();
}

// ---------- Outbox-Verarbeitung ----------
async function pushEntry(entry: OutboxEntry): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  switch (entry.op) {
    case 'sale.create': {
      const { sale, items } = entry.payload;
      const { synced, ...saleRow } = sale;
      const { error: e1 } = await sb
        .from('sales')
        .upsert({ ...saleRow, synced: true }, { onConflict: 'id' });
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await sb
        .from('sale_items')
        .upsert(items, { onConflict: 'id' });
      if (e2) throw new Error(e2.message);
      // lokal als synced markieren
      await db.sales.update(sale.id, { synced: true });
      break;
    }
    case 'sale.cancel': {
      const { id, cancelled_at } = entry.payload;
      const { error } = await sb
        .from('sales')
        .update({ status: 'cancelled', cancelled_at })
        .eq('id', id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'sale.delete': {
      const { id } = entry.payload;
      // sale_items & returns werden serverseitig per ON DELETE CASCADE
      // bzw. manuell entfernt; Rückgaben referenzieren sales(id).
      await sb.from('returns').delete().eq('sale_id', id);
      const { error } = await sb.from('sales').delete().eq('id', id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'return.create': {
      const { error } = await sb
        .from('returns')
        .upsert(entry.payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      break;
    }
    case 'product.upsert': {
      const { error } = await sb
        .from('products')
        .upsert(entry.payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      break;
    }
    case 'product.delete': {
      const { error } = await sb.from('products').delete().eq('id', entry.payload.id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'closing.create': {
      const { error } = await sb
        .from('daily_closings')
        .upsert(entry.payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      break;
    }
  }
}

let running = false;

export async function flushOutbox(): Promise<void> {
  if (running) return;
  if (!isSupabaseConfigured()) {
    await refreshPending();
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await refreshPending();
    return;
  }

  running = true;
  state.syncing = true;
  emit();

  try {
    // FIFO – Reihenfolge wichtig (z. B. sale.create vor return.create)
    const entries = (await db.outbox.toArray()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const entry of entries) {
      try {
        await pushEntry(entry);
        await db.outbox.delete(entry.id); // idempotent: erst nach Erfolg löschen
      } catch (err: any) {
        await db.outbox.update(entry.id, {
          attempts: (entry.attempts || 0) + 1,
          last_error: String(err?.message ?? err),
        });
        // Bei Fehler abbrechen (Netz weg / Server-Problem) und später erneut
        break;
      }
    }
    state.lastSync = new Date().toISOString();
  } finally {
    running = false;
    state.syncing = false;
    await refreshPending();
  }
}

// Produkte vom Server ziehen (nur initial / manuell – Verkäufe sind append-only).
export async function pullProducts(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const { data, error } = await sb.from('products').select('*');
  if (error || !data) return;
  // Nur übernehmen, wenn lokal noch keine ausstehenden Produkt-Änderungen
  const pendingProductOps = await db.outbox
    .filter((e) => e.op.startsWith('product.'))
    .count();
  if (pendingProductOps > 0) return;
  for (const row of data as any[]) {
    await db.products.put(row);
  }
}

let debounce: any = null;
export function triggerSync(): void {
  if (typeof window === 'undefined') return;
  refreshPending();
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    flushOutbox();
  }, 400);
}

let initialized = false;
export function initSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const update = () => {
    state.online = navigator.onLine;
    state.configured = isSupabaseConfigured();
    emit();
    if (navigator.onLine) flushOutbox();
  };

  window.addEventListener('online', update);
  window.addEventListener('offline', update);

  // Initiale Synchronisierung + periodisch
  refreshPending();
  pullProducts().then(() => flushOutbox());
  setInterval(() => {
    if (navigator.onLine) flushOutbox();
  }, 15000);
}
