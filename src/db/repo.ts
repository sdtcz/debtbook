import { newId } from '../lib/id';
import type {
  Customer,
  CustomerBalance,
  Entitlement,
  Entry,
  EntryType,
  ShopProfile,
} from '../lib/types';
import { enqueueOutbox } from './outbox';
import { getDb } from './schema';

/* ── Shop ─────────────────────────────────────────────── */

export async function getShop(): Promise<ShopProfile | undefined> {
  const db = await getDb();
  return db.get('shop', 'shop');
}

export async function saveShop(name: string): Promise<ShopProfile> {
  const db = await getDb();
  const existing = await db.get('shop', 'shop');
  const now = Date.now();
  const shop: ShopProfile = existing
    ? { ...existing, name: name.trim(), updatedAt: now }
    : {
        id: 'shop',
        name: name.trim(),
        currency: 'NGN',
        createdAt: now,
        updatedAt: now,
      };
  await db.put('shop', shop);
  await enqueueOutbox('shop', shop.id, 'upsert', shop);
  return shop;
}

export async function updateShopFields(
  patch: Partial<
    Pick<
      ShopProfile,
      | 'pinHash'
      | 'pinSalt'
      | 'entitlement'
      | 'name'
      | 'cloudBackupEnabled'
      | 'lastCloudBackupAt'
      | 'cloudBackupId'
    >
  > & { clearPin?: boolean },
): Promise<ShopProfile> {
  const db = await getDb();
  const existing = await db.get('shop', 'shop');
  if (!existing) throw new Error('Shop not set up');
  const now = Date.now();
  const { clearPin: shouldClear, ...rest } = patch;
  const shop: ShopProfile = { ...existing, ...rest, updatedAt: now };
  if (shouldClear) {
    delete shop.pinHash;
    delete shop.pinSalt;
  }
  await db.put('shop', shop);
  await enqueueOutbox('shop', shop.id, 'upsert', shop);
  return shop;
}

export async function setPin(hash: string, salt: string): Promise<ShopProfile> {
  return updateShopFields({ pinHash: hash, pinSalt: salt });
}

export async function clearPin(): Promise<ShopProfile> {
  return updateShopFields({ clearPin: true });
}

export async function setEntitlement(entitlement: Entitlement): Promise<ShopProfile> {
  return updateShopFields({ entitlement });
}

export async function setCloudBackupMeta(meta: {
  cloudBackupEnabled?: boolean;
  lastCloudBackupAt?: number;
  cloudBackupId?: string;
}): Promise<ShopProfile> {
  return updateShopFields(meta);
}

/* ── Customers ────────────────────────────────────────── */

export async function listCustomers(): Promise<Customer[]> {
  const db = await getDb();
  const all = await db.getAll('customers');
  return all
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  const db = await getDb();
  const c = await db.get('customers', id);
  if (!c || c.deletedAt) return undefined;
  return c;
}

export async function upsertCustomer(input: {
  id?: string;
  name: string;
  phone?: string;
  note?: string;
  dueAt?: number | null;
}): Promise<Customer> {
  const db = await getDb();
  const now = Date.now();
  const name = input.name.trim();
  if (!name) throw new Error('Customer name is required');

  let customer: Customer;
  if (input.id) {
    const existing = await db.get('customers', input.id);
    if (!existing || existing.deletedAt) throw new Error('Customer not found');
    customer = {
      ...existing,
      name,
      phone: input.phone?.trim() || undefined,
      note: input.note?.trim() || undefined,
      updatedAt: now,
    };
    if (input.dueAt === null) {
      delete customer.dueAt;
    } else if (input.dueAt !== undefined) {
      customer.dueAt = input.dueAt;
    }
  } else {
    customer = {
      id: newId(),
      name,
      phone: input.phone?.trim() || undefined,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    if (input.dueAt) customer.dueAt = input.dueAt;
  }
  await db.put('customers', customer);
  await enqueueOutbox('customer', customer.id, 'upsert', customer);
  return customer;
}

export async function softDeleteCustomer(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('customers', id);
  if (!existing) return;
  const now = Date.now();
  const customer: Customer = { ...existing, deletedAt: now, updatedAt: now };
  await db.put('customers', customer);
  await enqueueOutbox('customer', id, 'delete', customer);
}

/* ── Entries ──────────────────────────────────────────── */

export async function listEntriesForCustomer(customerId: string): Promise<Entry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('entries', 'by-customer', customerId);
  return all
    .filter((e) => !e.deletedAt)
    .sort((a, b) => b.occurredAt - a.occurredAt);
}

