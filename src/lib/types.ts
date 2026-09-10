/** Core domain types for BashiBook */

export type Plan = 'free' | 'pro';

export interface Entitlement {
  plan: Plan;
  /** Unix ms expiry; omit for perpetual / until revoked */
  exp?: number;
  source?: string;
}

export interface ShopProfile {
  id: 'shop';
  name: string;
  currency: 'NGN';
  createdAt: number;
  updatedAt: number;
  /** SHA-256 hex of salt+pin; unset = no lock */
  pinHash?: string;
  pinSalt?: string;
  entitlement?: Entitlement;
  /** Pro cloud backup enabled on this device */
  cloudBackupEnabled?: boolean;
  /** Last successful cloud upload (unix ms) */
  lastCloudBackupAt?: number;
  /** Public opaque backup id (SHA-256 hex) — never the recovery code */
  cloudBackupId?: string;
  /** UI language preference */
  locale?: 'en' | 'ha' | 'yo';
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  /** Optional due date (unix ms) for outstanding balance reminders */
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete support for LWW sync later */
  deletedAt?: number;
}

export type EntryType = 'credit' | 'payment';

export interface Entry {
  id: string;
  customerId: string;
  type: EntryType;
  /** Amount in kobo (1 Naira = 100 kobo) for precise arithmetic */
  amountKobo: number;
  note?: string;
  /** When the sale/payment happened (user-facing) */
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type OutboxOp = 'upsert' | 'delete';
export type OutboxEntity = 'shop' | 'customer' | 'entry';

/** Queued mutation for future backend sync (LWW-ready) */
export interface OutboxItem {
  id: string;
  entity: OutboxEntity;
  entityId: string;
  op: OutboxOp;
  /** Full snapshot of the entity at mutation time */
  payload: unknown;
  /** Client timestamp — LWW candidate */
  clientTs: number;
  createdAt: number;
  status: 'pending' | 'synced' | 'failed';
}

export interface CustomerBalance {
  customer: Customer;
  balanceKobo: number;
  creditTotalKobo: number;
  paymentTotalKobo: number;
  entryCount: number;
}

export interface BackupPayload {
  version: 1;
  exportedAt: number;
  shop: ShopProfile | null;
  customers: Customer[];
  entries: Entry[];
}
