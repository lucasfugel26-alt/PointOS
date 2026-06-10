'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Sale, SaleItem } from '@/lib/types';
import { cancelSale, deleteSale, createReturn, getReturnedQuantities } from '@/lib/repository';
import { eur, formatDateTime, PAYMENT_LABELS } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import Receipt from '@/components/Receipt';

export default function HistoryPage() {
  const sales = useLiveQuery(
    async () => (await db.sales.toArray()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [],
    [] as Sale[]
  );

  const [detail, setDetail] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [receiptView, setReceiptView] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Sale | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Sale | null>(null);

  async function openDetail(sale: Sale) {
    const items = await db.sale_items.where('sale_id').equals(sale.id).toArray();
    setDetail({ sale, items });
  }

  return (
    <div>
      <PageHeader title="Verlauf" subtitle={`${sales?.length ?? 0} Transaktionen`} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Beleg</th>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Zahlung</th>
                <th className="px-4 py-3 text-right">Summe</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(sales || []).map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">#{s.receipt_number}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDateTime(s.created_at)}</td>
                  <td className="px-4 py-3">{PAYMENT_LABELS[s.payment_method]}</td>
                  <td className="px-4 py-3 text-right font-medium">{eur(s.total)}</td>
                  <td className="px-4 py-3">
                    {s.status === 'cancelled' ? (
                      <span className="badge bg-red-100 text-red-700">Storniert</span>
                    ) : (
                      <span className="badge bg-emerald-100 text-emerald-700">Abgeschlossen</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDetail(s)} className="text-accent hover:underline">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {(sales || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Noch keine Verkäufe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail / Rückgabe */}
      {detail && (
        <SaleDetail
          sale={detail.sale}
          items={detail.items}
          onClose={() => setDetail(null)}
          onShowReceipt={() => {
            setReceiptView(detail);
          }}
          onCancel={() => setConfirmCancel(detail.sale)}
          onDelete={() => setConfirmDelete(detail.sale)}
          onChanged={() => openDetail(detail.sale)}
        />
      )}

      {/* Beleg anzeigen */}
      <Modal
        open={!!receiptView}
        onClose={() => setReceiptView(null)}
        title={`Beleg #${receiptView?.sale.receipt_number ?? ''}`}
        maxWidth="max-w-md"
      >
        {receiptView && (
          <>
            <Receipt sale={receiptView.sale} items={receiptView.items} />
            <div className="mt-4 flex gap-2 no-print">
              <button onClick={() => window.print()} className="btn-primary flex-1">
                Drucken / PDF
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Storno bestätigen */}
      <Modal
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        title="Verkauf stornieren?"
        maxWidth="max-w-sm"
      >
        <p className="text-sm text-gray-600">
          Beleg #{confirmCancel?.receipt_number} wird vollständig storniert. Der Bestand wird
          zurückgebucht. (Storno = kompletter Fehler, kein Geld geflossen.)
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={async () => {
              if (confirmCancel) await cancelSale(confirmCancel.id);
              setConfirmCancel(null);
              setDetail(null);
            }}
            className="btn-danger flex-1"
          >
            Stornieren
          </button>
          <button onClick={() => setConfirmCancel(null)} className="btn-secondary flex-1">
            Abbrechen
          </button>
        </div>
      </Modal>

      {/* Stornierten Verkauf löschen bestätigen */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Stornierten Verkauf löschen?"
        maxWidth="max-w-sm"
      >
        <p className="text-sm text-gray-600">
          Beleg #{confirmDelete?.receipt_number} wird endgültig aus dem Verlauf entfernt.
          Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={async () => {
              if (confirmDelete) await deleteSale(confirmDelete.id);
              setConfirmDelete(null);
              setDetail(null);
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

function SaleDetail({
  sale,
  items,
  onClose,
  onShowReceipt,
  onCancel,
  onDelete,
  onChanged,
}: {
  sale: Sale;
  items: SaleItem[];
  onClose: () => void;
  onShowReceipt: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const returnedQ = useLiveQuery(() => getReturnedQuantities(sale.id), [sale.id], {} as Record<string, number>);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const cancelled = sale.status === 'cancelled';

  async function doReturn() {
    setBusy(true);
    try {
      for (const it of items) {
        const q = qty[it.id] || 0;
        if (q > 0) await createReturn(it.id, q, reason || undefined);
      }
      setQty({});
      setReason('');
      onChanged();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const anyReturn = Object.values(qty).some((q) => q > 0);

  return (
    <Modal open onClose={onClose} title={`Beleg #${sale.receipt_number}`}>
      <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
        <span>{formatDateTime(sale.created_at)}</span>
        <span>{PAYMENT_LABELS[sale.payment_method]}</span>
      </div>

      {cancelled && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-center text-sm font-medium text-red-700">
          Dieser Verkauf wurde storniert.
        </div>
      )}

      <div className="space-y-2">
        {items.map((it) => {
          const already = (returnedQ || {})[it.id] || 0;
          const remaining = it.quantity - already;
          return (
            <div key={it.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex justify-between">
                <span className="font-medium">{it.product_name}</span>
                <span>{eur((it.unit_price + it.deposit) * it.quantity)}</span>
              </div>
              <div className="text-xs text-gray-500">
                {it.quantity} × {eur(it.unit_price)}
                {it.deposit > 0 && <> (+ {eur(it.deposit)} Pfand)</>}
                {already > 0 && <> · {already} zurückgegeben</>}
              </div>
              {!cancelled && remaining > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Zurückgeben:</span>
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    value={qty[it.id] || 0}
                    onChange={(e) =>
                      setQty((q) => ({
                        ...q,
                        [it.id]: Math.min(remaining, Math.max(0, parseInt(e.target.value) || 0)),
                      }))
                    }
                    className="h-8 w-16 rounded-md border border-gray-200 text-center text-sm"
                  />
                  <span className="text-xs text-gray-400">/ {remaining}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!cancelled && anyReturn && (
        <div className="mt-3">
          <input
            className="input"
            placeholder="Grund der Rückgabe (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onShowReceipt} className="btn-secondary flex-1">
          Beleg anzeigen
        </button>
        {!cancelled && anyReturn && (
          <button onClick={doReturn} disabled={busy} className="btn-primary flex-1">
            Rückgabe buchen
          </button>
        )}
        {!cancelled && (
          <button onClick={onCancel} className="btn-danger flex-1">
            Stornieren
          </button>
        )}
        {cancelled && (
          <button onClick={onDelete} className="btn-danger flex-1">
            Verkauf löschen
          </button>
        )}
      </div>
    </Modal>
  );
}
