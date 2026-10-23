/**
 * Region-aware phone helpers: which country the shop is in, and turning a local
 * number (leading 0) into the international digits wa.me needs.
 */
import { getCurrency, info } from './money';
import { getCountry } from './region';

/**
 * Calling codes ONLY for countries whose local numbers are written with a trunk 0 that is
 * dropped after the country code (0803… → +234 803…).
 *
 * Source: Google libphonenumber PhoneNumberMetadata.xml (github.com/google/libphonenumber,
 * master, fetched 22 Oct 2026): every country here has nationalPrefix="0". Countries without
 * it are left out on purpose: their numbers have no trunk 0 (Cameroon 6xx…, Togo 9x…, Angola
 * 9xx…), or the leading 0 is PART of the number (Côte d'Ivoire 07…, Benin 01…, Congo 06…,
 * Gabon), so stripping it would break the number. Numbers typed with + always work.
 */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  // Africa
  NG: '234', GH: '233', KE: '254', UG: '256', TZ: '255', RW: '250', ZA: '27', ZM: '260',
  ZW: '263', LR: '231', SL: '232', ET: '251', EG: '20', MA: '212', EH: '212', MW: '265',
  CD: '243', NA: '264', MG: '261', DZ: '213', LY: '218', SD: '249', SS: '211', SO: '252',
  ER: '291',
  // Elsewhere
  GB: '44', IE: '353', IN: '91', PK: '92', BD: '880', PH: '63',
};

/** Currencies used in many countries (or our fallback): they don't tell us where the shop is. */
const NOT_ONE_COUNTRY = new Set(['USD', 'EUR', 'XOF', 'XAF']);

/** Countries that also use another country's currency (rand in the Common Monetary Area). */
const ALSO_USED_IN: Readonly<Record<string, readonly string[]>> = { ZAR: ['NA', 'LS', 'SZ'] };

/**
 * The shop's country: from its currency when that names one country (NGN → NG),
 * otherwise from the phone's region (geo answer / Nigeria device hints). Null when unknown.
 */
export function shopCountry(currency = getCurrency(), region: string | null = getCountry()): string | null {
  if (region && ALSO_USED_IN[currency]?.includes(region)) return region;
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
    if (!dial || digits.length < 8) return null;
    digits = dial + digits.slice(1);
  }
  return digits.length >= 10 ? digits : null;
}

/** A local number we can't turn international: ask for the +country code. */
export function needsCountryCode(phone: string, dial: string | null = dialCode()): boolean {
  const raw = phone.trim();
  return !dial && /^0[1-9]/.test(raw.replace(/[\s()-]/g, ''));
}
