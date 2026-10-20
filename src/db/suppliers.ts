/** Supplier ledger ("I owe") — separate stores from customers. */
import { newId } from '../lib/id';
import type { Supplier, SupplierBalance, SupplierEntry, SupplierEntryType } from '../lib/types';
import { enqueueOutbox } from './outbox';
import { touchLocalChange } from './repo';
import { getDb } from './schema';

export async function listSuppliers(): Promise<Supplier[]> {
  const db = await getDb();
  return (await db.getAll('suppliers'))
    .filter((s) => !s.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export async function getSupplier(id: string): Promise<Supplier | undefined> {
  const db = await getDb();
  const s = await db.get('suppliers', id);
  return s && !s.deletedAt ? s : undefined;
}

export async function upsertSupplier(input: {
  id?: string;
  name: string;
  phone?: string;
  note?: string;
}): Promise<Supplier> {
  const name = input.name.trim();
  if (!name) throw new Error('Supplier name is required');
  const db = await getDb();
  const now = Date.now();
  let supplier: Supplier;
  if (input.id) {
    const existing = await db.get('suppliers', input.id);
    if (!existing || existing.deletedAt) throw new Error('Supplier not found');
    supplier = {
      ...existing,
      name,
      phone: input.phone?.trim() || undefined,
      note: input.note?.trim() || undefined,
      updatedAt: now,
    };
  } else {
    supplier = {
      id: newId(),
      name,
      phone: input.phone?.trim() || undefined,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }
  await db.put('suppliers', supplier);
  await enqueueOutbox('supplier', supplier.id, 'upsert', supplier);
  await touchLocalChange();
  return supplier;
}

export async function softDeleteSupplier(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('suppliers', id);
  if (!existing) return;
  const now = Date.now();
  const s: Supplier = { ...existing, deletedAt: now, updatedAt: now };
  await db.put('suppliers', s);
  await enqueueOutbox('supplier', id, 'delete', s);
  await touchLocalChange();
}

export async function restoreSupplier(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('suppliers', id);
  if (!existing?.deletedAt) return;
  const { deletedAt: _gone, ...rest } = existing;
  void _gone;
  const s: Supplier = { ...rest, updatedAt: Date.now() };
  await db.put('suppliers', s);
  await enqueueOutbox('supplier', id, 'upsert', s);
  await touchLocalChange();
}

export async function listSupplierEntries(supplierId: string): Promise<SupplierEntry[]> {
  const db = await getDb();
  return (await db.getAllFromIndex('supplierEntries', 'by-supplier', supplierId))
    .filter((e) => !e.deletedAt)
    .sort((a, b) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt);
}

export async function listAllSupplierEntries(): Promise<SupplierEntry[]> {
  const db = await getDb();
  return (await db.getAll('supplierEntries')).filter((e) => !e.deletedAt);
}

export async function addSupplierEntry(input: {
  supplierId: string;
  type: SupplierEntryType;
  amountKobo: number;
  note?: string;
  occurredAt?: number;
}): Promise<SupplierEntry> {
  if (!(input.amountKobo > 0)) throw new Error('Amount must be greater than zero');
  if (!(await getSupplier(input.supplierId))) throw new Error('Supplier not found');
  const db = await getDb();
  const now = Date.now();
  const entry: SupplierEntry = {
    id: newId(),
    supplierId: input.supplierId,
    type: input.type,
    amountKobo: Math.round(input.amountKobo),
    note: input.note?.trim() || undefined,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('supplierEntries', entry);
  await enqueueOutbox('supplierEntry', entry.id, 'upsert', entry);
  await touchLocalChange();
  return entry;
}

export async function softDeleteSupplierEntry(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('supplierEntries', id);
  if (!existing) return;
  const now = Date.now();
  const e: SupplierEntry = { ...existing, deletedAt: now, updatedAt: now };
  await db.put('supplierEntries', e);
  await enqueueOutbox('supplierEntry', id, 'delete', e);
  await touchLocalChange();
}

/** Balance I owe = purchases on credit − payments made. */
export function computeSupplierBalance(entries: SupplierEntry[]): {
  balanceKobo: number;
  purchaseTotalKobo: number;
  paymentTotalKobo: number;
} {
  let purchaseTotalKobo = 0;
  let paymentTotalKobo = 0;
  for (const e of entries) {
    if (e.deletedAt) continue;
    if (e.type === 'purchase') purchaseTotalKobo += e.amountKobo;
    else paymentTotalKobo += e.amountKobo;
  }
  return { balanceKobo: purchaseTotalKobo - paymentTotalKobo, purchaseTotalKobo, paymentTotalKobo };
}

/** Per-supplier balances (biggest debt first) and the "I owe suppliers" total. */
export function summarizeSuppliers(
  suppliers: Supplier[],
  entries: SupplierEntry[],
): { totalIOweKobo: number; suppliers: SupplierBalance[] } {
  const live = suppliers.filter((s) => !s.deletedAt);
  const byId = new Map<string, SupplierEntry[]>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const list = byId.get(e.supplierId);
    if (list) list.push(e);
    else byId.set(e.supplierId, [e]);
  }
  let totalIOweKobo = 0;
  const rows: SupplierBalance[] = live.map((supplier) => {
    const es = byId.get(supplier.id) || [];
    const b = computeSupplierBalance(es);
    if (b.balanceKobo > 0) totalIOweKobo += b.balanceKobo;
    return { supplier, ...b, entryCount: es.length };
  });
  rows.sort((a, b) => b.balanceKobo - a.balanceKobo || a.supplier.name.localeCompare(b.supplier.name));
  return { totalIOweKobo, suppliers: rows };
}

export async function getSupplierBalances(): Promise<{ totalIOweKobo: number; suppliers: SupplierBalance[] }> {
  const db = await getDb();
  const [s, e] = await Promise.all([db.getAll('suppliers'), db.getAll('supplierEntries')]);
  return summarizeSuppliers(s, e);
}
