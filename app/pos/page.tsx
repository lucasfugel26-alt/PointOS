'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Product, CartLine, PaymentMethod, Sale, SaleItem } from '@/lib/types';
import { completeSale, cancelSale, getSaleWithItems } from '@/lib/repository';
import { eur, round2, PAYMENT_LABELS } from '@/lib/utils';
import { PlusIcon, MinusIcon, TrashIcon, CartIcon } from '@/components/icons';
import Modal from '@/components/Modal';
import Receipt from '@/components/Receipt';

export default function POSPage() {
  const products = useLiveQuery(
    () => db.products.filter((p) => !p.archived && p.active).toArray(),
    [],
    [] as Product[]
  );

  const [category, setCategory] = useState<string>('Alle');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (products || []).forEach((p) => p.category && set.add(p.category));
    return ['Alle', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))];
  }, [products]);

  const filtered = useMemo(() => {
    const list = products || [];
    return (category === 'Alle' ? list : list.filter((p) => p.category === category)).sort(
      (a, b) => a.name.localeCompare(b.name, 'de')
    );
  }, [products, category]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, quantity: qty } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  const totals = useMemo(() => {
    let goods = 0;
    let deposit = 0;
    for (const l of cart) {
      goods += l.product.selling_price * l.quantity;
      deposit += (l.product.deposit || 0) * l.quantity;
    }
    return {
      goods: round2(goods),
      deposit: round2(deposit),
      total: round2(goods + deposit),
    };
  }, [cart]);

  async function handleComplete(method: PaymentMethod, cashGiven: number | null) {
    const result = await completeSale({
      lines: cart,
      payment_method: method,
      cash_given: cashGiven,
    });
    setCart([]);
    setPayOpen(false);
    setCartOpen(false);
    setLastSaleId(result.sale.id);
    setReceipt(result);
  }

  async function handleCancelLast() {
    if (!lastSaleId) return;
    await cancelSale(lastSaleId);
    showToast(`Verkauf storniert – Bestand zurückgebucht`);
    setLastSaleId(null);
  }

  const cartItemCount = cart.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="flex h-full">
      {/* Produktbereich */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Verkauf</h1>
          {lastSaleId && (
            <button onClick={handleCancelLast} className="btn-secondary text-sm">
              Stornieren
            </button>
          )}
        </div>

        {/* Kategoriefilter */}
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                category === c
                  ? 'bg-accent text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Produktkacheln */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => {
            const out = p.stock <= 0;
            return (
              <button
                key={p.id}
                onClick={() => !out && addToCart(p)}
                disabled={out}
                className={`card flex flex-col overflow-hidden text-left transition hover:shadow-md ${
                  out ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.98]'
                }`}
              >
                <div className="flex h-20 items-center justify-center bg-gray-100 sm:h-24">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl text-gray-300">📦</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-2 sm:p-3">
                  <div className="line-clamp-2 text-xs font-medium text-gray-900 sm:text-sm">{p.name}</div>
                  <div className="mt-1 text-base font-bold text-accent sm:text-lg">{eur(p.selling_price)}</div>
                  {p.deposit > 0 && (
                    <div className="text-xs text-gray-500">+ {eur(p.deposit)} Pfand</div>
                  )}
                  <div className="mt-auto pt-1 text-xs text-gray-500">
                    {out ? (
                      <span className="font-medium text-red-500">Ausverkauft</span>
                    ) : (
                      <>Bestand: {p.stock}</>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-12 text-center text-gray-400">
              Keine Produkte. Lege im Lager welche an.
            </p>
          )}
        </div>
      </div>

      {/* Desktop Warenkorb (sidebar) */}
      <div className="hidden md:flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
        <CartPanel
          cart={cart}
          totals={totals}
          setQty={setQty}
          removeLine={removeLine}
          onClear={() => setCart([])}
          onPay={() => setPayOpen(true)}
        />
      </div>

      {/* Mobile Warenkorb-Bar (sticky bottom, above bottom-nav) */}
      {cart.length > 0 && (
        <div className="md:hidden fixed bottom-16 inset-x-0 z-30 flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
          <button
            onClick={() => setCartOpen(true)}
            className="flex flex-1 items-center gap-3"
          >
            <div className="relative">
              <CartIcon className="h-6 w-6 text-accent" />
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {cartItemCount}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {cartItemCount} Artikel · {eur(totals.total)}
            </span>
          </button>
          <button
            onClick={() => setPayOpen(true)}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            Kassieren
          </button>
        </div>
      )}

      {/* Mobile Warenkorb-Drawer */}
      {cartOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex flex-col justify-end bg-black/40"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="flex max-h-[80vh] flex-col rounded-t-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Warenkorb</h2>
              <button onClick={() => setCartOpen(false)} className="text-gray-400 text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CartPanel
                cart={cart}
                totals={totals}
                setQty={setQty}
                removeLine={removeLine}
                onClear={() => { setCart([]); setCartOpen(false); }}
                onPay={() => { setCartOpen(false); setPayOpen(true); }}
              />
            </div>
          </div>
        </div>
      )}

      <PaymentModal
        open={payOpen}
        total={totals.total}
        onClose={() => setPayOpen(false)}
        onConfirm={handleComplete}
      />

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title={`Beleg #${receipt?.sale.receipt_number ?? ''}`}
        maxWidth="max-w-md"
      >
        {receipt && (
          <>
            <Receipt sale={receipt.sale} items={receipt.items} />
            <div className="mt-4 flex gap-2 no-print">
              <button onClick={() => window.print()} className="btn-primary flex-1">
                Drucken / PDF
              </button>
              <button onClick={() => setReceipt(null)} className="btn-secondary flex-1">
                Neuer Verkauf
              </button>
            </div>
          </>
        )}
      </Modal>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}

