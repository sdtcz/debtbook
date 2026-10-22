import type { CustomerBalance, Entry } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChaseItem {
  row: CustomerBalance;
  /** Whole days past the due date (min 1). */
  daysOverdue: number;
  /** balance (kobo) × days overdue — the ranking key. */
  score: number;
}

/**
 * "Today's 5 to chase": overdue customers (balance > 0 and due date passed), ranked by
 * amount owed × days overdue, highest first. Ties: bigger balance, then longer overdue, then name.
 */
export function rankTodaysChase(rows: CustomerBalance[], now = Date.now(), limit = 5): ChaseItem[] {
  const items: ChaseItem[] = [];
  for (const row of rows) {
    const due = row.customer.dueAt;
    if (row.customer.deletedAt || !due || due >= now || row.balanceKobo <= 0) continue;
    const daysOverdue = Math.max(1, Math.floor((now - due) / DAY_MS));
    items.push({ row, daysOverdue, score: row.balanceKobo * daysOverdue });
  }
  items.sort(
    (a, b) =>
      b.score - a.score ||
      b.row.balanceKobo - a.row.balanceKobo ||
      b.daysOverdue - a.daysOverdue ||
      a.row.customer.name.localeCompare(b.row.customer.name),
  );
  return items.slice(0, limit);
}

/** Monday 00:00 (local) of the week containing `now`. */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export interface WeeklyCollected {
  collectedKobo: number;
  paymentCount: number;
  customerCount: number;
  lastWeekKobo: number;
}

/** Payments recorded this calendar week (Mon–now) vs last week, live customers only. */
export function weeklyCollected(entries: Entry[], liveCustomerIds: Set<string>, now = Date.now()): WeeklyCollected {
  const start = weekStart(now);
  const prevStart = weekStart(start - DAY_MS);
  let collectedKobo = 0;
  let paymentCount = 0;
  let lastWeekKobo = 0;
  const payers = new Set<string>();
  for (const e of entries) {
    if (e.type !== 'payment' || e.deletedAt || !liveCustomerIds.has(e.customerId)) continue;
    if (e.occurredAt >= start && e.occurredAt <= now) {
      collectedKobo += e.amountKobo;
      paymentCount += 1;
      payers.add(e.customerId);
    } else if (e.occurredAt >= prevStart && e.occurredAt < start) {
      lastWeekKobo += e.amountKobo;
    }
  }
  return { collectedKobo, paymentCount, customerCount: payers.size, lastWeekKobo };
}
