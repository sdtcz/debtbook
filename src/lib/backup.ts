import type { BackupPayload, Customer, Entry, ShopProfile, Supplier, SupplierEntry } from './types';
import { getDb, resetDbCache } from '../db/schema';
import { enqueueOutbox } from '../db/outbox';

export async function exportBackup(): Promise<BackupPayload> {
  const db = await getDb();
  const shop = (await db.get('shop', 'shop')) || null;
  const customers = await db.getAll('customers');
  const entries = await db.getAll('entries');
  const suppliers = await db.getAll('suppliers');
  const supplierEntries = await db.getAll('supplierEntries');
  return {
    version: 1,
    exportedAt: Date.now(),
    shop,
    customers,
    entries,
    suppliers,
    supplierEntries,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isBackupPayload(data: unknown): data is BackupPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as BackupPayload;
  return (
    d.version === 1 &&
    Array.isArray(d.customers) &&
    Array.isArray(d.entries) &&
    (d.suppliers === undefined || Array.isArray(d.suppliers)) &&
    (d.supplierEntries === undefined || Array.isArray(d.supplierEntries))
  );
}

/** Replace local shop/customers/entries with imported backup (confirm first). */
export async function importBackup(data: unknown): Promise<{
  customers: number;
  entries: number;
  suppliers: number;
  supplierEntries: number;
  /** False when the backup predates suppliers (local suppliers were kept). */
  suppliersReplaced: boolean;
}> {
  if (!isBackupPayload(data)) {
    throw new Error('Invalid backup file');
  }
  const db = await getDb();
  // Older backups have no supplier fields: keep this phone's suppliers as-is
  // rather than wiping them (nothing is lost on restore or cloud pull).
  const hasSuppliers = Array.isArray(data.suppliers) || Array.isArray(data.supplierEntries);
  const tx = db.transaction(
    ['shop', 'customers', 'entries', 'suppliers', 'supplierEntries'],
    'readwrite',
  );

  // Clear existing
  await tx.objectStore('customers').clear();
  await tx.objectStore('entries').clear();
  const existingShop = await tx.objectStore('shop').get('shop');
  if (existingShop) await tx.objectStore('shop').delete('shop');

  if (data.shop) {
    const shop: ShopProfile = { ...data.shop, id: 'shop' };
    // Restoring an older backup must not hand out a fresh free trial.
    if (existingShop?.trial && (!shop.trial || shop.trial.endsAt > existingShop.trial.endsAt)) {
      shop.trial = existingShop.trial;
    }
    await tx.objectStore('shop').put(shop);
  }

  for (const c of data.customers as Customer[]) {
    if (c?.id) await tx.objectStore('customers').put(c);
  }
  for (const e of data.entries as Entry[]) {
    if (e?.id) await tx.objectStore('entries').put(e);
  }
  if (hasSuppliers) {
    await tx.objectStore('suppliers').clear();
    await tx.objectStore('supplierEntries').clear();
    for (const s of (data.suppliers || []) as Supplier[]) {
      if (s?.id) await tx.objectStore('suppliers').put(s);
    }
    for (const e of (data.supplierEntries || []) as SupplierEntry[]) {
      if (e?.id && e.supplierId) await tx.objectStore('supplierEntries').put(e);
    }
  }
  await tx.done;

  if (data.shop) {
    await enqueueOutbox('shop', 'shop', 'upsert', data.shop);
  }
  return {
    customers: data.customers.length,
    entries: data.entries.length,
    suppliers: data.suppliers?.length ?? 0,
    supplierEntries: data.supplierEntries?.length ?? 0,
    suppliersReplaced: hasSuppliers,
  };
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}

export { resetDbCache };
