/** Offline business summary — pure functions over local entries (no network). */
import type { Customer, Entry } from './types';

export type ReportPeriod = 'today' | 'week' | 'month' | 'all';

export interface ReportSummary {
  period: ReportPeriod;
  fromMs: number;
  creditGivenKobo: number;
  collectedKobo: number;
  creditCount: number;
  paymentCount: number;
  /** collected / credit given in period, 0–100 (null when nothing was lent) */
  collectionRatePct: number | null;
  /** Customers who paid in the period */
  payingCustomers: number;
  /** Outstanding now (all time, positive balances only) */
  outstandingKobo: number;
  /** Top debtors by current balance */
  topDebtors: { customer: Customer; balanceKobo: number }[];
}

export function periodStart(period: ReportPeriod, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'today') return d.getTime();
  if (period === 'week') return d.getTime() - 6 * 24 * 60 * 60 * 1000;
  if (period === 'month') {
    d.setDate(1);
    return d.getTime();
  }
  return 0;
}

export function buildReport(
  customers: Customer[],
  entries: Entry[],
  period: ReportPeriod,
  now = Date.now(),
  topN = 5,
): ReportSummary {
  const fromMs = periodStart(period, now);
  const live = new Map(customers.filter((c) => !c.deletedAt).map((c) => [c.id, c]));
  let creditGivenKobo = 0;
  let collectedKobo = 0;
  let creditCount = 0;
  let paymentCount = 0;
  const payers = new Set<string>();
  const balances = new Map<string, number>();

  for (const e of entries) {
    if (e.deletedAt || !live.has(e.customerId)) continue;
    const signed = e.type === 'credit' ? e.amountKobo : -e.amountKobo;
    balances.set(e.customerId, (balances.get(e.customerId) || 0) + signed);
    if (e.occurredAt < fromMs || e.occurredAt > now) continue;
    if (e.type === 'credit') {
      creditGivenKobo += e.amountKobo;
      creditCount += 1;
    } else {
      collectedKobo += e.amountKobo;
      paymentCount += 1;
      payers.add(e.customerId);
    }
  }

  let outstandingKobo = 0;
  const debtors: { customer: Customer; balanceKobo: number }[] = [];
  balances.forEach((bal, id) => {
    if (bal > 0) {
      outstandingKobo += bal;
      const c = live.get(id);
      if (c) debtors.push({ customer: c, balanceKobo: bal });
    }
  });
  debtors.sort((a, b) => b.balanceKobo - a.balanceKobo);

  return {
    period,
    fromMs,
    creditGivenKobo,
    collectedKobo,
    creditCount,
    paymentCount,
    collectionRatePct:
      creditGivenKobo > 0
        ? Math.min(100, Math.round((collectedKobo / creditGivenKobo) * 100))
        : null,
    payingCustomers: payers.size,
    outstandingKobo,
    topDebtors: debtors.slice(0, topN),
  };
}
