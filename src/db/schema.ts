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

const DB_NAME = 'debtbook';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DebtBookDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<DebtBookDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DebtBookDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
      },
    });
  }
  return dbPromise;
}
