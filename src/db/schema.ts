import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Customer, Entry, OutboxItem, ShopProfile } from '../lib/types';

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
}

const DB_NAME = 'debtbook'; // KEEP: IndexedDB name — renaming would wipe existing user data
/** v2: Customer.dueAt + ShopProfile pin/entitlement fields (no new stores) */
const DB_VERSION = 2;

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
        // v2: dueAt / pin / entitlement are optional fields on existing records —
        // no structural index changes required. Existing data migrates in place.
      },
    });
  }
  return dbPromise;
}

/** Reset cached promise (tests / import restore). */
export function resetDbCache(): void {
  dbPromise = null;
}
