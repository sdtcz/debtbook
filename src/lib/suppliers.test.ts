import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { getDb, resetDbCache, DB_VERSION } from '../db/schema';
import { addEntry, saveShop, upsertCustomer, getDashboardBalances, getShop } from '../db/repo';
import {
  addSupplierEntry,
  getSupplierBalances,
  listSupplierEntries,
  listSuppliers,
  softDeleteSupplier,
  softDeleteSupplierEntry,
  restoreSupplier,
  summarizeSuppliers,
  upsertSupplier,
} from '../db/suppliers';
import { exportBackup, importBackup } from './backup';
import { buildReport } from './reports';
import { listCustomers, listAllEntries } from '../db/repo';

async function freshDb() {
  try {
    (await getDb()).close();
  } catch {
    /* none */
  }
  resetDbCache();
  globalThis.indexedDB = new IDBFactory();
}

beforeEach(freshDb);

describe('supplier ledger', () => {
  it('records purchases on credit and payments; balance = what I owe', async () => {
    await saveShop('Mama Nkechi Store');
    const s = await upsertSupplier({ name: 'Dangote Depot', phone: '0803 000 0000' });
    await addSupplierEntry({ supplierId: s.id, type: 'purchase', amountKobo: 50_000_00 });
    await addSupplierEntry({ supplierId: s.id, type: 'payment', amountKobo: 20_000_00, note: 'Transfer' });
    const { totalIOweKobo, suppliers } = await getSupplierBalances();
    expect(totalIOweKobo).toBe(30_000_00);
    expect(suppliers[0]).toMatchObject({ balanceKobo: 30_000_00, purchaseTotalKobo: 50_000_00, entryCount: 2 });
    await expect(addSupplierEntry({ supplierId: s.id, type: 'purchase', amountKobo: 0 })).rejects.toThrow();
    await expect(upsertSupplier({ name: '  ' })).rejects.toThrow();
  });

  it('never mixes with customers: customer totals and reports ignore suppliers', async () => {
    await saveShop('Shop');
    const c = await upsertCustomer({ name: 'Tunde' });
    await addEntry({ customerId: c.id, type: 'credit', amountKobo: 5_000_00 });
    const s = await upsertSupplier({ name: 'Tunde' });
    await addSupplierEntry({ supplierId: s.id, type: 'purchase', amountKobo: 99_000_00 });
    const dash = await getDashboardBalances();
    expect(dash.totalOutstandingKobo).toBe(5_000_00);
    expect(dash.customers).toHaveLength(1);
    const r = buildReport(await listCustomers(), await listAllEntries(), 'all');
    expect(r.outstandingKobo).toBe(5_000_00);
    expect((await getSupplierBalances()).totalIOweKobo).toBe(99_000_00);
  });

  it('soft-deletes and restores suppliers/entries, and marks a local change for sync', async () => {
    await saveShop('Shop');
    const s = await upsertSupplier({ name: 'Ada Wholesale' });
    const e = await addSupplierEntry({ supplierId: s.id, type: 'purchase', amountKobo: 100 });
    const before = (await getShop())!.lastLocalChangeAt!;
    expect(before).toBeGreaterThan(0);
    await softDeleteSupplierEntry(e.id);
    expect(await listSupplierEntries(s.id)).toHaveLength(0);
    await softDeleteSupplier(s.id);
    expect(await listSuppliers()).toHaveLength(0);
    expect((await getSupplierBalances()).suppliers).toHaveLength(0);
    await restoreSupplier(s.id);
    expect(await listSuppliers()).toHaveLength(1);
  });

  it('summarizeSuppliers: overpaid suppliers do not reduce the total I owe', () => {
    const sup = (id: string) => ({ id, name: id, createdAt: 0, updatedAt: 0 });
    const ent = (supplierId: string, type: 'purchase' | 'payment', amountKobo: number) => ({
      id: Math.random().toString(36), supplierId, type, amountKobo, occurredAt: 0, createdAt: 0, updatedAt: 0,
    });
    const r = summarizeSuppliers(
      [sup('a'), sup('b'), { ...sup('c'), deletedAt: 1 }],
      [ent('a', 'purchase', 500), ent('b', 'purchase', 100), ent('b', 'payment', 300), ent('c', 'purchase', 999)],
    );
    expect(r.totalIOweKobo).toBe(500);
    expect(r.suppliers.map((x) => [x.supplier.id, x.balanceKobo])).toEqual([['a', 500], ['b', -200]]);
  });
});

