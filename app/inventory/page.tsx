'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Product } from '@/lib/types';
import { upsertProduct, deleteProduct, archiveProduct } from '@/lib/repository';
import { eur } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import { PlusIcon } from '@/components/icons';

function stockBadge(p: Product) {
  if (p.stock <= 0) return <span className="badge bg-red-100 text-red-700">Ausverkauft</span>;
  if (p.stock < p.min_stock) return <span className="badge bg-amber-100 text-amber-700">Niedrig</span>;
  return <span className="badge bg-emerald-100 text-emerald-700">Verfügbar</span>;
}

const EMPTY: Partial<Product> = {
  name: '',
  category: '',
  image_url: '',
  purchase_price: 0,
  selling_price: 0,
  deposit: 0,
  stock: 0,
  min_stock: 0,
  type: 'sale',
  active: true,
  archived: false,
};

export default function InventoryPage() {
  const [showArchived, setShowArchived] = useState(false);
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const list = useMemo(() => {
    const arr = (products || []).filter((p) => showArchived || !p.archived);
    return arr.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [products, showArchived]);

  return (
    <div>
      <PageHeader
        title="Lager"
        subtitle={`${list.length} Produkte`}
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Archivierte anzeigen
            </label>
            <button onClick={() => setEditing({ ...EMPTY })} className="btn-primary">
              <PlusIcon /> Produkt anlegen
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((p) => (
          <div key={p.id} className={`card flex flex-col p-4 ${p.archived ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-500">{p.category || 'Ohne Kategorie'}</div>
              </div>
              {stockBadge(p)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-gray-500">Bestand</span>
              <span className="text-right font-medium">{p.stock}</span>
              <span className="text-gray-500">Mindest</span>
              <span className="text-right">{p.min_stock}</span>
              <span className="text-gray-500">EK</span>
              <span className="text-right">{eur(p.purchase_price)}</span>
              <span className="text-gray-500">VK</span>
              <span className="text-right font-medium text-accent">{eur(p.selling_price)}</span>
              {p.deposit > 0 && (
                <>
                  <span className="text-gray-500">Pfand</span>
                  <span className="text-right">{eur(p.deposit)}</span>
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setEditing(p)} className="btn-secondary flex-1 text-sm">
                Bearbeiten
              </button>
              <button
                onClick={() => archiveProduct(p.id, !p.archived)}
                className="btn-ghost text-sm"
              >
                {p.archived ? 'Aktivieren' : 'Archivieren'}
              </button>
              <button onClick={() => setConfirmDelete(p)} className="btn-ghost text-sm text-red-600">
                Löschen
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="col-span-full py-12 text-center text-gray-400">
            Noch keine Produkte angelegt.
          </p>
        )}
      </div>

      {editing && (
        <ProductForm
          initial={editing}
          categories={Array.from(
            new Set((products || []).map((p) => p.category).filter(Boolean) as string[])
          )}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await upsertProduct(data as any);
            setEditing(null);
          }}
        />
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Produkt löschen?"
        maxWidth="max-w-sm"
      >
        <p className="text-sm text-gray-600">
          „{confirmDelete?.name}“ wird unwiderruflich gelöscht. Verkaufshistorie bleibt erhalten.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={async () => {
              if (confirmDelete) await deleteProduct(confirmDelete.id);
              setConfirmDelete(null);
            }}
            className="btn-danger flex-1"
          >
            Löschen
          </button>
          <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">
            Abbrechen
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ProductForm({
  initial,
  categories,
  onClose,
  onSave,
}: {
  initial: Partial<Product>;
  categories: string[];
  onClose: () => void;
  onSave: (data: Partial<Product>) => void;
}) {
  const [form, setForm] = useState<Partial<Product>>(initial);
  const isNew = !initial.id;

  function set<K extends keyof Product>(key: K, value: Product[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function num(v: string): number {
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Produkt anlegen' : 'Produkt bearbeiten'}>
      <div className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input
            className="input"
            value={form.name || ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Kategorie</label>
          <input
            className="input"
            list="cat-list"
            value={form.category || ''}
            onChange={(e) => set('category', e.target.value)}
          />
          <datalist id="cat-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">Foto-URL (optional)</label>
          <input
            className="input"
            value={form.image_url || ''}
            onChange={(e) => set('image_url', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">EK (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={form.purchase_price ?? 0}
              onChange={(e) => set('purchase_price', num(e.target.value))}
            />
          </div>
          <div>
            <label className="label">VK (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={form.selling_price ?? 0}
              onChange={(e) => set('selling_price', num(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Pfand (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={form.deposit ?? 0}
              onChange={(e) => set('deposit', num(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Bestand</label>
            <input
              className="input"
              inputMode="numeric"
              value={form.stock ?? 0}
              onChange={(e) => set('stock', Math.round(num(e.target.value)))}
            />
          </div>
          <div>
            <label className="label">Mindestbestand</label>
            <input
              className="input"
              inputMode="numeric"
              value={form.min_stock ?? 0}
              onChange={(e) => set('min_stock', Math.round(num(e.target.value)))}
            />
          </div>
        </div>
        {/* USt.-Satz: Phase 2 – bewusst ausgeblendet (Kleinunternehmer §19) */}

        <div className="flex gap-2 pt-2">
          <button
            disabled={!form.name?.trim()}
            onClick={() => onSave(form)}
            className="btn-primary flex-1 disabled:opacity-40"
          >
            Speichern
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Abbrechen
          </button>
        </div>
      </div>
    </Modal>
  );
}
