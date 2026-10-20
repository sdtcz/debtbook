import { describe, expect, it } from 'vitest';
import { buildReport, periodStart } from './reports';
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
