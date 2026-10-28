import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { formatMoney } from './money';
import type { Customer, Entry } from './types';
import {
  hideWeekCard,
  isoWeek,
  WEEK_HIDDEN_KEY,
  weekCardDue,
  weekFacts,
  weekHasNews,
  weekNamesOn,
  weekSentences,
  weekShareParts,
} from './week';

const DAY = 864e5;
const SUN = new Date(2026, 10, 1, 18, 0).getTime(); // Sun Nov 1 2026, local
const tr = t as unknown as (k: string, v?: Record<string, string | number>) => string;
const ngn = (k: number) => formatMoney(k, 'NGN');
const cust = (id: string, name: string, dueAt?: number): Customer => ({ id, name, dueAt, createdAt: 0, updatedAt: 0 });
let n = 0;
const entry = (customerId: string, type: 'credit' | 'payment', naira: number, at: number): Entry => ({
  id: `e${++n}`, customerId, type, amountKobo: naira * 100, occurredAt: at, createdAt: at, updatedAt: at,
});
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('weekly summary sentences (Spec 4)', () => {
  const customers = [cust('a', 'Ngozi', SUN - 6 * DAY), cust('b', 'Ade'), cust('c', 'Bisi')];
  const entries = [
    entry('a', 'credit', 12000, SUN - 20 * DAY), // old debt, 20 days, overdue 6 days
    entry('b', 'credit', 5000, SUN - 2 * DAY),
    entry('c', 'credit', 3000, SUN - 3 * DAY),
    entry('c', 'payment', 3000, SUN - DAY),
    entry('b', 'payment', 1500, SUN - DAY),
  ];
  const f = weekFacts(customers, entries, SUN);

  it('counts credit and owing customers', () => {
    expect(f.report.creditCustomers).toBe(2);
    expect(f.report.owingCustomers).toBe(2);
    expect(f.overdue).toEqual([{ name: 'Ngozi', days: 6 }]);
    expect(f.oldestDays).toBe(20);
  });

  it('plain sentences, names off by default', () => {
    const [a, b] = weekSentences(f, tr, ngn);
    expect(a).toEqual([
      `You recorded ${ngn(800000)} of credit for 2 customers.`,
      `You collected ${ngn(450000)} from 2 customers.`,
    ]);
    expect(b).toEqual([`2 customers owe you ${ngn(1550000)} in total.`, '1 customer is overdue.', 'The oldest debt is 20 days old.']);
    expect(b.join(' ')).not.toContain('Ngozi');
    expect(weekSentences(f, tr, ngn, true)[1][1]).toBe('Ngozi is 6 days overdue.');
  });

  it('zeros and singulars', () => {
    const quiet = weekFacts([cust('x', 'Sam')], [entry('x', 'credit', 25, SUN - 30 * DAY), entry('x', 'payment', 25, SUN - 29 * DAY)], SUN);
    expect(weekSentences(quiet, tr, ngn)).toEqual([
      ['No credit recorded this week.', 'No payments recorded this week.'],
      ['Nobody owes you right now.'],
    ]);
    expect(weekHasNews(quiet)).toBe(false);
    const one = weekFacts([cust('x', 'Sam')], [entry('x', 'credit', 25, SUN - DAY)], SUN);
    const [a, b] = weekSentences(one, tr, ngn);
    expect(a[0]).toBe(`You recorded ${ngn(2500)} of credit for 1 customer.`);
    expect(b).toEqual([`1 customer owes you ${ngn(2500)}.`, 'Nobody is overdue.', 'The oldest debt is 1 day old.']);
  });

  it('the shared text never carries names; the picture only when asked', () => {
    const off = weekShareParts(f, 'Sunrise Corner Store', tr, ngn, false, 'en-US');
    const on = weekShareParts(f, 'Sunrise Corner Store', tr, ngn, true, 'en-US');
    expect(off.text.split('\n')[0]).toMatch(/^Sunrise Corner Store, my week \(Oct 26\s*–\s*Nov 1\)$/);
    expect(off.text).toContain('— BashiBook · bashibook.app');
    expect(on.text).not.toContain('Ngozi');
    expect(JSON.stringify(off.picture)).not.toContain('Ngozi');
    expect(JSON.stringify(on.picture)).toContain('Ngozi');
    expect(on.picture.lines.find((l) => l.overdue)?.text).toContain('Ngozi');
  });
});

describe('Sunday card visibility (Spec 4)', () => {
  it('Sundays only, hidden until next ISO week', () => {
    const ls = mem();
    expect(weekCardDue(SUN, ls)).toBe(true);
    expect(weekCardDue(SUN - DAY, ls)).toBe(false); // Saturday
    hideWeekCard(SUN, ls);
    expect(ls.getItem(WEEK_HIDDEN_KEY)).toBe(isoWeek(SUN));
    expect(weekCardDue(SUN, ls)).toBe(false);
    expect(weekCardDue(SUN + 7 * DAY, ls)).toBe(true); // next Sunday
  });
  it('ISO weeks', () => {
    expect(isoWeek(new Date(2026, 10, 1).getTime())).toBe('2026-W44');
    expect(isoWeek(new Date(2026, 9, 26).getTime())).toBe('2026-W44');
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe('2026-W53');
  });
  it('names in the picture are off by default', () => {
    expect(weekNamesOn(mem())).toBe(false);
  });
});
