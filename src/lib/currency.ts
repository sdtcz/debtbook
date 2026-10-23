/** Currency picking (setup, settings, landing) — kept out of the main bundle. */
import { CURRENCIES, currencySymbol } from './money';

// Other countries that use a listed currency.
const SHARED: Record<string, string> = {
  CI: 'XOF', BJ: 'XOF', TG: 'XOF', BF: 'XOF', ML: 'XOF', NE: 'XOF', GW: 'XOF',
  GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF',
  EH: 'MAD',
  FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR',
};

/** Currency for a country code, or null when it is not on the list. */
export function currencyForCountry(country: string | null | undefined): string | null {
  const c = (country || '').toUpperCase();
  return CURRENCIES.find((x) => x[1] === c)?.[0] || SHARED[c] || null;
}

/** Default for a new shop: NGN in Nigeria, otherwise from the device locale (e.g. en-GH → GHS), else USD. */
export function defaultCurrency(nigeria: boolean, languages: readonly string[] = deviceLanguages()): string {
  if (nigeria) return 'NGN';
  for (const l of languages) {
    const m = /[-_]([A-Za-z]{2})$/.exec(l || '');
    const cur = m && currencyForCountry(m[1]);
    if (cur) return cur;
  }
  return 'USD';
}

function deviceLanguages(): readonly string[] {
  try {
    return navigator.languages?.length ? navigator.languages : [navigator.language];
  } catch {
    return [];
  }
}

// Home countries (CURRENCIES column 2) that are in Africa: their currencies form the first picker group.
const AFRICA = new Set(
  'NG GH KE UG TZ RW ZA ZM SN CM EG MA ET MW MZ CD AO BI BW NA GM GN MG DZ TN LY SD SS SO MU LS SZ CV KM DJ ER MR ST SC LR SL ZW'.split(' '),
);

/** Picker groups, each sorted by code: African currencies first, then the rest. */
export function currencyGroups(): { africa: string[]; other: string[] } {
  const africa: string[] = [];
  const other: string[] = [];
  for (const [code, country] of CURRENCIES) (AFRICA.has(country) ? africa : other).push(code);
  return { africa: africa.sort(), other: other.sort() };
}

const NEW_NAMES: Record<string, string> = { SLE: 'Sierra Leonean Leone', ZWG: 'Zimbabwe Gold', MRU: 'Mauritanian Ouguiya', STN: 'São Tomé & Príncipe Dobra' };

/** "NGN · ₦ · Nigerian Naira" style label for pickers (name from the browser when it knows it). */
export function currencyLabel(code: string, locale = 'en'): string {
  let name = '';
  try {
    name = new Intl.DisplayNames([locale, 'en'], { type: 'currency' }).of(code) || '';
  } catch {
    /* old browser: code + symbol is enough */
  }
  // Newer codes some browsers can't name yet.
  if (!name || name === code) name = NEW_NAMES[code] || '';
  const sym = currencySymbol(code);
  return [code, sym !== code ? sym : '', name].filter(Boolean).join(' · ');
}
