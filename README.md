# PointOS

Offline-fähiges Kassen- & Lagersystem (POS) für Festivals und Veranstaltungen.
Schnell, touch-freundlich und voll bedienbar auch ohne Netz – Verkäufe werden
lokal gepuffert und automatisch synchronisiert, sobald wieder Internet da ist.

> **Phase 1.** Kein zertifiziertes Kassensystem (KassenSichV/TSE, GoBD). Betreiber
> als Kleinunternehmer nach §19 UStG (kein USt.-Ausweis). Vor produktivem Einsatz
> Rücksprache mit Steuerberater erforderlich.

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** – dunkle Sidebar, helle Content-Fläche
- **Dexie.js** (IndexedDB) – lokale Quelle der Wahrheit / Offline-Puffer
- **Supabase** (PostgreSQL) – optionaler Server-Sync
- **Recharts** – Analyse-Diagramme
- **PWA** – Service Worker für App-Shell-Caching

## Module

| Modul | Route | Funktion |
|-------|-------|----------|
| Verkauf (POS) | `/pos` | Kachelansicht, Warenkorb, Pfand, Bar-Rückgeld, Beleg, Schnell-Storno |
| Lager | `/inventory` | Produkte anlegen/bearbeiten/löschen/archivieren, Bestandswarnung |
| Verlauf | `/history` | Verkaufshistorie, Storno, Teil-/Vollrückgaben |
| Tagesabschluss | `/closing` | Kassensturz: Soll/Ist-Bargeld, Differenz |
| Analyse | `/analytics` | KPIs, Umsatz/Tag, Verkäufe/Stunde, Top-Artikel, Gewinn |
| Einstellungen | `/settings` | Testdaten löschen, Sync-Status |

## Setup

```bash
npm install
cp .env.example .env.local   # optional – nur für Supabase-Sync
npm run dev
```

App läuft auf http://localhost:3000 (Redirect → `/pos`).

### Offline-First

PointOS funktioniert **ohne jede Konfiguration** komplett lokal (IndexedDB).
Beim ersten Start werden Beispielprodukte angelegt (über *Einstellungen →
Testdaten löschen* entfernbar).

### Supabase-Sync (optional)

1. Supabase-Projekt anlegen.
2. `supabase/schema.sql` im SQL-Editor ausführen (Tabellen + RLS).
3. In `.env.local` setzen:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

Verkäufe, Stornos, Rückgaben und Produktänderungen laufen über eine **Outbox-Queue**
mit client-seitigen UUIDs (idempotente Doppel-Sync-Sicherheit) und werden bei
verfügbarem Netz automatisch zu Supabase gepusht.

## Offline-Architektur

- **Lokale Quelle der Wahrheit:** Alle Lese-/Schreibvorgänge gehen gegen IndexedDB
  → die UI ist immer sofort und offline bedienbar (optimistische Updates, Bestand
  wird lokal sofort reduziert).
- **Outbox-Queue:** Jede mutierende Aktion erzeugt einen Outbox-Eintrag, der bei
  Netz an Supabase gesendet wird. Erst nach Erfolg wird er gelöscht (idempotent).
- **Append-only:** Verkäufe werden nie überschrieben oder gelöscht. Stornos
  (`status = 'cancelled'`) und Rückgaben sind eigene Datensätze → Compliance-freundlich.
- **Status-Indikator:** Sidebar zeigt *Online / Offline – X Vorgänge warten auf Sync*.

## Deployment (Vercel)

1. Repo mit Vercel verbinden.
2. Env-Variablen `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` setzen
   (oder weglassen für rein lokalen Betrieb).
3. Auto-Deploy bei Push.

## Phase 2 (vorbereitet, noch nicht gebaut)

- Mehrere Standorte (`location_id`), Mitarbeiter-Tracking (`employee_id`) – im Schema vorhanden
- Vermietung (`products.type = 'rental'`)
- USt.-Auswertung (`vat_rate` im Schema; UI in Phase 1 ausgeblendet)
