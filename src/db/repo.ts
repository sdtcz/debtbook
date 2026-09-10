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
      | 'locale'
      | 'chaseReminderEnabled'
      | 'chaseReminderTime'
      | 'payBankName'
      | 'payAccountNumber'
      | 'payAccountName'
      | 'payLinkUrl'
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

export async function setShopLocale(locale: 'en' | 'ha' | 'yo'): Promise<ShopProfile | undefined> {
  const existing = await getShop();
  if (!existing) return undefined;
  return updateShopFields({ locale });
}

export async function setChaseReminderPrefs(prefs: {
  chaseReminderEnabled?: boolean;
  chaseReminderTime?: string;
}): Promise<ShopProfile | undefined> {
  const existing = await getShop();
  if (!existing) return undefined;
  return updateShopFields(prefs);
}

/** Save shop Pay-me bank / payment-link details (empty string clears). */
export async function setShopPayMe(details: {
  payBankName?: string;
  payAccountNumber?: string;
  payAccountName?: string;
  payLinkUrl?: string;
}): Promise<ShopProfile | undefined> {
  const db = await getDb();
  const existing = await db.get('shop', 'shop');
  if (!existing) return undefined;
  const next: ShopProfile = { ...existing, updatedAt: Date.now() };
  const apply = (
    key: 'payBankName' | 'payAccountNumber' | 'payAccountName' | 'payLinkUrl',
    raw?: string,
  ) => {
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  };
  apply('payBankName', details.payBankName);
  apply('payAccountNumber', details.payAccountNumber);
  apply('payAccountName', details.payAccountName);
  apply('payLinkUrl', details.payLinkUrl);
  await db.put('shop', next);
  await enqueueOutbox('shop', next.id, 'upsert', next);
  return next;
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
  creditLimitKobo?: number | null;
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
    if (input.creditLimitKobo === null) {
      delete customer.creditLimitKobo;
    } else if (input.creditLimitKobo !== undefined) {
      customer.creditLimitKobo = input.creditLimitKobo;
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
    if (input.creditLimitKobo) customer.creditLimitKobo = input.creditLimitKobo;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days past due when overdue; otherwise null. */
export function daysOverdue(
  customer: Customer,
  balanceKobo: number,
  now = Date.now(),
): number | null {
  if (!isOverdue(customer, balanceKobo, now) || !customer.dueAt) return null;
  return Math.max(1, Math.floor((now - customer.dueAt) / DAY_MS));
}

/**
 * Days until due when balance > 0 and due within `withinDays` (default 7).
 * Returns 0 if due today (not yet overdue). Null if not applicable.
 */
export function daysUntilDue(
  customer: Customer,
  balanceKobo: number,
  now = Date.now(),
  withinDays = 7,
): number | null {
  if (!customer.dueAt || balanceKobo <= 0) return null;
  if (customer.dueAt < now) return null;
  const days = Math.ceil((customer.dueAt - now) / DAY_MS);
  if (days > withinDays) return null;
  return Math.max(0, days);
}

/** Latest payment occurredAt from entries (newest-first or any order). */
export function lastPaymentAt(entries: Entry[]): number | undefined {
  let latest: number | undefined;
  for (const e of entries) {
    if (e.deletedAt || e.type !== 'payment') continue;
    if (latest === undefined || e.occurredAt > latest) latest = e.occurredAt;
  }
  return latest;
}

export type CreditLimitStatus = 'ok' | 'near' | 'at' | 'none';

/** Soft credit-limit status: near = ≥80% used, at = balance ≥ limit. */
export function creditLimitStatus(
  balanceKobo: number,
  creditLimitKobo?: number | null,
): CreditLimitStatus {
  if (creditLimitKobo == null || creditLimitKobo <= 0) return 'none';
  if (balanceKobo >= creditLimitKobo) return 'at';
  if (balanceKobo >= creditLimitKobo * 0.8) return 'near';
  return 'ok';
}

export function creditHeadroomKobo(
  balanceKobo: number,
  creditLimitKobo?: number | null,
): number | null {
  if (creditLimitKobo == null || creditLimitKobo <= 0) return null;
  return creditLimitKobo - balanceKobo;
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
    const paidAt = lastPaymentAt(active);
    results.push({
      customer,
      balanceKobo,
      creditTotalKobo,
      paymentTotalKobo,
      entryCount: active.length,
      ...(paidAt !== undefined ? { lastPaymentAt: paidAt } : {}),
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

/** Overdue customers for morning chase digest (uses dashboard sort: overdue first). */
export function getOverdueDigest(
  customers: CustomerBalance[],
  now = Date.now(),
): {
  count: number;
  totalOverdueKobo: number;
  top: CustomerBalance[];
  all: CustomerBalance[];
} {
  const all = customers.filter((r) => isOverdue(r.customer, r.balanceKobo, now));
  const totalOverdueKobo = all.reduce((s, r) => s + r.balanceKobo, 0);
  return {
    count: all.length,
    totalOverdueKobo,
    top: all.slice(0, 3),
    all,
  };
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
