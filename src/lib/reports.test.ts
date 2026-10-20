import { describe, expect, it } from 'vitest';
import { buildReport, buildSupplierReport, periodStart } from './reports';
import type { Customer, Entry } from './types';

const day = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 19, 15, 0, 0).getTime();
const c = (id: string, extra: Partial<Customer> = {}): Customer => ({
  id,
  name: id.toUpperCase(),
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});
let n = 0;
const e = (customerId: string, type: 'credit' | 'payment', naira: number, at: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`,
  customerId,
  type,
  amountKobo: naira * 100,
  occurredAt: at,
  createdAt: at,
  updatedAt: at,
  ...extra,
});

describe('reports', () => {
  const customers = [c('a'), c('b'), c('gone', { deletedAt: 1 })];
  const entries = [
    e('a', 'credit', 5000, now - 40 * day),
    e('a', 'credit', 2000, now - 2 * day),
    e('a', 'payment', 1000, now - 1000),
    e('b', 'credit', 3000, now - 3 * day),
    e('b', 'payment', 3000, now - 2 * day),
    e('gone', 'credit', 9999, now - 1000),
    e('b', 'credit', 777, now - 1000, { deletedAt: now }),
  ];

  it('summarises the last 7 days and ignores deleted rows/customers', () => {
    const r = buildReport(customers, entries, 'week', now);
    expect(r.creditGivenKobo).toBe(5000 * 100);
    expect(r.collectedKobo).toBe(4000 * 100);
    expect(r.creditCount).toBe(2);
    expect(r.paymentCount).toBe(2);
    expect(r.payingCustomers).toBe(2);
    expect(r.collectionRatePct).toBe(80);
    expect(r.outstandingKobo).toBe(6000 * 100);
    expect(r.topDebtors.map((d) => d.customer.id)).toEqual(['a']);
  });

  it('today only counts entries since midnight', () => {
    const r = buildReport(customers, entries, 'today', now);
    expect(r.creditGivenKobo).toBe(0);
    expect(r.collectedKobo).toBe(1000 * 100);
    expect(r.collectionRatePct).toBeNull();
  });

  it('period starts are sane', () => {
    expect(periodStart('all', now)).toBe(0);
    expect(new Date(periodStart('month', now)).getDate()).toBe(1);
    expect(periodStart('week', now)).toBeLessThan(periodStart('today', now));
  });
});

describe('buildSupplierReport', () => {
  const sup = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), createdAt: 0, updatedAt: 0, ...extra });
  let m = 0;
  const se = (supplierId: string, type: 'purchase' | 'payment', naira: number, at: number, extra: Record<string, unknown> = {}) => ({
    id: `s${m++}`,
    supplierId,
    type,
    amountKobo: naira * 100,
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    ...extra,
  });
  const suppliers = [sup('x'), sup('y'), sup('gone', { deletedAt: 1 })];
  const entries = [
    se('x', 'purchase', 10000, now - 40 * day),
    se('x', 'payment', 3000, now - 1 * day),
    se('y', 'purchase', 2000, now - 2 * day),
    se('y', 'payment', 2500, now - 1 * day),
    se('x', 'purchase', 9999, now - 1 * day, { deletedAt: now }),
    se('gone', 'purchase', 50000, now - 1 * day),
  ];

  it('counts period flows, ignores deleted entries/suppliers, and only sums positive balances owed', () => {
    const r = buildSupplierReport(suppliers, entries, 'week', now);
    expect(r.purchasedKobo).toBe(200000);
    expect(r.paidKobo).toBe(550000);
    expect(r.purchaseCount).toBe(1);
    expect(r.paymentCount).toBe(2);
    expect(r.iOweKobo).toBe(700000); // x: 10000-3000; y overpaid -> not counted
    expect(r.topCreditors.map((t) => t.supplier.id)).toEqual(['x']);
  });

  it('all-time totals include older purchases', () => {
    const r = buildSupplierReport(suppliers, entries, 'all', now);
    expect(r.purchasedKobo).toBe(1200000);
  });
});
