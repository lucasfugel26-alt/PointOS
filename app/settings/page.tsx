'use client';

import { useEffect, useState } from 'react';
import { flushOutbox, pullProducts, subscribeSync, type SyncState } from '@/lib/sync';
import PageHeader from '@/components/PageHeader';

export default function SettingsPage() {
  const [sync, setSync] = useState<SyncState | null>(null);

  useEffect(() => subscribeSync(setSync), []);

  return (
    <div>
      <PageHeader title="Einstellungen" />

      <div className="max-w-2xl space-y-6 p-4 sm:p-6">
        {/* Sync */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900">Synchronisation</h2>
          <div className="mt-3 space-y-1 text-sm">
            <Row
              label="Supabase"
              value={sync?.configured ? 'Konfiguriert' : 'Nicht konfiguriert (rein lokal)'}
            />
            <Row label="Verbindung" value={sync?.online ? 'Online' : 'Offline'} />
            <Row label="Ausstehende Vorgänge" value={String(sync?.pending ?? 0)} />
            <Row
              label="Letzte Synchronisation"
              value={sync?.lastSync ? new Date(sync.lastSync).toLocaleString('de-DE') : '–'}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => flushOutbox()} className="btn-secondary text-sm">
              Jetzt synchronisieren
            </button>
            <button onClick={() => pullProducts()} className="btn-ghost text-sm">
              Produkte vom Server laden
            </button>
          </div>
          {!sync?.configured && (
            <p className="mt-3 text-xs text-gray-400">
              Ohne Supabase-Konfiguration werden alle Daten lokal (IndexedDB) gespeichert. Setze
              NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY für Server-Sync.
            </p>
          )}
        </div>

        {/* Rechtliches */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900">Rechtlicher Hinweis</h2>
          <p className="mt-2 text-sm text-gray-500">
            PointOS ist in Phase 1 kein zertifiziertes Kassensystem (KassenSichV / TSE, GoBD).
            Verkäufe werden unveränderlich gespeichert; Stornos und Rückgaben als separate
            Datensätze. Vor produktivem Einsatz mit echten Kunden ist die Rücksprache mit einem
            Steuerberater erforderlich. Betreiber als Kleinunternehmer nach §19 UStG (kein
            USt.-Ausweis).
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
