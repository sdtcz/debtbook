import { brandFooterHost } from './growth';
import { t } from '../i18n';
import { formatMoney, getCurrency } from './money';
import type { Customer } from './types';

/** Customer entries (credit/payment) or supplier entries (purchase/payment). */
export interface LedgerLine {
  id: string;
  type: 'credit' | 'payment' | 'purchase';
  amountKobo: number;
  note?: string;
  occurredAt: number;
  createdAt: number;
  deletedAt?: number;
}
export type StatementKind = 'customer' | 'supplier';
import { A4, PdfPage, buildPdf, fitText } from './pdf';

export type StatementRange = 'all' | 'last30' | 'thisMonth';

export interface StatementRow {
  entry: LedgerLine;
  /** Running balance in kobo after this entry (positive = customer owes shop). */
  balanceKobo: number;
}

export interface StatementData {
  rows: StatementRow[];
  /** Balance carried in from before `from` (0 for all-time). */
  openingKobo: number;
  closingKobo: number;
  /** Period shown on the statement (unix ms). */
  from: number;
  to: number;
  creditTotalKobo: number;
  paymentTotalKobo: number;
}

const DAY = 86_400_000;

/** Resolve a preset range to [from, to] (from = null means all time). */
export function resolveRange(range: StatementRange, now = Date.now()): { from: number | null; to: number } {
  if (range === 'last30') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { from: d.getTime() - 29 * DAY, to: now };
  }
  if (range === 'thisMonth') {
    const d = new Date(now);
    return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now };
  }
  return { from: null, to: now };
}

/** Credit sales / purchases on credit raise the balance; payments lower it. */
function delta(e: LedgerLine): number {
  return e.type === 'payment' ? -e.amountKobo : e.amountKobo;
}

/** Sort live entries oldest-first and compute running balances for a period. */
export function buildStatementData(
  entries: LedgerLine[],
  opts: { from?: number | null; to?: number } = {},
): StatementData {
  const to = opts.to ?? Date.now();
  const live = entries
    .filter((e) => !e.deletedAt && e.occurredAt <= to)
    .sort((a, b) => a.occurredAt - b.occurredAt || a.createdAt - b.createdAt);
  const from = opts.from ?? null;
  let bal = 0;
  let opening = 0;
  const rows: StatementRow[] = [];
  let cr = 0;
  let pay = 0;
  for (const e of live) {
    bal += delta(e);
    if (from != null && e.occurredAt < from) {
      opening = bal;
      continue;
    }
    if (e.type === 'payment') pay += e.amountKobo;
    else cr += e.amountKobo;
    rows.push({ entry: e, balanceKobo: bal });
  }
  const start = from ?? (rows[0]?.entry.occurredAt ?? to);
  return { rows, openingKobo: opening, closingKobo: bal, from: start, to, creditTotalKobo: cr, paymentTotalKobo: pay };
}

/** Amount text that renders in base PDF fonts (ISO code, not a symbol glyph): "NGN 1,234.50". */
export function pdfMoney(kobo: number, withCode = true, code = getCurrency()): string {
  const s = formatMoney(Math.abs(kobo), code).replace(/[^\d.,]/g, '');
  const sign = kobo < 0 ? '-' : '';
  return withCode ? `${sign}${code} ${s}` : `${sign}${s}`;
}

export function pdfDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function statementFilename(customerName: string, now = Date.now()): string {
  const slug =
    customerName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'customer';
  const d = new Date(now);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `statement-${slug}-${ymd}.pdf`;
}

const TEAL: [number, number, number] = [0.06, 0.46, 0.43];
const MUTED: [number, number, number] = [0.39, 0.45, 0.53];
const RED: [number, number, number] = [0.73, 0.11, 0.11];
const GREEN: [number, number, number] = [0.02, 0.47, 0.34];