function CartPanel({
  cart,
  totals,
  setQty,
  removeLine,
  onClear,
  onPay,
}: {
  cart: CartLine[];
  totals: { goods: number; deposit: number; total: number };
  setQty: (id: string, qty: number) => void;
  removeLine: (id: string) => void;
  onClear: () => void;
  onPay: () => void;
}) {
  return (
    <>
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="font-semibold text-gray-900">Warenkorb</h2>
        <p className="text-xs text-gray-500">{cart.length} Position(en)</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {cart.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            Tippe Produkte an, um sie hinzuzufügen.
          </p>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div key={l.product.id} className="rounded-lg border border-gray-100 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">{l.product.name}</div>
                  <button
                    onClick={() => removeLine(l.product.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <TrashIcon />
                  </button>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {eur(l.product.selling_price)}
                  {l.product.deposit > 0 && <> + {eur(l.product.deposit)} Pfand</>}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(l.product.id, l.quantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200"
                    >
                      <MinusIcon />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={l.quantity}
                      onChange={(e) =>
                        setQty(l.product.id, Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="h-8 w-12 rounded-md border border-gray-200 text-center text-sm"
                    />
                    <button
                      onClick={() => setQty(l.product.id, l.quantity + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {eur((l.product.selling_price + l.product.deposit) * l.quantity)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summen */}
      <div className="border-t border-gray-200 px-5 py-4">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Warenwert</span>
          <span>{eur(totals.goods)}</span>
        </div>
        {totals.deposit > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Pfand</span>
            <span>{eur(totals.deposit)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-lg font-bold text-gray-900">
          <span>Endsumme</span>
          <span>{eur(totals.total)}</span>
        </div>
        <button
          disabled={cart.length === 0}
          onClick={onPay}
          className="btn-primary mt-3 w-full text-base disabled:opacity-40"
        >
          Verkauf abschließen
        </button>
        {cart.length > 0 && (
          <button onClick={onClear} className="btn-ghost mt-1 w-full text-sm">
            Warenkorb leeren
          </button>
        )}
      </div>
    </>
  );
}

function PaymentModal({
  open,
  total,
  onClose,
  onConfirm,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, cashGiven: number | null) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [given, setGiven] = useState<string>('');

  const givenNum = parseFloat(given.replace(',', '.'));
  const change = !isNaN(givenNum) ? round2(givenNum - total) : null;

  const methods: PaymentMethod[] = ['cash', 'card', 'paypal', 'other'];
  const quick = [total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50];
  const quickUnique = Array.from(new Set(quick.filter((q) => q >= total)));

  function confirm() {
    if (method === 'cash') {
      onConfirm('cash', isNaN(givenNum) ? total : givenNum);
    } else {
      onConfirm(method, null);
    }
    setGiven('');
    setMethod('cash');
  }

  return (
    <Modal open={open} onClose={onClose} title="Zahlung" maxWidth="max-w-md">
      <div className="mb-4 text-center">
        <div className="text-sm text-gray-500">Zu zahlen</div>
        <div className="text-3xl font-bold text-gray-900">{eur(total)}</div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {methods.map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-lg border-2 px-4 py-3 font-medium ${
              method === m
                ? 'border-accent bg-accent/5 text-accent'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {PAYMENT_LABELS[m]}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <div className="mb-4">
          <label className="label">Gegeben</label>
          <input
            autoFocus
            inputMode="decimal"
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            placeholder={total.toFixed(2)}
            className="input text-lg"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {quickUnique.map((q) => (
              <button
                key={q}
                onClick={() => setGiven(q.toFixed(2))}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
              >
                {eur(q)}
              </button>
            ))}
          </div>
          {change !== null && (
            <div
              className={`mt-4 rounded-lg p-4 text-center ${
                change < 0 ? 'bg-red-50' : 'bg-emerald-50'
              }`}
            >
              <div className="text-sm text-gray-500">Rückgeld</div>
              <div
                className={`text-4xl font-extrabold ${
                  change < 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {eur(Math.max(0, change))}
              </div>
              {change < 0 && (
                <div className="text-sm text-red-600">Betrag reicht nicht aus</div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={confirm}
        disabled={method === 'cash' && change !== null && change < 0}
        className="btn-primary w-full text-base disabled:opacity-40"
      >
        Verkauf abschließen
      </button>
    </Modal>
  );
}
