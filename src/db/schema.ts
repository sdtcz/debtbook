import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Customer, Entry, OutboxItem, ShopProfile, Supplier, SupplierEntry } from '../lib/types';

export interface SyncUnlockRecord {
  /** Always 'shop' for single-shop MVP */
  id: 'shop';
  /** Normalized recovery code — device-local only; never uploaded */
  recoveryCode: string;
  /** Opaque backup id this unlock is for */
  backupId: string;
  unlockedAt: number;
}

export interface DebtBookDB extends DBSchema {
  shop: {
    key: string;
    value: ShopProfile;
  };
  customers: {
    key: string;
    value: Customer;
    indexes: { 'by-name': string; 'by-updated': number };
  };
  entries: {
    key: string;
    value: Entry;
    indexes: {
      'by-customer': string;
      'by-customer-occurred': [string, number];
      'by-updated': number;
    };
  };
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: { 'by-status': string; 'by-created': number };
  };
  /** v4: supplier ledger ("I owe"), separate from customers. */
  suppliers: {
    key: string;
    value: Supplier;
    indexes: { 'by-name': string; 'by-updated': number };
  };
  supplierEntries: {
    key: string;
    value: SupplierEntry;
    indexes: { 'by-supplier': string; 'by-updated': number };
  };
  /** Device-local sync unlock (recovery code). Never synced to cloud. */
  syncUnlock: {
    key: string;
    value: SyncUnlockRecord;
  };
}

const DB_NAME = 'debtbook'; // KEEP: IndexedDB name — renaming would wipe existing user data
/** v3: syncUnlock store for multi-device sync unlock on this device
 *  v4: suppliers + supplierEntries stores (additive; existing stores untouched) */
export const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<DebtBookDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<DebtBookDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DebtBookDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('shop')) {
            db.createObjectStore('shop', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('customers')) {
            const cs = db.createObjectStore('customers', { keyPath: 'id' });
            cs.createIndex('by-name', 'name');
            cs.createIndex('by-updated', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('entries')) {
            const es = db.createObjectStore('entries', { keyPath: 'id' });
            es.createIndex('by-customer', 'customerId');
            es.createIndex('by-customer-occurred', ['customerId', 'occurredAt']);
            es.createIndex('by-updated', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('outbox')) {
            const ob = db.createObjectStore('outbox', { keyPath: 'id' });
            ob.createIndex('by-status', 'status');
            ob.createIndex('by-created', 'createdAt');
          }
        }
        // v2: dueAt / creditLimitKobo / pin / entitlement are optional fields on
        // existing records — no structural index changes required.
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('syncUnlock')) {
            db.createObjectStore('syncUnlock', { keyPath: 'id' });
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('suppliers')) {
            const ss = db.createObjectStore('suppliers', { keyPath: 'id' });
            ss.createIndex('by-name', 'name');
            ss.createIndex('by-updated', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('supplierEntries')) {
            const se = db.createObjectStore('supplierEntries', { keyPath: 'id' });
            se.createIndex('by-supplier', 'supplierId');
            se.createIndex('by-updated', 'updatedAt');
          }
        }
      },
      blocking() {
        // A newer tab wants to upgrade: let it, and reopen lazily here.
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Reset cached promise (tests / import restore). */
export function resetDbCache(): void {
  dbPromise = null;
}
