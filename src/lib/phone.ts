/**
 * Region-aware phone helpers: which country the shop is in, and turning a local
 * number (leading 0) into the international digits wa.me needs.
 */
import { getCurrency, info } from './money';
import { getCountry } from './region';

/** Calling codes for countries whose local numbers start with a trunk 0. */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  NG: '234', GH: '233', KE: '254', UG: '256', TZ: '255', RW: '250', ZA: '27', ZM: '260',
  ZW: '263', CM: '237', CI: '225', BJ: '229', TG: '228', LR: '231', SL: '232', ET: '251',
  EG: '20', MA: '212', GB: '44', IE: '353', IN: '91', PK: '92', BD: '880', PH: '63',
};

/** Currencies used in many countries (or our fallback): they don't tell us where the shop is. */
const NOT_ONE_COUNTRY = new Set(['USD', 'EUR', 'XOF', 'XAF']);

/**
 * The shop's country: from its currency when that names one country (NGN → NG),
 * otherwise from the phone's region (geo answer / Nigeria device hints). Null when unknown.
 */
export function shopCountry(currency = getCurrency(), region: string | null = getCountry()): string | null {
  if (!NOT_ONE_COUNTRY.has(currency)) {
    const c = info(currency)?.[1];
    if (c) return c;
  }
  return region;
}

export function isNigeriaShop(): boolean {
  return shopCountry() === 'NG';
}

/** Calling code for a leading 0, or null when we don't know (then the number needs a +). */
export function dialCode(country: string | null = shopCountry()): string | null {
  return (country && DIAL_CODES[country]) || null;
}

/**
 * Digits for wa.me. "+…" or "00…" numbers are used as typed; a leading 0 gets the shop
 * country's calling code (0803… → 234803… in Nigeria, 024… → 23324… in Ghana). With an
 * unknown country a leading-0 number is left alone (null → WhatsApp opens without a number).
 */
export function normalizeWhatsAppDigits(phone: string, dial: string | null = dialCode()): string | null {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return digits.length >= 8 ? digits : null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) {
    if (!dial || digits.length < 9) return null;
    digits = dial + digits.slice(1);
  }
  return digits.length >= 10 ? digits : null;
}

/** A local number we can't turn international: ask for the +country code. */
export function needsCountryCode(phone: string, dial: string | null = dialCode()): boolean {
  const raw = phone.trim();
  return !dial && /^0[1-9]/.test(raw.replace(/[\s()-]/g, ''));
}
