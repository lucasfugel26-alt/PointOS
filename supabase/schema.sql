-- ============================================================
-- PointOS – Supabase Schema (Phase 1)
-- ============================================================
-- Hinweis zur Compliance (KassenSichV / GoBD):
-- Verkäufe sind append-only. Stornos und Rückgaben werden als
-- separate Datensätze geführt; abgeschlossene Verkäufe werden
-- nicht gelöscht oder überschrieben (nur status -> 'cancelled').
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Produkte ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  image_url text,
  purchase_price numeric default 0,   -- EK
  selling_price numeric default 0,    -- VK
  vat_rate numeric,                   -- Phase 2: USt.-Satz; Phase 1 null
  deposit numeric default 0,          -- Pfand in €, 0 = kein Pfand
  stock integer default 0,
  min_stock integer default 0,
  type text default 'sale',           -- 'sale' | 'rental' (Phase 2)
  active boolean default true,
  archived boolean default false,
  is_seed boolean default false,      -- Testdaten-Markierung
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Verkaufstransaktionen ----------
create table if not exists sales (
  id uuid primary key,                -- client-seitig erzeugt (Offline-Idempotenz)
  receipt_number integer,             -- fortlaufende Belegnummer
  total numeric,                      -- Gesamtbetrag inkl. Pfand
  total_deposit numeric default 0,    -- Pfand gesamt
  payment_method text,                -- 'cash' | 'card' | 'paypal' | 'other'
  cash_given numeric,                 -- bei Barzahlung: gegeben
  cash_change numeric,                -- bei Barzahlung: Rückgeld
  status text default 'completed',    -- 'completed' | 'cancelled'
  cancelled_at timestamptz,
  location_id uuid,                   -- nullable, Phase 2
  employee_id uuid,                   -- nullable, Phase 2
  synced boolean default true,
  created_at timestamptz default now()
);

-- ---------- Verkaufspositionen ----------
create table if not exists sale_items (
  id uuid primary key,
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id),
  product_name text,                  -- Name eingefroren
  quantity integer,
  unit_price numeric,                 -- VK zum Verkaufszeitpunkt (einfrieren)
  deposit numeric default 0,          -- Pfand pro Einheit
  created_at timestamptz default now()
);

-- ---------- Rückgaben ----------
create table if not exists returns (
  id uuid primary key,
  sale_id uuid references sales(id),
  sale_item_id uuid references sale_items(id),
  product_id uuid references products(id),
  quantity integer,                   -- zurückgegebene Menge
  refund_amount numeric,              -- erstatteter Betrag
  reason text,
  created_at timestamptz default now()
);

-- ---------- Tagesabschlüsse ----------
create table if not exists daily_closings (
  id uuid primary key,
  closing_date date,
  total_sales numeric,                -- Umsatz gesamt
  sales_count integer default 0,
  cash_expected numeric,              -- Soll-Bargeld
  cash_counted numeric,               -- Ist-Bargeld (manuell)
  difference numeric,                 -- Ist − Soll
  by_payment jsonb,                   -- Aufschlüsselung nach Zahlungsart
  notes text,
  location_id uuid,                   -- nullable, Phase 2
  created_at timestamptz default now()
);

-- ---------- Indizes ----------
create index if not exists idx_sales_created_at on sales (created_at);
create index if not exists idx_sale_items_sale_id on sale_items (sale_id);
create index if not exists idx_returns_sale_id on returns (sale_id);

-- ============================================================
-- Row Level Security
-- ============================================================
-- Phase 1: Login optional. Policies erlauben Zugriff sowohl für
-- anon (Standbetrieb ohne Login) als auch authenticated.
-- In Phase 2 (Mitarbeiter-Tracking) verschärfen.
-- ============================================================

alter table products       enable row level security;
alter table sales          enable row level security;
alter table sale_items     enable row level security;
alter table returns        enable row level security;
alter table daily_closings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['products','sales','sale_items','returns','daily_closings']
  loop
    execute format('drop policy if exists "pointos_all_%1$s" on %1$s;', t);
    execute format(
      'create policy "pointos_all_%1$s" on %1$s for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
