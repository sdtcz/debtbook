import { afterEach, describe, expect, it } from 'vitest';
import { CURRENCIES, currencySymbol, formatMoney, formatMoneyWhole, info, parseAmount, quickAmounts, setCurrency } from './money';
import { currencyForCountry, currencyGroups, currencyLabel, defaultCurrency } from './currency';
import { DIAL_CODES, dialCode, normalizeWhatsAppDigits, shopCountry } from './phone';

afterEach(() => setCurrency('NGN'));

// The 54 African UN member states (+ Western Sahara, which uses MAD and +212).
const AFRICA =
  'DZ AO BJ BW BF BI CV CM CF TD KM CD CG DJ EG GQ ER SZ ET GA GM GH GN GW CI KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH'.split(' ');
const ADDED =
  'MWK MZN CDF AOA BIF BWP NAD GMD GNF MGA DZD TND LYD SDG SSP SOS MUR LSL SZL CVE KMF DJF ERN MRU STN SCR LRD SLE ZWG'.split(' ');

describe('African currencies', () => {
  it('every African country maps to a currency', () => {
    const missing = AFRICA.filter((c) => !currencyForCountry(c));
    expect(missing).toEqual([]);
    expect(currencyForCountry('CI')).toBe('XOF');
    expect(currencyForCountry('GA')).toBe('XAF');
    expect(currencyForCountry('EH')).toBe('MAD');
    expect(currencyForCountry('LR')).toBe('LRD');
    expect(currencyForCountry('ZW')).toBe('ZWG');
  });

  it('adds each requested currency once, with a quick-amount scale 0–3', () => {
    for (const c of ADDED) {
      expect(info(c), c).toBeTruthy();
      expect([0, 1, 2, 3]).toContain(info(c)![2]);
    }
    const codes = CURRENCIES.map((c) => c[0]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBe(50);
    expect(quickAmounts('CDF')).toContain('50k');
    expect(quickAmounts('BWP')[0]).toBe('5');
  });

  it('formats and parses every currency: a symbol, at most 2 decimals, round-trips', () => {
    for (const [c] of CURRENCIES) {
      const sym = currencySymbol(c);
      expect(sym, c).toBeTruthy();
      const s = formatMoney(123450, c);
      expect(formatMoney(1234, c), c).not.toMatch(/\d[.,]\d{3}$/); // never 3 decimals (TND, LYD)
      expect(s, c).toContain(sym);
      expect(formatMoneyWhole(123450, c), c).toContain('1');
      expect(parseAmount(`${sym} 1234.5`, c), c).toBe(123450);
      expect(parseAmount(`${c} 2k`, c), c).toBe(200000);
    }
  });

  it('local symbols, and no "$" that could be confused with USD in Liberia / Namibia', () => {
    expect(currencySymbol('LRD')).toBe('L$');
    expect(currencySymbol('NAD')).toBe('N$');
    expect(currencySymbol('ZWG')).toBe('ZiG');
    expect(formatMoney(150000, 'LRD')).toMatch(/^L\$\s?1,500\.00$/);
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('MWK')).toBe('MK');
    expect(formatMoney(1234, 'TND')).toMatch(/12\.34$/);
  });

  it('device-locale defaults pick up the new countries; USD stays selectable', () => {
    expect(defaultCurrency(false, ['en-MW'])).toBe('MWK');
    expect(defaultCurrency(false, ['fr-CD'])).toBe('CDF');
    expect(defaultCurrency(false, ['pt-AO'])).toBe('AOA');
    expect(defaultCurrency(false, ['ar-DZ'])).toBe('DZD');
    expect(defaultCurrency(false, ['en-LR'])).toBe('LRD');
    expect(defaultCurrency(false, ['en-ZW'])).toBe('ZWG');
    expect(defaultCurrency(false, ['fr-BF'])).toBe('XOF');
    expect(info('USD')).toBeTruthy();
  });

  it('picker: African group first, both groups sorted, all 50 present', () => {
    const { africa, other } = currencyGroups();
    expect(africa).toContain('NGN');
    expect(africa).toContain('ZWG');
    expect(other).toEqual(['BDT', 'CAD', 'EUR', 'GBP', 'INR', 'PHP', 'PKR', 'USD']);
    expect(africa).toEqual([...africa].sort());
    expect(africa.length + other.length).toBe(CURRENCIES.length);
    expect(currencyLabel('MWK')).toMatch(/^MWK · MK/);
    for (const c of ['SLE', 'ZWG']) expect(currencyLabel(c)).not.toMatch(new RegExp(`· ${c}$`)); // never "SLE · SLE"
    expect(currencySymbol('SLE')).toBe('Le');
  });
});

describe('dial codes', () => {
  it('only countries with a trunk 0 (libphonenumber nationalPrefix="0")', () => {
    for (const c of 'MW CD NA MG DZ LY SD SS SO ER LR SL EH'.split(' ')) expect(DIAL_CODES[c], c).toBeTruthy();
    // No trunk 0, or the leading 0 is part of the number: stripping it would break numbers.
    for (const c of 'CM CI BJ TG CG GA AO MZ BI BW GM GN TN MU LS SZ CV KM DJ MR ST SC SN BF ML NE GW TD CF GQ'.split(' '))
      expect(DIAL_CODES[c], c).toBeUndefined();
  });

  it('turns local numbers into wa.me digits for the new countries', () => {
    expect(normalizeWhatsAppDigits('0999 123 456', dialCode('MW'))).toBe('265999123456');
    expect(normalizeWhatsAppDigits('081 234 5678', dialCode('CD'))).toBe('243812345678');
    expect(normalizeWhatsAppDigits('081 123 4567', dialCode('NA'))).toBe('264811234567');
    expect(normalizeWhatsAppDigits('07 123 456', dialCode('ER'))).toBe('2917123456');
    expect(normalizeWhatsAppDigits('076 123 456', dialCode('SL'))).toBe('23276123456');
  });

  it("Côte d'Ivoire / Cameroon: a leading 0 is never stripped (+ needed)", () => {
    expect(normalizeWhatsAppDigits('07 07 12 34 56', dialCode('CI'))).toBeNull();
    expect(normalizeWhatsAppDigits('+225 07 07 12 34 56', dialCode('CI'))).toBe('2250707123456');
    expect(normalizeWhatsAppDigits('+237 671 234 567', dialCode('CM'))).toBe('237671234567');
  });

  it('USD shops in Liberia / Zimbabwe and rand shops in Namibia get their own country code', () => {
    expect(shopCountry('USD', 'LR')).toBe('LR');
    expect(dialCode(shopCountry('USD', 'ZW'))).toBe('263');
    expect(shopCountry('LRD', null)).toBe('LR');
    expect(shopCountry('ZAR', 'NA')).toBe('NA');
    expect(shopCountry('ZAR', 'GB')).toBe('ZA');
    expect(shopCountry('ZAR', null)).toBe('ZA');
  });
});
