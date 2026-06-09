'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { deleteSeedData } from '@/lib/repository';
import { flushOutbox, pullProducts, subscribeSync, type SyncState } from '@/lib/sync';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';

export default function SettingsPage() {
  const seedCount = useLiveQuery(
    async () => (await db.products.toArray()).filter((p) => p.is_seed).length,
    [],
    0
  );
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);

  useEffect(() => subscribeSync(setSync), []);

  async function handleDeleteSeed() {
    const n = await deleteSeedData();
    setConfirm(false);
    setMsg(`${n} Testdaten-Produkt(e) gelöscht.`);
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div>
      <PageHeader title="Einstellungen" />

      <div className="max-w-2xl space-y-6 p-6">
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

        {/* Testdaten */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900">Testdaten</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beim ersten Start werden Beispielprodukte angelegt. Hier kannst du sie vollständig
            entfernen. Aktuell {seedCount} Testdaten-Produkt(e).
          </p>
          <button
            onClick={() => setConfirm(true)}
            disabled={!seedCount}
            className="btn-danger mt-3 text-sm disabled:opacity-40"
          >
            Testdaten löschen
          </button>
          {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
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

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Testdaten löschen?" maxWidth="max-w-sm">
        <p className="text-sm text-gray-600">
          Alle als Testdaten markierten Produkte werden gelöscht. Verkaufshistorie bleibt erhalten.
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={handleDeleteSeed} className="btn-danger flex-1">
            Löschen
          </button>
          <button onClick={() => setConfirm(false)} className="btn-secondary flex-1">
            Abbrechen
          </button>
        </div>
      </Modal>
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
