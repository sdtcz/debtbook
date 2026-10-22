import { setAutoVars, t } from '../i18n';
/**
 * Money helpers for the shop's currency (a shop setting; NGN for existing shops).
 * Amounts are stored as integers in hundredths of the currency (field names say "kobo" for
 * history), so changing the display currency never changes stored numbers.
 */

/** [ISO code, home country, quick-amount scale 0–3] — the currencies a shop can pick. */
export const CURRENCIES: readonly (readonly [string, string, number])[] = [
  ['NGN', 'NG', 2], ['GHS', 'GH', 0], ['KES', 'KE', 1], ['UGX', 'UG', 3], ['TZS', 'TZ', 3],
  ['RWF', 'RW', 2], ['ZAR', 'ZA', 1], ['ZMW', 'ZM', 0], ['XOF', 'SN', 2], ['XAF', 'CM', 2],
  ['EGP', 'EG', 1], ['MAD', 'MA', 0], ['ETB', 'ET', 1], ['USD', 'US', 0], ['EUR', 'IE', 0],
  ['GBP', 'GB', 0], ['CAD', 'CA', 0], ['INR', 'IN', 1], ['PKR', 'PK', 2], ['BDT', 'BD', 1],
  ['PHP', 'PH', 1],
];
const QUICK = [
  ['5', '10', '20', '50', '100'],
  ['50', '100', '200', '500', '1k'],
  ['500', '1k', '2k', '5k', '10k'],
  ['1k', '5k', '10k', '20k', '50k'],
];

export const DEFAULT_CURRENCY = 'NGN';

export function info(code: string) {
  return CURRENCIES.find((c) => c[0] === code);
}

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === 'string' && !!info(code);
}

let current = DEFAULT_CURRENCY;
const fmts = new Map<string, Intl.NumberFormat>();

function nf(code: string, whole = false): Intl.NumberFormat {
  const key = `${code}|${whole}`;
  let f = fmts.get(key);
  if (!f) {
    // Format in the currency's home locale so the symbol is the local one (₦, GH₵, Ksh, R, $, €…).
    const loc = `en-${info(code)?.[1] || 'US'}`;
    const opts: Intl.NumberFormatOptions = { style: 'currency', currency: code };
    if (whole) opts.minimumFractionDigits = opts.maximumFractionDigits = 0;
    try {
      f = new Intl.NumberFormat(loc, opts);
    } catch {
      f = new Intl.NumberFormat('en', opts);
    }
    fmts.set(key, f);
  }
  return f;
}

export function getCurrency(): string {
  return current;
}

/** Switch the display currency (from the shop profile). Unknown / missing → NGN (existing shops). */
export function setCurrency(code: string | null | undefined): void {
  current = isSupportedCurrency(code) ? code : DEFAULT_CURRENCY;
  setAutoVars({ sym: currencySymbol(), code: current, zero: formatMoney(0) });
}

export function currencySymbol(code = current): string {
  return nf(code).formatToParts(0).find((p) => p.type === 'currency')?.value || code;
}

/** Quick-amount chips for the money input, sized to the currency. */
export function quickAmounts(code = current): string[] {
  return QUICK[info(code)?.[2] ?? 2];
}

/** Format hundredths as e.g. ₦1,234.56 / GH₵12.50 / USh1,235 in the shop currency. */
export function formatMoney(minor: number, code = current): string {
  return nf(code).format(minor / 100);
}

/** Whole units, no decimals, for large dashboard totals. */
export function formatMoneyWhole(minor: number, code = current): string {
  return nf(code, true).format(Math.round(minor / 100));
}

/**
 * Parse user input into hundredths.
 * Accepts: "1500", "1,500.50", "₦500", "GH₵ 20", "3k", "1.5k" (k = ×1000).
 */
export function parseAmount(input: string, code = current): number | null {
  let cleaned = input.replace(/[\s,]/g, '');
  const sym = currencySymbol(code).replace(/\s/g, '');
  if (sym) cleaned = cleaned.split(sym).join('');
  cleaned = cleaned.replace(new RegExp(code, 'gi'), '').replace(/\p{Sc}/gu, '');
  if (!cleaned) return null;

  let multiplier = 1;
  if (/k$/i.test(cleaned)) {
    cleaned = cleaned.slice(0, -1);
    multiplier = 1000;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const units = Number(cleaned) * multiplier;
  if (!Number.isFinite(units) || units < 0) return null;
  return Math.round(units * 100);
}

/** Balance label: positive = customer owes, negative = shop owes */
export function balanceLabel(kobo: number): string {
  if (kobo > 0) return t('balance.owesYou');
  if (kobo < 0) return t('balance.youOwe');
  return t('balance.settled');
}

export function balanceTone(kobo: number): 'debt' | 'credit' | 'zero' {
  if (kobo > 0) return 'debt';
  if (kobo < 0) return 'credit';
  return 'zero';
}

setCurrency(DEFAULT_CURRENCY);
