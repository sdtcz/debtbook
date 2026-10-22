import { describe, expect, it } from 'vitest';
import { buildStatementData, buildStatementPdf, pdfMoney, resolveRange, statementFilename } from './statementPdf';
import { pdfSafeText, fitText, textWidth, A4 } from './pdf';
import { PUBLIC_APP_URL } from '../config';
import type { Entry } from './types';

const day = 86_400_000;
const t0 = new Date(2026, 9, 1, 10).getTime();
let n = 0;
const e = (type: 'credit' | 'payment', naira: number, at: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${++n}`,
  customerId: 'c1',
  type,
  amountKobo: naira * 100,
  occurredAt: at,
  createdAt: at,
  updatedAt: at,
  ...extra,
});

const entries = [
  e('payment', 2000, t0 + 2 * day),
  e('credit', 5000, t0),
  e('credit', 1500, t0 + 5 * day, { note: 'Rice (big bag)' }),
  e('credit', 9999, t0 + 3 * day, { deletedAt: t0 + 4 * day }),
];

describe('buildStatementData', () => {
  it('sorts oldest first, skips deleted entries and keeps a running balance', () => {
    const d = buildStatementData(entries, { to: t0 + 10 * day });
    expect(d.rows.map((r) => r.balanceKobo)).toEqual([500000, 300000, 450000]);
    expect(d.openingKobo).toBe(0);
    expect(d.closingKobo).toBe(450000);
    expect(d.creditTotalKobo).toBe(650000);
    expect(d.paymentTotalKobo).toBe(200000);
    expect(d.from).toBe(t0);
  });

  it('carries an opening balance forward when a range starts later', () => {
    const d = buildStatementData(entries, { from: t0 + day, to: t0 + 10 * day });
    expect(d.openingKobo).toBe(500000);
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0].balanceKobo).toBe(300000);
    expect(d.closingKobo).toBe(450000);
    expect(d.creditTotalKobo).toBe(150000);
  });

  it('ignores entries after the end of the period', () => {
    const d = buildStatementData(entries, { to: t0 + 3 * day });
    expect(d.closingKobo).toBe(300000);
  });

  it('handles customers with no entries', () => {
    const d = buildStatementData([], { to: t0 });
    expect(d.rows).toEqual([]);
    expect(d.closingKobo).toBe(0);
  });
});

describe('resolveRange', () => {
  const now = new Date(2026, 9, 20, 15, 30).getTime();
  it('all time has no start', () => expect(resolveRange('all', now).from).toBeNull());
  it('this month starts on the 1st', () =>
    expect(resolveRange('thisMonth', now).from).toBe(new Date(2026, 9, 1).getTime()));
  it('last 30 days includes today', () =>
    expect(resolveRange('last30', now).from).toBe(new Date(2026, 8, 21).getTime()));
});

describe('pdf text helpers', () => {
  it('uses NGN instead of the ₦ glyph and transliterates Hausa/Yoruba letters', () => {
    expect(pdfMoney(123450)).toBe('NGN 1,234.50');
    expect(pdfMoney(-5000, false)).toBe('-50.00');
    expect(pdfSafeText('₦500')).toBe('NGN 500');
    expect(pdfSafeText('Ɗan Ƙasa ɓera')).toBe('Dan Kasa bera');
    expect(pdfSafeText('Àkọọ́lẹ̀ Ọlá')).toBe('Akoole Ola');
    expect(pdfSafeText('emoji 😀 ok')).toBe('emoji ? ok');
    expect(pdfSafeText('Café')).toBe('Cafe');
  });
  it('fits long text with an ellipsis', () => {
    const s = fitText('x'.repeat(200), 10, 100);
    expect(s.endsWith('...')).toBe(true);
    expect(textWidth(s, 10)).toBeLessThanOrEqual(100);
  });
  it('builds a safe filename', () => {
    expect(statementFilename('Mama Ọlá & Sons!', new Date(2026, 9, 20).getTime())).toBe(
      'statement-mama-ola-sons-2026-10-20.pdf',
    );
  });
});

function pdfText(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe('buildStatementPdf', () => {
  const data = buildStatementData(entries, { to: t0 + 10 * day });
  const bytes = buildStatementPdf({
    shopName: 'Mama Nkechi Store (Ikeja)',
    customer: { name: 'Tunde Ọlá', phone: '08031234567' },
    data,
    generatedAt: t0 + 10 * day,
  });
  const s = pdfText(bytes);

  it('is a well-formed PDF with a valid xref table', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...s.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((off, i) => expect(s.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true));
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
  });

  it('contains shop, customer, entries, running balance and total owed (ASCII only)', () => {
    expect([...bytes].every((b) => b < 128)).toBe(true);
    expect(s).toContain('(Mama Nkechi Store \\(Ikeja\\))');
    expect(s).toContain('(Tunde Ola)');
    expect(s).toContain('(08031234567)');
    expect(s).toContain('(Credit sale - Rice \\(big bag\\))');
    expect(s).toContain('(3,000.00)');
    expect(s).toContain('(Total owed)');
    expect(s).toContain('(NGN 4,500.00)');
    expect(s).not.toContain('9,999');
  });

  it('footer matches the Recorded-in line used in messages, plus the site', () => {
    const host = PUBLIC_APP_URL.replace(/^https?:\/\//, '');
    expect(s).toContain(`(Recorded in BashiBook \\267 free credit book for small shops \\267 ${host})`);
    // Footer (left) and page number (right) must not overlap on A4.
    const footer = `Recorded in BashiBook · free credit book for small shops · ${host}`;
    expect(40 + textWidth(footer, 8) + 10).toBeLessThan(A4.w - 40 - textWidth('Page 10 of 10', 8));
  });

  it('paginates long histories', () => {
    const many = Array.from({ length: 120 }, (_, i) => e('credit', 100, t0 + i * 1000));
    const big = pdfText(
      buildStatementPdf({ shopName: 'S', customer: { name: 'C' }, data: buildStatementData(many, { to: t0 + day }) }),
    );
    const pageCount = Number(big.match(/\/Count (\d+)/)![1]);
    expect(pageCount).toBeGreaterThanOrEqual(3);
    expect(big).toContain(`(Page 1 of ${pageCount})`);
  });
});

describe('supplier statement PDF', () => {
  const lines = [
    { id: 'p1', type: 'purchase' as const, amountKobo: 800000, occurredAt: t0, createdAt: t0, updatedAt: t0, note: 'Rice x5' },
    { id: 'p2', type: 'payment' as const, amountKobo: 300000, occurredAt: t0 + day, createdAt: t0, updatedAt: t0 },
  ];
  const data = buildStatementData(lines, { to: t0 + 10 * day });
  const s = pdfText(
    buildStatementPdf({ shopName: 'Shop', customer: { name: 'Alhaji Musa' }, data, generatedAt: t0 + 10 * day, kind: 'supplier' }),
  );
  it('uses supplier wording and the I-owe balance', () => {
    expect(data.closingKobo).toBe(500000);
    expect(s).toContain('(Supplier Statement)');
    expect(s).toContain('(SUPPLIER)');
    expect(s).toContain('(I owe this supplier)');
    expect(s).toContain('(Bought on credit - Rice x5)');
    expect(s).toContain('(NGN 5,000.00)');
    expect(s).not.toContain('(Total owed)');
  });
});
