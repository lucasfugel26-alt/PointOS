'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  computeDaySummary,
  saveDailyClosing,
  listClosings,
} from '@/lib/repository';
import { db } from '@/lib/db';
import type { PaymentMethod } from '@/lib/types';
import { eur, PAYMENT_LABELS, formatDateTime } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';

export default function ClosingPage() {
  const [summary, setSummary] = useState<{
    salesCount: number;
    totalSales: number;
    byPayment: Record<PaymentMethod, number>;
    cashExpected: number;
  } | null>(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  // neu berechnen, sobald sich Verkäufe ändern
  const salesTick = useLiveQuery(() => db.sales.count(), [], 0);
  const returnsTick = useLiveQuery(() => db.returns.count(), [], 0);
  const closings = useLiveQuery(() => listClosings(), [], []);

  useEffect(() => {
    computeDaySummary(new Date()).then(setSummary);
  }, [salesTick, returnsTick]);

  const countedNum = parseFloat(counted.replace(',', '.'));
  const diff =
    summary && !isNaN(countedNum) ? Math.round((countedNum - summary.cashExpected) * 100) / 100 : null;

  async function handleSave() {
    if (!summary) return;
    await saveDailyClosing({
      day: new Date(),
      cashCounted: isNaN(countedNum) ? 0 : countedNum,
      notes: notes || undefined,
    });
    setSaved(true);
    setCounted('');
    setNotes('');
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <PageHeader
        title="Tagesabschluss"
        subtitle={new Date().toLocaleDateString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}
      />

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-2">
        {/* Übersicht */}
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Übersicht heute</h2>
          {summary && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Verkäufe" value={String(summary.salesCount)} />
                <Stat label="Umsatz gesamt" value={eur(summary.totalSales)} />
              </div>
              <div className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-sm">
                {(Object.keys(summary.byPayment) as PaymentMethod[]).map((m) => (
                  <div key={m} className="flex justify-between">
                    <span className="text-gray-500">{PAYMENT_LABELS[m]}</span>
                    <span className="font-medium">{eur(summary.byPayment[m])}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Kassensturz */}
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Kassensturz (Bargeld)</h2>
          {summary && (
            <>
              <div className="mb-4 rounded-lg bg-gray-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Soll-Bargeld (berechnet)</span>
                  <span className="font-semibold">{eur(summary.cashExpected)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Bar-Einnahmen inkl. Pfand abzüglich Bar-Rückgaben.
                </p>
              </div>

              <label className="label">Ist-Bargeld (gezählt)</label>
              <input
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0,00"
                className="input text-lg"
              />

              {diff !== null && (
                <div
                  className={`mt-3 rounded-lg p-3 text-center ${
                    Math.abs(diff) < 0.005 ? 'bg-emerald-50' : 'bg-red-50'
                  }`}
                >
                  <div className="text-sm text-gray-500">Differenz (Ist − Soll)</div>
                  <div
                    className={`text-2xl font-bold ${
                      Math.abs(diff) < 0.005 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {diff > 0 ? '+' : ''}
                    {eur(diff)}
                  </div>
                </div>
              )}

              <label className="label mt-4">Notiz (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z. B. Wechselgeld 50 € entnommen"
                className="input min-h-[80px]"
              />

              <button onClick={handleSave} className="btn-primary mt-4 w-full">
                Tagesabschluss speichern
              </button>
              {saved && (
                <p className="mt-2 text-center text-sm text-emerald-600">
                  Tagesabschluss gespeichert.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Archiv */}
      <div className="px-4 pb-8 sm:px-6">
        <h2 className="mb-3 font-semibold text-gray-900">Abgeschlossene Tage</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3 text-right">Verkäufe</th>
                <th className="px-4 py-3 text-right">Umsatz</th>
                <th className="px-4 py-3 text-right">Soll bar</th>
                <th className="px-4 py-3 text-right">Ist bar</th>
                <th className="px-4 py-3 text-right">Differenz</th>
                <th className="px-4 py-3">Notiz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(closings || []).map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.closing_date}</td>
                  <td className="px-4 py-3 text-right">{c.sales_count}</td>
                  <td className="px-4 py-3 text-right">{eur(c.total_sales)}</td>
                  <td className="px-4 py-3 text-right">{eur(c.cash_expected)}</td>
                  <td className="px-4 py-3 text-right">{eur(c.cash_counted)}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      Math.abs(c.difference) < 0.005 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {eur(c.difference)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.notes}</td>
                </tr>
              ))}
              {(closings || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Noch keine Tagesabschlüsse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