describe('backup & restore with suppliers', () => {
  async function seed() {
    await saveShop('Shop');
    const c = await upsertCustomer({ name: 'Tunde' });
    await addEntry({ customerId: c.id, type: 'credit', amountKobo: 1_000_00 });
    const s = await upsertSupplier({ name: 'Depot' });
    await addSupplierEntry({ supplierId: s.id, type: 'purchase', amountKobo: 7_000_00 });
  }

  it('exports suppliers and restores them on a fresh phone', async () => {
    await seed();
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    expect(backup.suppliers).toHaveLength(1);
    expect(backup.supplierEntries).toHaveLength(1);
    await freshDb();
    const res = await importBackup(backup);
    expect(res).toMatchObject({ customers: 1, entries: 1, suppliers: 1, supplierEntries: 1, suppliersReplaced: true });
    expect((await getSupplierBalances()).totalIOweKobo).toBe(7_000_00);
    expect((await getDashboardBalances()).totalOutstandingKobo).toBe(1_000_00);
  });

  it('an older backup (no supplier fields) restores customers and keeps local suppliers', async () => {
    await seed();
    const old = {
      version: 1,
      exportedAt: 1,
      shop: { id: 'shop', name: 'Old Shop', currency: 'NGN', createdAt: 1, updatedAt: 1 },
      customers: [{ id: 'c9', name: 'Bisi', createdAt: 1, updatedAt: 1 }],
      entries: [{ id: 'e9', customerId: 'c9', type: 'credit', amountKobo: 300, occurredAt: 1, createdAt: 1, updatedAt: 1 }],
    };
    const res = await importBackup(old);
    expect(res.suppliersReplaced).toBe(false);
    expect((await listCustomers()).map((c) => c.name)).toEqual(['Bisi']);
    expect((await getSupplierBalances()).totalIOweKobo).toBe(7_000_00);
  });

  it('a backup with an empty supplier list replaces local suppliers', async () => {
    await seed();
    const b = await exportBackup();
    await importBackup({ ...b, suppliers: [], supplierEntries: [] });
    expect(await listSuppliers()).toHaveLength(0);
  });

  it('rejects malformed supplier fields', async () => {
    await expect(importBackup({ version: 1, customers: [], entries: [], suppliers: 'x' })).rejects.toThrow();
  });
});

describe('IndexedDB migration v3 -> v4', () => {
  it('keeps existing customers, entries and shop and adds supplier stores', async () => {
    const v3 = await openDB('debtbook', 3, {
      upgrade(db) {
        db.createObjectStore('shop', { keyPath: 'id' });
        const cs = db.createObjectStore('customers', { keyPath: 'id' });
        cs.createIndex('by-name', 'name');
        cs.createIndex('by-updated', 'updatedAt');
        const es = db.createObjectStore('entries', { keyPath: 'id' });
        es.createIndex('by-customer', 'customerId');
        es.createIndex('by-customer-occurred', ['customerId', 'occurredAt']);
        es.createIndex('by-updated', 'updatedAt');
        const ob = db.createObjectStore('outbox', { keyPath: 'id' });
        ob.createIndex('by-status', 'status');
        ob.createIndex('by-created', 'createdAt');
        db.createObjectStore('syncUnlock', { keyPath: 'id' });
      },
    });
    await v3.put('shop', { id: 'shop', name: 'Legacy', currency: 'NGN', createdAt: 1, updatedAt: 1, pinHash: 'h', pinSalt: 's' });
    await v3.put('customers', { id: 'c1', name: 'Old Customer', createdAt: 1, updatedAt: 1 });
    await v3.put('entries', { id: 'e1', customerId: 'c1', type: 'credit', amountKobo: 4200, occurredAt: 1, createdAt: 1, updatedAt: 1 });
    v3.close();

    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['suppliers', 'supplierEntries', 'customers', 'entries']));
    expect((await getShop())?.pinHash).toBe('h');
    expect((await getDashboardBalances()).totalOutstandingKobo).toBe(4200);
    expect(await listSuppliers()).toEqual([]);
  });
});
