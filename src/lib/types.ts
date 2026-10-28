/** Core domain types for BashiBook */

export type Plan = 'free' | 'pro';

export interface Entitlement {
  plan: Plan;
  /** Unix ms expiry; omit for perpetual / until revoked */
  exp?: number;
  source?: string;
}

/** Free Pro trial bookkeeping — once per phone/install. */
export interface TrialMarker {
  startedAt: number;
  endsAt: number;
  /** Set when a pre-Oct-2026 30-day trial was cut to the 5-day rule. */
  capped?: boolean;
}

export interface ShopProfile {
  id: 'shop';
  name: string;
  /** ISO 4217 code (see lib/money CURRENCIES). Shops created before Oct 2026 are 'NGN'. */
  currency: string;
  createdAt: number;
  updatedAt: number;
  /** SHA-256 hex of salt+pin; unset = no lock */
  pinHash?: string;
  pinSalt?: string;
  /** Ask for the PIN before deleting a customer/entry or erasing this phone (default off) */
  pinBeforeDelete?: boolean;
  entitlement?: Entitlement;
  /** Free trial used on this shop (kept in backups). */
  trial?: TrialMarker;
  /** Pro cloud backup enabled on this device */
  cloudBackupEnabled?: boolean;
  /** Last successful cloud upload (unix ms) */
  lastCloudBackupAt?: number;
  /** Public opaque backup id (SHA-256 hex) — never the recovery code */
  cloudBackupId?: string;
  /** Last local ledger mutation (unix ms) — for sync pending / auto-push */
  lastLocalChangeAt?: number;
  /** UI language preference */
  locale?: 'en' | 'ha' | 'yo';
  /** Daily overdue chase reminder on Home (default off) */
  chaseReminderEnabled?: boolean;
  /** Preferred local time HH:mm for chase copy / notification */
  chaseReminderTime?: string;
  /** Bank name for Pay-me links (e.g. Opay, GTBank) */
  payBankName?: string;
  /** NUBAN / wallet account number for transfers */
  payAccountNumber?: string;
  /** Account name as shown on bank / wallet */
  payAccountName?: string;
  /** Optional Opay/Palmpay/Paystack.me/custom payment URL */
  payLinkUrl?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  /** Optional due date (unix ms) for outstanding balance reminders */
  dueAt?: number;
  /** Optional credit limit in kobo; soft-warn when lending past this */
  creditLimitKobo?: number;
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
  /** Amount in hundredths of the shop currency (kobo for NGN) for precise arithmetic */
  amountKobo: number;
  note?: string;
  /** When the sale/payment happened (user-facing) */
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type OutboxOp = 'upsert' | 'delete';
export type OutboxEntity = 'shop' | 'customer' | 'entry' | 'supplier' | 'supplierEntry';

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
  /** Latest payment entry occurredAt, if any */
  lastPaymentAt?: number;
  /** Latest entry occurredAt of any type, if any */
  lastActivityAt?: number;
  /** FIFO: occurredAt of the oldest credit not yet paid off (balance > 0 only) */
  oldestUnpaidAt?: number;
  /** Credits since the balance was last ≤ 0 (0 when nothing is owed) */
  cycleCreditKobo?: number;
  /** Payments since the balance was last ≤ 0 (0 when nothing is owed) */
  cyclePaidKobo?: number;
}

/**
 * Supplier ledger ("I owe"): kept in separate stores from customers so
 * "they owe me" and "I owe" can never mix.
 */
export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** purchase = bought on credit (I owe more); payment = I paid the supplier. */
export type SupplierEntryType = 'purchase' | 'payment';

export interface SupplierEntry {
  id: string;
  supplierId: string;
  type: SupplierEntryType;
  amountKobo: number;
  note?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SupplierBalance {
  supplier: Supplier;
  /** Positive = I owe the supplier; negative = supplier owes me (overpaid). */
  balanceKobo: number;
  purchaseTotalKobo: number;
  paymentTotalKobo: number;
  entryCount: number;
}

export interface BackupPayload {
  version: 1;
  exportedAt: number;
  shop: ShopProfile | null;
  customers: Customer[];
  entries: Entry[];
  /**
   * Added Oct 2026. Optional so older backups (and older app versions) stay
   * valid: a backup without these fields leaves local suppliers untouched.
   */
  suppliers?: Supplier[];
  supplierEntries?: SupplierEntry[];
}
