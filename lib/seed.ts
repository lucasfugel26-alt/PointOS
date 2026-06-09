import { db } from './db';
import type { Product } from './types';
import { uuid, nowISO } from './utils';

interface SeedDef {
  name: string;
  category: string;
  purchase_price: number;
  selling_price: number;
  deposit: number;
  stock: number;
}

// Testdaten laut Master-Prompt. Über Einstellungen vollständig löschbar.
const SEED: SeedDef[] = [
  { name: 'Feuerzeuge', category: 'Bedarfsartikel', purchase_price: 0.2, selling_price: 1.5, deposit: 0, stock: 100 },
  { name: 'Wasser 0,5L', category: 'Bedarfsartikel', purchase_price: 0.35, selling_price: 2.0, deposit: 0.25, stock: 50 },
  { name: 'Ohrstöpsel', category: 'Bedarfsartikel', purchase_price: 0.2, selling_price: 2.0, deposit: 0, stock: 80 },
  { name: 'Regenponcho', category: 'Bedarfsartikel', purchase_price: 0.6, selling_price: 3.5, deposit: 0, stock: 40 },
  { name: 'Sonnenbrillen', category: 'Impulsprodukte', purchase_price: 1.2, selling_price: 8.0, deposit: 0, stock: 30 },
  { name: 'Powerbank', category: 'Komfortprodukte', purchase_price: 8.0, selling_price: 20.0, deposit: 0, stock: 15 },
  { name: 'Bauchtasche', category: 'Komfortprodukte', purchase_price: 5.0, selling_price: 15.0, deposit: 0, stock: 20 },
  { name: 'Cap', category: 'Impulsprodukte', purchase_price: 2.5, selling_price: 12.0, deposit: 0, stock: 25 },
];

function makeProduct(s: SeedDef): Product {
  const ts = nowISO();
  return {
    id: uuid(),
    name: s.name,
    category: s.category,
    image_url: null,
    purchase_price: s.purchase_price,
    selling_price: s.selling_price,
    vat_rate: null,
    deposit: s.deposit,
    stock: s.stock,
    min_stock: 10,
    type: 'sale',
    active: true,
    archived: false,
    is_seed: true,
    created_at: ts,
    updated_at: ts,
  };
}

// Legt Testdaten einmalig an (idempotent über meta-Flag).
export async function seedIfEmpty(): Promise<void> {
  const flag = await db.meta.get('seeded');
  const count = await db.products.count();
  if (flag || count > 0) return;
  const products = SEED.map(makeProduct);
  await db.products.bulkAdd(products);
  await db.meta.put({ key: 'seeded', value: true });
}
