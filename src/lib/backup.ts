import type { BackupPayload, Customer, Entry, ShopProfile } from './types';
import { getDb, resetDbCache } from '../db/schema';
import { enqueueOutbox } from '../db/outbox';

export async function exportBackup(): Promise<BackupPayload> {
  const db = await getDb();
  const shop = (await db.get('shop', 'shop')) || null;
  const customers = await db.getAll('customers');
  const entries = await db.getAll('entries');
  return {
    version: 1,
    exportedAt: Date.now(),
    shop,
    customers,
    entries,
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
    Array.isArray(d.entries)
  );
}

/** Replace local shop/customers/entries with imported backup (confirm first). */
export async function importBackup(data: unknown): Promise<{
  customers: number;
  entries: number;
}> {
  if (!isBackupPayload(data)) {
    throw new Error('Invalid backup file');
  }
  const db = await getDb();
  const tx = db.transaction(['shop', 'customers', 'entries'], 'readwrite');

  // Clear existing
  await tx.objectStore('customers').clear();
  await tx.objectStore('entries').clear();
  const existingShop = await tx.objectStore('shop').get('shop');
  if (existingShop) await tx.objectStore('shop').delete('shop');

  if (data.shop) {
    const shop: ShopProfile = { ...data.shop, id: 'shop' };
    await tx.objectStore('shop').put(shop);
  }

  for (const c of data.customers as Customer[]) {
    if (c?.id) await tx.objectStore('customers').put(c);
  }
  for (const e of data.entries as Entry[]) {
    if (e?.id) await tx.objectStore('entries').put(e);
  }
  await tx.done;

  if (data.shop) {
    await enqueueOutbox('shop', 'shop', 'upsert', data.shop);
  }
  return { customers: data.customers.length, entries: data.entries.length };
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}

export { resetDbCache };