/** Build the customer statement PDF (A4, multi-page). */
export function buildStatementPdf(opts: {
  shopName: string;
  customer: Pick<Customer, 'name' | 'phone'>;
  data: StatementData;
  generatedAt?: number;
  /** 'supplier' = what I owe a supplier (default 'customer'). */
  kind?: StatementKind;
}): Uint8Array {
  const { data, customer } = opts;
  const sup = opts.kind === 'supplier';
  const gen = opts.generatedAt ?? Date.now();
  const M = 40;
  const R = A4.w - M;
  const col = { date: M + 6, details: M + 84, credit: 395, payment: 470, balance: R - 6 };
  const pages: PdfPage[] = [];
  let page = new PdfPage();
  let y = 0;

  const tableHeader = () => {
    page.rect(M, y - 6, R - M, 20, [0.94, 0.97, 0.96]);
    page.text(col.date, y, t('pdf.colDate'), 8.5, { bold: true, color: MUTED });
    page.text(col.details, y, t('pdf.colDetails'), 8.5, { bold: true, color: MUTED });
    page.text(col.credit, y, sup ? t('pdf.colPurchase') : t('pdf.colCredit'), 8.5, { bold: true, color: MUTED, align: 'right' });
    page.text(col.payment, y, t('pdf.colPayment'), 8.5, { bold: true, color: MUTED, align: 'right' });
    page.text(col.balance, y, sup ? t('pdf.colIOwe') : t('pdf.colBalance'), 8.5, { bold: true, color: MUTED, align: 'right' });
    y -= 22;
  };

  const newPage = (first: boolean) => {
    page = new PdfPage();
    pages.push(page);
    y = A4.h - M - 14;
    if (first) {
      page.rect(0, A4.h - 8, A4.w, 8, TEAL);
      page.text(M, y, fitText(opts.shopName || 'BashiBook', 20, R - M, true), 20, { bold: true });
      y -= 22;
      page.text(M, y, sup ? t('pdf.supplierTitle') : t('statement.title'), 12, { color: TEAL, bold: true });
      y -= 26;
      page.text(M, y, sup ? t('pdf.supplier') : t('pdf.customer'), 8.5, { color: MUTED });
      page.text(300, y, t('pdf.period'), 8.5, { color: MUTED });
      y -= 14;
      page.text(M, y, fitText(customer.name, 12, 250, true), 12, { bold: true });
      page.text(300, y, `${pdfDate(data.from)} - ${pdfDate(data.to)}`, 11);
      y -= 14;
      if (customer.phone) page.text(M, y, customer.phone, 10, { color: MUTED });
      page.text(300, y, t('pdf.generatedOn', { date: pdfDate(gen) }), 9, { color: MUTED });
      y -= 26;
    } else {
      page.text(M, y, fitText(`${opts.shopName} - ${customer.name}`, 10, R - M, true), 10, { bold: true });
      y -= 22;
    }
    tableHeader();
  };

  newPage(true);
  const ROW = 17;
  const bottom = M + 40;
  const ensure = (h: number) => {
    if (y - h < bottom) newPage(false);
  };

  if (data.openingKobo !== 0 || data.rows.length === 0) {
    ensure(ROW);
    page.text(col.date, y, pdfDate(data.from), 9, { color: MUTED });
    page.text(col.details, y, t('pdf.opening'), 9, { color: MUTED });
    page.text(col.balance, y, pdfMoney(data.openingKobo, false), 9, { align: 'right', color: MUTED });
    y -= ROW;
  }
  if (data.rows.length === 0) {
    page.text(col.details, y, t('statement.noTransactions'), 9, { color: MUTED });
    y -= ROW;
  }
  for (const r of data.rows) {
    ensure(ROW);
    const e = r.entry;
    const label =
      e.type === 'purchase'
        ? t('supplier.purchaseLabel')
        : e.type === 'credit'
          ? t('customer.creditSaleLabel')
          : sup
            ? t('supplier.paymentLabel')
            : t('customer.paymentLabel');
    const details = e.note ? `${label} - ${e.note}` : label;
    page.line(M, y + ROW - 5, R, y + ROW - 5, [0.92, 0.94, 0.96], 0.4);
    page.text(col.date, y, pdfDate(e.occurredAt), 9);
    page.text(col.details, y, fitText(details, 9, col.credit - col.details - 58), 9);
    if (e.type !== 'payment') page.text(col.credit, y, pdfMoney(e.amountKobo, false), 9, { align: 'right', color: RED });
    else page.text(col.payment, y, pdfMoney(e.amountKobo, false), 9, { align: 'right', color: GREEN });
    page.text(col.balance, y, pdfMoney(r.balanceKobo, false), 9, { align: 'right', bold: true });
    y -= ROW;
  }

  ensure(70);
  page.line(M, y + 8, R, y + 8, [0.6, 0.65, 0.7], 0.8);
  y -= 8;
  page.text(col.details, y, t('pdf.totals'), 9, { color: MUTED });
  page.text(col.credit, y, pdfMoney(data.creditTotalKobo, false), 9, { align: 'right', color: RED });
  page.text(col.payment, y, pdfMoney(data.paymentTotalKobo, false), 9, { align: 'right', color: GREEN });
  y -= 30;
  const closing = data.closingKobo;
  const totalLabel = sup
    ? closing > 0
      ? t('pdf.iOweSupplier')
      : closing < 0
        ? t('pdf.supplierOwesMe')
        : t('pdf.settled')
    : closing > 0
      ? t('pdf.totalOwed')
      : closing < 0
        ? t('pdf.shopOwes')
        : t('pdf.settled');
  page.rect(M, y - 10, R - M, 32, closing > 0 ? [0.99, 0.95, 0.95] : [0.93, 0.98, 0.96]);
  page.text(M + 12, y, totalLabel, 12, { bold: true });
  page.text(R - 12, y, pdfMoney(Math.abs(closing)), 14, { bold: true, align: 'right', color: closing > 0 ? RED : GREEN });

  pages.forEach((p, i) => {
    p.line(M, M + 14, R, M + 14, [0.88, 0.9, 0.93], 0.4);
    const host = brandFooterHost();
    // Same 'Recorded in BashiBook · …' line as receipts and reminders, plus the site.
    p.text(M, M, host ? `${t('growth.footer')} · ${host}` : t('growth.footer'), 8, { color: MUTED });
    p.text(R, M, t('pdf.page', { n: String(i + 1), total: String(pages.length) }), 8, { color: MUTED, align: 'right' });
  });
  return buildPdf(pages, `${sup ? t('pdf.supplierTitle') : t('statement.title')} - ${customer.name}`);
}
