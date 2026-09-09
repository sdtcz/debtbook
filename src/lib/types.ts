/** Core domain types for DebtBook */

export interface ShopProfile {
  id: 'shop';
  name: string;
  currency: 'NGN';
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  note?: string;
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
