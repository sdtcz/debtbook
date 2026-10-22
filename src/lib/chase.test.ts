import { describe, expect, it } from 'vitest';
import { rankTodaysChase, weekStart, weeklyCollected } from './chase';
import type { CustomerBalance, Entry } from './types';

const DAY = 86_400_000;
const now = new Date(2026, 9, 22, 9, 0).getTime(); // Thu 22 Oct 2026
const row = (id: string, naira: number, dueDaysAgo: number | null, extra: Record<string, unknown> = {}): CustomerBalance =>
  ({
    customer: { id, name: id, createdAt: 0, updatedAt: 0, dueAt: dueDaysAgo == null ? undefined : now - dueDaysAgo * DAY, ...extra },
    balanceKobo: naira * 100,
    creditTotalKobo: naira * 100,
    paymentTotalKobo: 0,
    entryCount: 1,
  }) as CustomerBalance;

describe("Today's 5 to chase", () => {
  it('ranks by amount × days overdue, highest first, max 5', () => {
    const rows = [
      row('small-old', 1000, 30), // 30k
      row('big-new', 20000, 1), // 20k
      row('mid', 5000, 10), // 50k
      row('notdue', 90000, -3),
      row('nodate', 90000, null),
      row('paid', 0, 40),
      row('a', 100, 2),
      row('b', 200, 2),
      row('c', 300, 2),
      row('gone', 99999, 50, { deletedAt: 1 }),
    ];
    const list = rankTodaysChase(rows, now);
    expect(list.map((i) => i.row.customer.id)).toEqual(['mid', 'small-old', 'big-new', 'c', 'b']);
    expect(list[0]).toMatchObject({ daysOverdue: 10, score: 500000 * 10 });
  });

  it('breaks ties by bigger balance', () => {
    const list = rankTodaysChase([row('x', 1000, 10), row('y', 10000, 1)], now);
    expect(list.map((i) => i.row.customer.id)).toEqual(['y', 'x']);
  });
});

describe('weekly collected', () => {
  it('weeks start Monday 00:00 local', () => {
    const ws = new Date(weekStart(now));
    expect(ws.getDay()).toBe(1);
    expect(ws.getDate()).toBe(19);
    expect(ws.getHours()).toBe(0);
  });

  it('sums this week payments (live customers, not deleted) and last week separately', () => {
    let n = 0;
    const e = (customerId: string, type: 'credit' | 'payment', naira: number, at: number, extra: Partial<Entry> = {}): Entry => ({
      id: `e${n++}`, customerId, type, amountKobo: naira * 100, occurredAt: at, createdAt: at, updatedAt: at, ...extra,
    });
    const entries = [
      e('a', 'payment', 2000, now - 1 * DAY), // Wed
      e('b', 'payment', 3000, weekStart(now) + 60_000), // Mon
      e('a', 'payment', 500, now - 2 * DAY, { deletedAt: now }),
      e('a', 'credit', 9000, now - DAY),
      e('gone', 'payment', 7000, now - DAY),
      e('a', 'payment', 1500, weekStart(now) - DAY), // last Sunday
    ];
    expect(weeklyCollected(entries, new Set(['a', 'b']), now)).toEqual({
      collectedKobo: 500000,
      paymentCount: 2,
      customerCount: 2,
      lastWeekKobo: 150000,
    });
  });
});
