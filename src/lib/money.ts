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

/** Parse user input like "1,500.50" or "1500" into kobo. Returns null if invalid. */
export function parseNairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦\s,]/g, '').trim();
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const naira = Number(cleaned);
  if (!Number.isFinite(naira) || naira < 0) return null;
  return Math.round(naira * 100);
}

/** Balance label: positive = customer owes, negative = shop owes */
export function balanceLabel(kobo: number): string {
  if (kobo > 0) return 'owes you';
  if (kobo < 0) return 'you owe';
  return 'settled';
}

export function balanceTone(kobo: number): 'debt' | 'credit' | 'zero' {
  if (kobo > 0) return 'debt';
  if (kobo < 0) return 'credit';
  return 'zero';
}
