'use client';

import type { Sale, SaleItem } from '@/lib/types';
import { eur, formatDateTime, PAYMENT_LABELS } from '@/lib/utils';

export default function Receipt({
  sale,
  items,
}: {
  sale: Sale;
  items: SaleItem[];
}) {
  const goods = items.reduce((a, i) => a + i.unit_price * i.quantity, 0);

  return (
    <div className="receipt-print mx-auto max-w-sm font-mono text-sm text-gray-900">
      <div className="text-center">
        <div className="text-lg font-bold">PointOS</div>
        <div className="text-xs text-gray-600">Beleg / Quittung</div>
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="flex justify-between text-xs">
        <span>Beleg-Nr.</span>
        <span>#{sale.receipt_number}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span>Datum</span>
        <span>{formatDateTime(sale.created_at)}</span>
      </div>
      {sale.status === 'cancelled' && (
        <div className="mt-2 text-center font-bold text-red-600">STORNIERT</div>
      )}

      <div className="my-3 border-t border-dashed border-gray-400" />

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="pb-1">Artikel</th>
            <th className="pb-1 text-right">Menge</th>
            <th className="pb-1 text-right">Einzel</th>
            <th className="pb-1 text-right">Summe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className="py-0.5">{i.product_name}</td>
              <td className="py-0.5 text-right">{i.quantity}</td>
              <td className="py-0.5 text-right">{eur(i.unit_price)}</td>
              <td className="py-0.5 text-right">{eur(i.unit_price * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="flex justify-between">
        <span>Warenwert</span>
        <span>{eur(goods)}</span>
      </div>
      {sale.total_deposit > 0 && (
        <div className="flex justify-between">
          <span>Pfand</span>
          <span>{eur(sale.total_deposit)}</span>
        </div>
      )}
      <div className="mt-1 flex justify-between text-base font-bold">
        <span>Endsumme</span>
        <span>{eur(sale.total)}</span>
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="flex justify-between text-xs">
        <span>Zahlungsart</span>
        <span>{PAYMENT_LABELS[sale.payment_method]}</span>
      </div>
      {sale.payment_method === 'cash' && sale.cash_given != null && (
        <>
          <div className="flex justify-between text-xs">
            <span>Gegeben</span>
            <span>{eur(sale.cash_given)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Rückgeld</span>
            <span>{eur(sale.cash_change ?? 0)}</span>
          </div>
        </>
      )}

      <div className="my-3 border-t border-dashed border-gray-400" />

      <p className="text-center text-[10px] leading-tight text-gray-600">
        Kein Ausweis der Umsatzsteuer gemäß §19 UStG (Kleinunternehmerregelung).
      </p>
      <p className="mt-2 text-center text-[10px] text-gray-400">
        Vielen Dank für Ihren Einkauf!
      </p>
    </div>
  );
}
