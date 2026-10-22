import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { en } from '../i18n/locales/en';
import { ha } from '../i18n/locales/ha';
import { yo } from '../i18n/locales/yo';
import { deviceLocale } from './dates';
import { setCurrency } from './money';
import { buildWhatsAppUri } from './sms';
import { dialCode, isNigeriaShop, needsCountryCode, normalizeWhatsAppDigits, shopCountry } from './phone';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => setCurrency('NGN'));

describe('shop country', () => {
  it('comes from a one-country currency, else from the region, else unknown', () => {
    expect(shopCountry('NGN', null)).toBe('NG');
    expect(shopCountry('GHS', 'US')).toBe('GH');
    expect(shopCountry('KES', null)).toBe('KE');
    expect(shopCountry('USD', 'GH')).toBe('GH');
    expect(shopCountry('EUR', null)).toBeNull();
    expect(shopCountry('XOF', 'SN')).toBe('SN');
    expect(shopCountry('USD', null)).toBeNull();
  });

  it('calling codes from a small map; none for unknown or no-trunk-0 countries', () => {
    expect(dialCode('NG')).toBe('234');
    expect(dialCode('GH')).toBe('233');
    expect(dialCode('KE')).toBe('254');
    expect(dialCode('US')).toBeNull();
    expect(dialCode(null)).toBeNull();
  });
});

describe('WhatsApp numbers', () => {
  it('leading 0 gets the shop country code', () => {
    expect(normalizeWhatsAppDigits('0803 123 4567', '234')).toBe('2348031234567');
    expect(normalizeWhatsAppDigits('024 412 3456', '233')).toBe('233244123456');
    expect(normalizeWhatsAppDigits('0712 345678', '254')).toBe('254712345678');
    expect(normalizeWhatsAppDigits('07700 900123', '44')).toBe('447700900123');
  });

  it('+ and 00 numbers are used as typed, in any region', () => {
    expect(normalizeWhatsAppDigits('+233 24 412 3456', '234')).toBe('233244123456');
    expect(normalizeWhatsAppDigits('+2348031234567', null)).toBe('2348031234567');
    expect(normalizeWhatsAppDigits('00 44 7700 900123', '234')).toBe('447700900123');
  });

  it('unknown region: a leading-0 number is left alone (no country guessed)', () => {
    expect(normalizeWhatsAppDigits('0803 123 4567', null)).toBeNull();
    expect(needsCountryCode('0803 123 4567', null)).toBe(true);
    expect(needsCountryCode('+234 803 123 4567', null)).toBe(false);
    expect(needsCountryCode('0803 123 4567', '234')).toBe(false);
  });

  it('follows the shop currency: NGN → 234, GHS → 233, USD with no region → no number in the link', () => {
    setCurrency('NGN');
    expect(isNigeriaShop()).toBe(true);
    expect(buildWhatsAppUri('0803 123 4567', 'hi')).toBe('https://wa.me/2348031234567?text=hi');
    setCurrency('GHS');
    expect(isNigeriaShop()).toBe(false);
    expect(buildWhatsAppUri('024 412 3456', 'hi')).toBe('https://wa.me/233244123456?text=hi');
    setCurrency('USD');
    expect(buildWhatsAppUri('0803 123 4567', 'hi')).toBeNull();
    store.set('bashibook-region', JSON.stringify({ c: 'KE', at: Date.now() }));
    expect(buildWhatsAppUri('0712 345678', 'hi')).toBe('https://wa.me/254712345678?text=hi');
  });
});

describe('region-aware placeholders', () => {
  it('Nigeria keeps Opay/GTBank and 080 examples; others are neutral in en/ha/yo', () => {
    for (const L of [en, ha, yo] as Record<string, string>[]) {
      expect(L['settings.payBankPlaceholder']).toContain('Opay');
      expect(L['customerForm.phonePlaceholder']).toContain('0803');
      for (const k of ['settings.payBankPlaceholderAny', 'settings.payAccountPlaceholderAny', 'settings.payLinkPlaceholderAny', 'customerForm.phonePlaceholderAny']) {
        expect(L[k], k).toBeTruthy();
        expect(L[k], k).not.toMatch(/Opay|GTBank|Palmpay|Paystack|080/);
      }
      expect(L['customerForm.phonePlaceholderAny']).toContain('+');
    }
  });
});

describe('dates', () => {
  it('use the device locale, not a fixed en-NG', () => {
    expect(deviceLocale(['en-US', 'fr'])).toBe('en-US');
    expect(deviceLocale(['', 'de-DE'])).toBe('de-DE');
    expect(deviceLocale([])).toBeUndefined();
    const d = new Date(2026, 9, 5);
    expect(d.toLocaleDateString(deviceLocale(['en-US']))).toBe('10/5/2026');
    expect(d.toLocaleDateString(deviceLocale(['en-GB']))).toBe('05/10/2026');
  });

  it('no source file formats dates with a hardcoded en-NG', () => {
    const files = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(30);
    const hits = Object.entries(files).filter(([, src]) => /toLocale(Date|Time)?String\(\s*'en-NG'/.test(src));
    expect(hits.map(([f]) => f)).toEqual([]);
  });
});
