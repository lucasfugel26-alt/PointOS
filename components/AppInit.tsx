'use client';

import { useEffect } from 'react';
import { seedIfEmpty } from '@/lib/seed';
import { initSync, pullProducts } from '@/lib/sync';

// Initialisiert beim ersten Render: Service Worker, Testdaten, Sync.
export default function AppInit() {
  useEffect(() => {
    // Service Worker registrieren (App-Shell-Caching für Offline-Start)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ignorieren – App läuft auch ohne SW */
      });
    }

    (async () => {
      // Erst vom Server ziehen (falls konfiguriert & online), dann ggf. seeden
      await pullProducts().catch(() => {});
      await seedIfEmpty().catch(() => {});
      initSync();
    })();
  }, []);

  return null;
}