export async function listAllEntries(): Promise<Entry[]> {
  const db = await getDb();
  return (await db.getAll('entries')).filter((e) => !e.deletedAt);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await getDb();
  const e = await db.get('entries', id);
  if (!e || e.deletedAt) return undefined;
  return e;
}

export async function addEntry(input: {
  customerId: string;
  type: EntryType;
  amountKobo: number;
  note?: string;
  occurredAt?: number;
}): Promise<Entry> {
  if (input.amountKobo <= 0) throw new Error('Amount must be greater than zero');
  const customer = await getCustomer(input.customerId);
  if (!customer) throw new Error('Customer not found');

  const db = await getDb();
  const now = Date.now();
  const entry: Entry = {
    id: newId(),
    customerId: input.customerId,
    type: input.type,
    amountKobo: input.amountKobo,
    note: input.note?.trim() || undefined,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('entries', entry);
  await enqueueOutbox('entry', entry.id, 'upsert', entry);
  return entry;
}

export async function softDeleteEntry(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('entries', id);
  if (!existing) return;
  const now = Date.now();
  const entry: Entry = { ...existing, deletedAt: now, updatedAt: now };
  await db.put('entries', entry);
  await enqueueOutbox('entry', id, 'delete', entry);
}

/**
 * Balance = sum(credits) - sum(payments).
 * Negative means the shop owes the customer (overpay allowed).
 */
export function computeBalance(entries: Entry[]): {
  balanceKobo: number;
  creditTotalKobo: number;
  paymentTotalKobo: number;
} {
  let creditTotalKobo = 0;
  let paymentTotalKobo = 0;
  for (const e of entries) {
    if (e.deletedAt) continue;
    if (e.type === 'credit') creditTotalKobo += e.amountKobo;
    else paymentTotalKobo += e.amountKobo;
  }
  return {
    balanceKobo: creditTotalKobo - paymentTotalKobo,
    creditTotalKobo,
    paymentTotalKobo,
  };
}

export async function getCustomerBalance(customerId: string): Promise<{
  balanceKobo: number;
  creditTotalKobo: number;
  paymentTotalKobo: number;
  entries: Entry[];
}> {
  const entries = await listEntriesForCustomer(customerId);
  return { ...computeBalance(entries), entries };
}

export function isOverdue(customer: Customer, balanceKobo: number, now = Date.now()): boolean {
  return Boolean(customer.dueAt && customer.dueAt < now && balanceKobo > 0);
}

export async function getDashboardBalances(): Promise<{
  totalOutstandingKobo: number;
  customers: CustomerBalance[];
}> {
  const customers = await listCustomers();
  const db = await getDb();
  const results: CustomerBalance[] = [];
  let totalOutstandingKobo = 0;
  const now = Date.now();

  for (const customer of customers) {
    const all = await db.getAllFromIndex('entries', 'by-customer', customer.id);
    const active = all.filter((e) => !e.deletedAt);
    const { balanceKobo, creditTotalKobo, paymentTotalKobo } =
      computeBalance(active);
    results.push({
      customer,
      balanceKobo,
      creditTotalKobo,
      paymentTotalKobo,
      entryCount: active.length,
    });
    if (balanceKobo > 0) totalOutstandingKobo += balanceKobo;
  }

  // Overdue first, then highest debt
  results.sort((a, b) => {
    const aOver = isOverdue(a.customer, a.balanceKobo, now) ? 1 : 0;
    const bOver = isOverdue(b.customer, b.balanceKobo, now) ? 1 : 0;
    if (bOver !== aOver) return bOver - aOver;
    return b.balanceKobo - a.balanceKobo;
  });
  return { totalOutstandingKobo, customers: results };
}

export function searchCustomers(
  customers: CustomerBalance[],
  query: string,
): CustomerBalance[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  return customers.filter((c) => {
    const name = c.customer.name.toLowerCase();
    const phone = (c.customer.phone || '').toLowerCase();
    const note = (c.customer.note || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || note.includes(q);
  });
}

/** Most recent entry for a customer within the last `withinMs` (default 10 min). */
export async function getRecentEntryForUndo(
  customerId: string,
  withinMs = 10 * 60 * 1000,
): Promise<Entry | undefined> {
  const entries = await listEntriesForCustomer(customerId);
  const latest = entries[0];
  if (!latest) return undefined;
  if (Date.now() - latest.createdAt > withinMs) return undefined;
  return latest;
}
