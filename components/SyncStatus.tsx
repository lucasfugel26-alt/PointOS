'use client';

import { useEffect, useState } from 'react';
import { subscribeSync, flushOutbox, type SyncState } from '@/lib/sync';

export default function SyncStatus() {
  const [s, setS] = useState<SyncState | null>(null);

  useEffect(() => subscribeSync(setS), []);

  if (!s) return null;

  const offline = !s.online;
  const hasPending = s.pending > 0;

  let dotColor = 'bg-emerald-400';
  let text = 'Online';
  if (offline) {
    dotColor = 'bg-amber-400';
    text = hasPending
      ? `Offline – ${s.pending} ${s.pending === 1 ? 'Vorgang wartet' : 'Vorgänge warten'} auf Sync`
      : 'Offline';
  } else if (s.syncing) {
    dotColor = 'bg-blue-400';
    text = 'Synchronisiere…';
  } else if (hasPending) {
    dotColor = 'bg-amber-400';
    text = `${s.pending} ${s.pending === 1 ? 'Vorgang wartet' : 'Vorgänge warten'} auf Sync`;
  }

  return (
    <button
      onClick={() => flushOutbox()}
      title={
        s.configured
          ? 'Klicken zum manuellen Synchronisieren'
          : 'Supabase nicht konfiguriert – Daten bleiben lokal'
      }
      className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/10"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor} ${
          s.syncing ? 'animate-pulse' : ''
        }`}
      />
      <span className="leading-tight">{text}</span>
    </button>
  );
}
