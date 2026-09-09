import { newId } from '../lib/id';
import type {
  Customer,
  CustomerBalance,
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
  } else {
    customer = {
      id: newId(),
      name,
      phone: input.phone?.trim() || undefined,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
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

export async function getDashboardBalances(): Promise<{
  totalOutstandingKobo: number;
  customers: CustomerBalance[];
}> {
  const customers = await listCustomers();
  const db = await getDb();
  const results: CustomerBalance[] = [];
  let totalOutstandingKobo = 0;

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
    // Outstanding = sum of positive balances only (what customers owe the shop)
    if (balanceKobo > 0) totalOutstandingKobo += balanceKobo;
  }

  results.sort((a, b) => b.balanceKobo - a.balanceKobo);
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
