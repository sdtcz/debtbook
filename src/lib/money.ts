import { t } from '../i18n';
/** Naira formatting helpers. Store amounts in kobo (integer). */

const NGN = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NGN_COMPACT = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format kobo as ₦1,234.56 */
export function formatNaira(kobo: number): string {
  return NGN.format(kobo / 100);
}

/** Format kobo as ₦1,235 (no kobo) for large dashboard totals */
export function formatNairaWhole(kobo: number): string {
  return NGN_COMPACT.format(Math.round(kobo / 100));
}

/**
 * Parse user input into kobo.
 * Accepts: "1500", "1,500.50", "₦500", "3k", "3K", "1.5k" (k = ×1000 naira).
 */
export function parseNairaToKobo(input: string): number | null {
  let cleaned = input.replace(/[₦\s,]/g, '').trim();
  if (!cleaned) return null;

  let multiplier = 1;
  if (/k$/i.test(cleaned)) {
    cleaned = cleaned.slice(0, -1);
    multiplier = 1000;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const naira = Number(cleaned) * multiplier;
  if (!Number.isFinite(naira) || naira < 0) return null;
  return Math.round(naira * 100);
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
