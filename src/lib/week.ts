/** Spec 4: the week in plain sentences (Home card on Sundays, Reports → 7 days, share picture). */
import { daysOverdue, daysSince, openCycle } from '../db/repo';
import { buildReport, type ReportSummary } from './reports';
import type { Customer, Entry } from './types';

export * from './weekPrefs';

export interface WeekFacts {
  report: ReportSummary;
  fromMs: number;
  toMs: number;
  overdue: { name: string; days: number }[];
  oldestDays: number | null;
}

export function weekFacts(customers: Customer[], entries: Entry[], now = Date.now()): WeekFacts {
  const report = buildReport(customers, entries, 'week', now, Infinity);
  const overdue: WeekFacts['overdue'] = [];
  const owing = new Set<string>();
  for (const d of report.topDebtors) {
    owing.add(d.customer.id);
    const days = daysOverdue(d.customer, d.balanceKobo, now);
    if (days != null) overdue.push({ name: d.customer.name, days });
  }
  overdue.sort((a, b) => b.days - a.days);
  const byCustomer = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!owing.has(e.customerId)) continue;
    const list = byCustomer.get(e.customerId);
    if (list) list.push(e);
    else byCustomer.set(e.customerId, [e]);
  }
  let oldest: number | undefined;
  byCustomer.forEach((list) => {
    const at = openCycle(list).oldestUnpaidAt;
    if (at != null && (oldest == null || at < oldest)) oldest = at;
  });
  return {
    report,
    fromMs: report.fromMs,
    toMs: now,
    overdue,
    oldestDays: oldest == null ? null : daysSince(oldest, now),
  };
}

/**
 * Plain sentences in two groups: [what happened this week, where things stand now].
 * Names only when asked (the picture defaults to no names).
 */
export function weekSentences(
  f: WeekFacts,
  tr: (key: string, vars?: Record<string, string | number>) => string,
  money: (minor: number) => string,
  names = false,
): [string[], string[]] {
  const r = f.report;
  const days = (n: number) => (n === 1 ? tr('week.day1') : tr('week.days', { n }));
  const week = [
    r.creditGivenKobo > 0
      ? tr(r.creditCustomers === 1 ? 'week.credit1' : 'week.credit', { amount: money(r.creditGivenKobo), n: r.creditCustomers })
      : tr('week.noCredit'),
    r.collectedKobo > 0
      ? tr(r.payingCustomers === 1 ? 'week.collected1' : 'week.collected', { amount: money(r.collectedKobo), n: r.payingCustomers })
      : tr('week.noPayments'),
  ];
  const now: string[] = [];
  if (r.owingCustomers === 0) now.push(tr('week.nobodyOwes'));
  else {
    now.push(tr(r.owingCustomers === 1 ? 'week.owing1' : 'week.owing', { amount: money(r.outstandingKobo), n: r.owingCustomers }));
    const od = f.overdue;
    if (od.length === 0) now.push(tr('week.nobodyOverdue'));
    else if (names && od.length === 1) now.push(tr('week.overdueNamed1', { name: od[0].name, days: days(od[0].days) }));
    else if (names) now.push(tr('week.overdueNamed', { n: od.length, name: od[0].name, days: days(od[0].days) }));
    else now.push(od.length === 1 ? tr('week.overdue1') : tr('week.overdue', { n: od.length }));
    if (f.oldestDays != null && f.oldestDays > 0) now.push(tr('week.oldest', { days: days(f.oldestDays) }));
  }
  return [week, now];
}

/** "Oct 22 – 28" in the reader's locale. */
export function weekRange(f: Pick<WeekFacts, 'fromMs' | 'toMs'>, locale?: string): string {
  try {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }) as Intl.DateTimeFormat & {
      formatRange?: (a: Date, b: Date) => string;
    };
    if (fmt.formatRange) return fmt.formatRange(new Date(f.fromMs), new Date(f.toMs));
    return `${fmt.format(f.fromMs)} – ${fmt.format(f.toMs)}`;
  } catch {
    return '';
  }
}

/** Card/picture has something to say: any entry this week or anyone owing. */
export function weekHasNews(f: WeekFacts): boolean {
  const r = f.report;
  return r.creditCount + r.paymentCount > 0 || r.owingCustomers > 0;
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** Picture + text for the share sheet. The text never carries names; the picture only when asked. */
export function weekShareParts(
  f: WeekFacts,
  shop: string,
  tr: Tr,
  money: (minor: number) => string,
  names: boolean,
  locale?: string,
) {
  const range = weekRange(f, locale);
  const [a, b] = weekSentences(f, tr, money, names);
  const overdueLine = f.overdue.length > 0 ? b[1] : '';
  const picture = {
    kicker: tr('week.title', { range }),
    shop: shop || 'BashiBook',
    bigLabel: tr('week.collectedBig'),
    big: money(f.report.collectedKobo),
    lines: [...a, ...b].slice(0, 5).map((text) => ({ text, overdue: text === overdueLine })),
    footer: tr('week.footer'),
  };
  const [ta, tb] = names ? weekSentences(f, tr, money, false) : [a, b];
  const text = [tr('week.textTitle', { shop: shop || 'BashiBook', range }), ...ta, ...tb, '— BashiBook · bashibook.app'].join('\n');
  return { picture, text, title: tr('week.share') };
}
