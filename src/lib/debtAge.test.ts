import { describe, expect, it } from 'vitest';
import { compareCustomerRows, daysSince, openCycle } from '../db/repo';
import { rowAgeLine } from '../pages/HomePage';
import type { Customer, CustomerBalance, Entry } from './types';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 12);
let n = 0;
const e = (type: 'credit' | 'payment', amountKobo: number, daysAgo: number, extra: Partial<Entry> = {}): Entry =>
  ({ id: `e${++n}`, customerId: 'c', type, amountKobo, occurredAt: NOW - daysAgo * DAY, createdAt: NOW - daysAgo * DAY + n, updatedAt: NOW, ...extra }) as Entry;
const cust = (id: string, extra: Partial<Customer> = {}): Customer =>
  ({ id, name: id, createdAt: NOW - 90 * DAY, updatedAt: NOW, ...extra }) as Customer;
const row = (id: string, balanceKobo: number, extra: Partial<CustomerBalance> = {}, c: Partial<Customer> = {}): CustomerBalance => ({
  customer: cust(id, c), balanceKobo, creditTotalKobo: 0, paymentTotalKobo: 0, entryCount: 1, ...extra,
});
const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`;

describe('openCycle (FIFO debt age)', () => {
  it('3 credits + 2 payments: payments clear the oldest credit first', () => {
    const r = openCycle([e('credit', 1000, 20), e('credit', 2000, 10), e('credit', 3000, 5), e('payment', 1500, 8), e('payment', 500, 2)]);
    // 1500 clears credit #1 (1000) and 500 of #2; 500 more leaves #2 with 1000 → oldest unpaid is #2 (10 days)
    expect(r.oldestUnpaidAt).toBe(NOW - 10 * DAY);
    expect(r.cycleCreditKobo).toBe(6000);
    expect(r.cyclePaidKobo).toBe(2000);
  });
  it('order of the input array does not matter', () => {
    const es = [e('payment', 1000, 3), e('credit', 1000, 9), e('credit', 500, 4)];
    expect(openCycle(es).oldestUnpaidAt).toBe(NOW - 4 * DAY);
    expect(openCycle([...es].reverse()).oldestUnpaidAt).toBe(NOW - 4 * DAY);
  });
  it('overpayment: nothing owed, no age, no cycle', () => {
    expect(openCycle([e('credit', 1000, 5), e('payment', 1500, 1)])).toEqual({ oldestUnpaidAt: undefined, cycleCreditKobo: 0, cyclePaidKobo: 0 });
  });
  it('settle then new credit resets the cycle', () => {
    const r = openCycle([e('credit', 1000, 30), e('payment', 1000, 20), e('credit', 400, 6), e('payment', 100, 2)]);
    expect(r).toEqual({ oldestUnpaidAt: NOW - 6 * DAY, cycleCreditKobo: 400, cyclePaidKobo: 100 });
  });
  it('credit on top of an overpayment starts a fresh cycle', () => {
    const r = openCycle([e('credit', 1000, 30), e('payment', 1500, 20), e('credit', 1000, 6)]);
    expect(r.cycleCreditKobo).toBe(1000);
    expect(r.cyclePaidKobo).toBe(0);
  });
  it('voided (deleted) entries are ignored', () => {
    const r = openCycle([e('credit', 1000, 30, { deletedAt: NOW }), e('credit', 500, 3), e('payment', 200, 1, { deletedAt: NOW })]);
    expect(r).toEqual({ oldestUnpaidAt: NOW - 3 * DAY, cycleCreditKobo: 500, cyclePaidKobo: 0 });
  });
  it('future-dated entries count as today', () => {
    const r = openCycle([e('credit', 1000, -3)]);
    expect(daysSince(r.oldestUnpaidAt!, NOW)).toBe(0);
  });
});

describe('Home row order (oldest debt first)', () => {
  it('overdue (most days late) → owing (oldest first) → paid extra → settled → no entries', () => {
    const rows = [
      row('none', 0, { entryCount: 0 }),
      row('settledOld', 0, { lastActivityAt: NOW - 9 * DAY }),
      row('settledNew', 0, { lastActivityAt: NOW - 1 * DAY }),
      row('extra', -500, { lastPaymentAt: NOW - 2 * DAY }),
      row('owingNew', 9000, { oldestUnpaidAt: NOW - 2 * DAY }),
      row('owingOld', 100, { oldestUnpaidAt: NOW - 20 * DAY }),
      row('od2', 100, {}, { dueAt: NOW - 2 * DAY }),
      row('od9', 100, {}, { dueAt: NOW - 9 * DAY }),
      row('od9big', 900, {}, { dueAt: NOW - 9 * DAY }),
    ];
    const order = [...rows].sort((a, b) => compareCustomerRows(a, b, NOW)).map((r) => r.customer.id);
    expect(order).toEqual(['od9big', 'od9', 'od2', 'owingOld', 'owingNew', 'extra', 'settledNew', 'settledOld', 'none']);
  });
});

describe('Row line A: red only for overdue', () => {
  it('overdue → "N days overdue" flagged red; plain owing never red', () => {
    expect(rowAgeLine(row('a', 100, {}, { dueAt: NOW - 6 * DAY }), t, NOW)).toEqual({ text: 'home.daysOverdue{"n":6}', overdue: true });
    expect(rowAgeLine(row('a', 100, {}, { dueAt: NOW - DAY - 1 }), t, NOW).text).toBe('home.dayOverdue');
    expect(rowAgeLine(row('b', 100, { oldestUnpaidAt: NOW - 97 * DAY }), t, NOW)).toEqual({ text: 'home.ageMonths{"n":3}', overdue: false });
    expect(rowAgeLine(row('b', 100, { oldestUnpaidAt: NOW - 14 * DAY }), t, NOW).text).toBe('home.ageDays{"n":14}');
    expect(rowAgeLine(row('b', 100, { oldestUnpaidAt: NOW - DAY }), t, NOW).text).toBe('home.ageDay');
    expect(rowAgeLine(row('b', 100, { oldestUnpaidAt: NOW }), t, NOW).text).toBe('home.ageToday');
  });
  it('adds the due date when one is set and not passed', () => {
    expect(rowAgeLine(row('b', 100, { oldestUnpaidAt: NOW - 4 * DAY }, { dueAt: NOW + 3 * DAY }), t, NOW).text).toBe('home.ageDays{"n":4} · home.dueInDays{"n":3}');
  });
  it('settled, paid extra and no entries', () => {
    expect(rowAgeLine(row('s', 0, { lastPaymentAt: NOW - DAY }), t, NOW).text).toMatch(/^home.settledLastPaid/);
    expect(rowAgeLine(row('x', -100, { lastPaymentAt: NOW - DAY }), t, NOW).text).toMatch(/^home.paidExtra/);
    expect(rowAgeLine(row('z', 0, { entryCount: 0 }), t, NOW).text).toBe('home.noEntriesYet');
  });
});
