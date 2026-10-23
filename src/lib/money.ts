import { setAutoVars, t } from '../i18n';
/**
 * Money helpers for the shop's currency (a shop setting; NGN for existing shops).
 * Amounts are stored as integers in hundredths of the currency (field names say "kobo" for
 * history), so changing the display currency never changes stored numbers.
 */

/**
 * [ISO code, home country, quick-amount scale 0–3] — the currencies a shop can pick.
 * Scale ≈ units per US dollar: 0 = under ~30 (5…100), 1 = ~30–300 (50…1k),
 * 2 = ~300–2,000 (500…10k), 3 = over ~2,000 (1k…50k). Countries sharing a currency
 * (XOF, XAF, EUR…) are mapped in currency.ts SHARED.
 */
export const CURRENCIES: readonly (readonly [string, string, number])[] = [
  ['NGN', 'NG', 2], ['GHS', 'GH', 0], ['KES', 'KE', 1], ['UGX', 'UG', 3], ['TZS', 'TZ', 3],
  ['RWF', 'RW', 2], ['ZAR', 'ZA', 1], ['ZMW', 'ZM', 0], ['XOF', 'SN', 2], ['XAF', 'CM', 2],
  ['EGP', 'EG', 1], ['MAD', 'MA', 0], ['ETB', 'ET', 1], ['USD', 'US', 0], ['EUR', 'IE', 0],
  ['GBP', 'GB', 0], ['CAD', 'CA', 0], ['INR', 'IN', 1], ['PKR', 'PK', 2], ['BDT', 'BD', 1],
  ['PHP', 'PH', 1],
  // Rest of Africa (Oct 2026). NAD/LSL/SZL are pegged 1:1 to ZAR, so they share its scale.
  ['MWK', 'MW', 2], ['MZN', 'MZ', 1], ['CDF', 'CD', 3], ['AOA', 'AO', 2], ['BIF', 'BI', 3],
  ['BWP', 'BW', 0], ['NAD', 'NA', 1], ['GMD', 'GM', 1], ['GNF', 'GN', 3], ['MGA', 'MG', 3],
  ['DZD', 'DZ', 1], ['TND', 'TN', 0], ['LYD', 'LY', 0], ['SDG', 'SD', 2], ['SSP', 'SS', 3],
  ['SOS', 'SO', 2], ['MUR', 'MU', 1], ['LSL', 'LS', 1], ['SZL', 'SZ', 1], ['CVE', 'CV', 1],
  ['KMF', 'KM', 2], ['DJF', 'DJ', 1], ['ERN', 'ER', 0], ['MRU', 'MR', 1], ['STN', 'ST', 0],
  ['SCR', 'SC', 0], ['LRD', 'LR', 1], ['SLE', 'SL', 0], ['ZWG', 'ZW', 0],
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

/**
 * Symbols we set ourselves: Intl gives a bare "$" for the Liberian and Namibian dollars
 * (same as USD, which Liberia also uses), and some browsers know no symbol for the newer
 * Zimbabwe Gold (2024) and Sierra Leone leone (2022) codes.
 */
const SYMBOL: Readonly<Record<string, string>> = { LRD: 'L$', NAD: 'N$', ZWG: 'ZiG', SLE: 'Le' };

function show(f: Intl.NumberFormat, code: string, n: number): string {
  const own = SYMBOL[code];
  if (!own) return f.format(n);
  return f
    .formatToParts(n)
    .map((p) => (p.type === 'currency' ? own : p.value))
    .join('');
}

function make(loc: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  for (const [l, o] of [[loc, opts], ['en', opts], ['en', { ...opts, currencyDisplay: 'code' }]] as const) {
    try {
      return new Intl.NumberFormat(l, o);
    } catch {
      /* unknown locale / option / code in this browser: try a safer one */
    }
  }
  // Last resort: plain number (the code is shown as the symbol, see currencySymbol).
  return new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function symbolOf(f: Intl.NumberFormat): string {
  return f.formatToParts(0).find((p) => p.type === 'currency')?.value || '';
}

function pick(f: Intl.NumberFormat): Intl.NumberFormatOptions {
  const r = f.resolvedOptions();
  return { minimumFractionDigits: r.minimumFractionDigits, maximumFractionDigits: r.maximumFractionDigits };
}

function nf(code: string, whole = false): Intl.NumberFormat {
  const key = `${code}|${whole}`;
  let f = fmts.get(key);
  if (!f) {
    // Format in the currency's home locale so the symbol is the local one (₦, GH₵, Ksh, R, $, €…).
    const loc = `en-${info(code)?.[1] || 'US'}`;
    const opts: Intl.NumberFormatOptions = { style: 'currency', currency: code };
    if (whole) opts.minimumFractionDigits = opts.maximumFractionDigits = 0;
    f = make(loc, opts);
    // Amounts are kept in hundredths: never show 3 decimals (TND, LYD…).
    if ((f.resolvedOptions().maximumFractionDigits ?? 2) > 2) f = make(loc, { ...opts, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // No local symbol for this locale (shows the bare code): use the short symbol if the browser has one (AOA → Kz).
    if (symbolOf(f) === code) {
      const narrow = make('en', { ...opts, ...pick(f), currencyDisplay: 'narrowSymbol' });
      const sym = symbolOf(narrow);
      if (sym !== code && /^[^\d\s]{1,4}$/.test(sym)) f = narrow;
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
  return SYMBOL[code] || symbolOf(nf(code)) || code;
}

/** Quick-amount chips for the money input, sized to the currency. */
export function quickAmounts(code = current): string[] {
  return QUICK[info(code)?.[2] ?? 2];
}

/** Format hundredths as e.g. ₦1,234.56 / GH₵12.50 / USh1,235 in the shop currency. */
export function formatMoney(minor: number, code = current): string {
  return show(nf(code), code, minor / 100);
}

/** Whole units, no decimals, for large dashboard totals. */
export function formatMoneyWhole(minor: number, code = current): string {
  return show(nf(code, true), code, Math.round(minor / 100));
}

/**
 * Parse user input into hundredths.
 * Accepts: "1500", "1,500.50", "₦500", "GH₵ 20", "3k", "1.5k" (k = ×1000).
 */
export function parseAmount(input: string, code = current): number | null {
  let cleaned = input.replace(/[\s,]/g, '');
  // Code first ("ZAR" contains the rand's symbol "R"), then the symbol, then any currency sign.
  cleaned = cleaned.replace(new RegExp(code, 'gi'), '');
  const sym = currencySymbol(code).replace(/\s/g, '');
  if (sym) cleaned = cleaned.split(sym).join('');
  cleaned = cleaned.replace(/\p{Sc}/gu, '');
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
