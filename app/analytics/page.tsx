'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { db } from '@/lib/db';
import type { Sale, SaleItem, Return, Product } from '@/lib/types';
import { eur, dateKey, PAYMENT_LABELS } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';

type Period = 'today' | '7d' | '30d' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Heute' },
  { key: '7d', label: '7 Tage' },
  { key: '30d', label: '30 Tage' },
  { key: 'all', label: 'Gesamt' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d');

  const sales = useLiveQuery(() => db.sales.toArray(), [], [] as Sale[]);
  const items = useLiveQuery(() => db.sale_items.toArray(), [], [] as SaleItem[]);
  const returns = useLiveQuery(() => db.returns.toArray(), [], [] as Return[]);
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);

  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (period === 'today') return d;
    if (period === '7d') return new Date(d.getTime() - 6 * 86400000);
    if (period === '30d') return new Date(d.getTime() - 29 * 86400000);
    return new Date(0);
  }, [period]);

  const data = useMemo(() => {
    const allSales = sales || [];
    const allItems = items || [];
    const allReturns = returns || [];
    const prodMap = new Map((products || []).map((p) => [p.id, p]));

    const completed = allSales.filter(
      (s) => s.status === 'completed' && new Date(s.created_at) >= from
    );
    const cancelled = allSales.filter(
      (s) => s.status === 'cancelled' && new Date(s.created_at) >= from
    );
    const periodReturns = allReturns.filter((r) => new Date(r.created_at) >= from);
    const completedIds = new Set(completed.map((s) => s.id));
    const periodItems = allItems.filter((i) => completedIds.has(i.sale_id));

    const grossRevenue = completed.reduce((a, s) => a + s.total, 0);
    const refundTotal = periodReturns.reduce((a, r) => a + r.refund_amount, 0);
    const netRevenue = grossRevenue - refundTotal;
    const salesCount = completed.length;
    const avgBasket = salesCount ? grossRevenue / salesCount : 0;

    // Umsatz pro Tag
    const perDayMap = new Map<string, number>();
    for (const s of completed) {
      const k = dateKey(new Date(s.created_at));
      perDayMap.set(k, (perDayMap.get(k) || 0) + s.total);
    }
    for (const r of periodReturns) {
      const k = dateKey(new Date(r.created_at));
      perDayMap.set(k, (perDayMap.get(k) || 0) - r.refund_amount);
    }
    const perDay = Array.from(perDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ day: k.slice(5), Umsatz: Math.round(v * 100) / 100 }));

    const dayCount = perDayMap.size || 1;
    const avgPerDay = netRevenue / dayCount;

    // Verkäufe pro Stunde
    const perHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}`, Verkäufe: 0 }));
    for (const s of completed) {
      const h = new Date(s.created_at).getHours();
      perHour[h].Verkäufe += 1;
    }

    // Zahlungsarten
    const byPayment: Record<string, number> = {};
    for (const s of completed) {
      byPayment[s.payment_method] = (byPayment[s.payment_method] || 0) + s.total;
    }

    // Rückgaben pro Produkt (Menge), zur Netto-Berechnung
    const returnedByProduct = new Map<string, number>();
    for (const r of periodReturns) {
      returnedByProduct.set(r.product_id, (returnedByProduct.get(r.product_id) || 0) + r.quantity);
    }

    // Top-Artikel
    const prodAgg = new Map<
      string,
      { name: string; qty: number; revenue: number; profit: number }
    >();
    for (const it of periodItems) {
      const cur = prodAgg.get(it.product_id) || {
        name: it.product_name,
        qty: 0,
        revenue: 0,
        profit: 0,
      };
      cur.qty += it.quantity;
      cur.revenue += it.unit_price * it.quantity;
      const ek = prodMap.get(it.product_id)?.purchase_price ?? 0;
      cur.profit += (it.unit_price - ek) * it.quantity;
      prodAgg.set(it.product_id, cur);
    }
    // Rückgaben vom Profit/Umsatz abziehen
    for (const [pid, qty] of returnedByProduct) {
      const agg = prodAgg.get(pid);
      const prod = prodMap.get(pid);
      if (agg && prod) {
        agg.qty -= qty;
        agg.revenue -= prod.selling_price * qty;
        agg.profit -= (prod.selling_price - prod.purchase_price) * qty;
      }
    }
    const topProducts = Array.from(prodAgg.values())
      .filter((p) => p.qty > 0)
      .sort((a, b) => b.revenue - a.revenue);

    const totalProfit = topProducts.reduce((a, p) => a + p.profit, 0);

    return {
      grossRevenue,
      netRevenue,
      salesCount,
      avgBasket,
      avgPerDay,
      perDay,
      perHour,
      byPayment,
      topProducts,
      totalProfit,
      cancelled: { count: cancelled.length, amount: cancelled.reduce((a, s) => a + s.total, 0) },
      returns: { count: periodReturns.length, amount: refundTotal },
    };
  }, [sales, items, returns, products, from]);

  return (
    <div>
      <PageHeader
        title="Analyse"
        action={
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  period === p.key ? 'bg-white text-accent shadow-sm' : 'text-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Nettoumsatz" value={eur(data.netRevenue)} hint="abzgl. Rückgaben" />
          <Kpi label="Anzahl Verkäufe" value={String(data.salesCount)} />
          <Kpi label="Ø Warenkorb" value={eur(data.avgBasket)} />
          <Kpi label="Ø pro Tag" value={eur(data.avgPerDay)} />
        </div>

        {/* Gewinn + Rückgaben/Stornos */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Kpi label="Gewinn-Schätzung" value={eur(data.totalProfit)} hint="(VK − EK) × Menge" />
          <Kpi
            label="Rückgaben"
            value={`${data.returns.count}`}
            hint={`${eur(data.returns.amount)} erstattet`}
          />
          <Kpi
            label="Stornos"
            value={`${data.cancelled.count}`}
            hint={`${eur(data.cancelled.amount)} storniert`}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Umsatz pro Tag</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.perDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <Bar dataKey="Umsatz" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Verkäufe pro Stunde</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.perHour}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" fontSize={12} interval={1} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Verkäufe" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zahlungsarten + Top-Artikel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Nach Zahlungsart</h3>
            <div className="space-y-2">
              {Object.keys(PAYMENT_LABELS).map((m) => {
                const val = data.byPayment[m] || 0;
                const max = Math.max(1, ...Object.values(data.byPayment));
                return (
                  <div key={m}>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{PAYMENT_LABELS[m]}</span>
                      <span className="font-medium">{eur(val)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${(val / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card overflow-x-auto p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Top-Artikel</h3>
            <table className="w-full min-w-[280px] text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2">Artikel</th>
                  <th className="pb-2 text-right">Menge</th>
                  <th className="pb-2 text-right">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.slice(0, 8).map((p) => (
                  <tr key={p.name} className="border-t border-gray-100">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-right">{p.qty}</td>
                    <td className="py-2 text-right font-medium">{eur(p.revenue)}</td>
                  </tr>
                ))}
                {data.topProducts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-gray-400">
                      Keine Verkäufe im Zeitraum.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Steuerauswertung: Phase 2 – bewusst nicht enthalten */}
        <p className="text-center text-xs text-gray-400">
          Keine Umsatzsteuer-Auswertung (Kleinunternehmer §19 UStG · Steuerauswertung folgt in
          Phase 2).
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
