/**
 * Pro price list and the currency the web (Stripe) checkout shows.
 *
 * Rules (FCCPA, BashiBook Legal, decided by Stephen 2026-11-17):
 *  - One currency at a time. The switch REPLACES the price; we never show both side by side.
 *  - Nigerian visitors default to naira; everyone else to USD. Anyone can switch.
 *  - Naira is ₦1,500/mo and ₦12,000/yr with 7.5% VAT added ON TOP; the screen says "+ 7.5% VAT"
 *    and shows the total (₦1,612.50 / ₦12,900) before payment, and Stripe charges that total.
 *  - Naira only appears when the build flag NGN_PRICING=1 is on (server checkout reads the same
 *    env var). Off = USD only, exactly as before.
 *
 * Amounts are minor units (cents / kobo). Keep in sync with api/checkout.ts (a test checks).
 */
export type ProCurrency = 'USD' | 'NGN';
export type ProPlanId = 'monthly' | 'yearly';

export const PRO_PRICE_MINOR: Record<ProCurrency, Record<ProPlanId, number>> = {
  USD: { monthly: 199, yearly: 1500 },
  NGN: { monthly: 150000, yearly: 1200000 },
};

/** VAT added on top of the naira price (exclusive). USD has none. */
export const VAT_RATE: Record<ProCurrency, number> = { USD: 0, NGN: 0.075 };

export function vatMinor(cur: ProCurrency, plan: ProPlanId): number {
  return Math.round(PRO_PRICE_MINOR[cur][plan] * VAT_RATE[cur]);
}

/** What Stripe charges: price + VAT. */
export function totalMinor(cur: ProCurrency, plan: ProPlanId): number {
  return PRO_PRICE_MINOR[cur][plan] + vatMinor(cur, plan);
}

/** "$1.99", "$15", "₦1,500", "₦1,612.50", "₦12,900" (cents only when not whole). */
export function formatProMoney(cur: ProCurrency, minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  const body = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (cents ? `.${String(cents).padStart(2, '0')}` : '');
  return (cur === 'NGN' ? '₦' : '$') + body;
}

/** Build flag: naira shows only when checkout can charge it. */
export function ngnPricingEnabled(): boolean {
  return typeof __NGN_PRICING__ !== 'undefined' && __NGN_PRICING__ === true;
}

const KEY = 'bashibook-pro-currency';

/** Pure choice: flag off → USD; a saved switch wins; else NGN for Nigeria, USD elsewhere. */
export function pickProCurrency(opts: { enabled: boolean; saved?: string | null; country?: string | null }): ProCurrency {
  if (!opts.enabled) return 'USD';
  if (opts.saved === 'USD' || opts.saved === 'NGN') return opts.saved;
  return opts.country === 'NG' ? 'NGN' : 'USD';
}

function savedChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Currency to show now (country = cached /api/geo answer or device hint). */
export function proCurrency(country: string | null): ProCurrency {
  return pickProCurrency({ enabled: ngnPricingEnabled(), saved: savedChoice(), country });
}

export function saveProCurrency(cur: ProCurrency): void {
  try {
    localStorage.setItem(KEY, cur);
  } catch {
    /* private mode: choice lasts for this page only */
  }
}

/** Everything one plan card / pay button needs, in ONE currency. */
export interface ProPriceView {
  currency: ProCurrency;
  plan: ProPlanId;
  /** Price before VAT, e.g. "₦1,500". */
  price: string;
  /** VAT amount, e.g. "₦112.50"; '' when none. */
  vat: string;
  /** What will be charged, e.g. "₦1,612.50". Same as price when no VAT. */
  total: string;
  hasVat: boolean;
}

export function proPriceView(cur: ProCurrency, plan: ProPlanId): ProPriceView {
  const v = vatMinor(cur, plan);
  return {
    currency: cur,
    plan,
    price: formatProMoney(cur, PRO_PRICE_MINOR[cur][plan]),
    vat: v ? formatProMoney(cur, v) : '',
    total: formatProMoney(cur, totalMinor(cur, plan)),
    hasVat: v > 0,
  };
}
