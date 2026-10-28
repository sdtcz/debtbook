import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { currencySymbol, formatMoney, getCurrency, isSupportedCurrency, parseAmount, quickAmounts, setCurrency } from './money';
import { currencyForCountry, defaultCurrency } from './currency';
import { buildPayMeMessage, buildPayMePageUrl } from './payMe';
import { pdfMoney } from './statementPdf';

afterEach(() => setCurrency('NGN'));

describe('shop currency', () => {
  it('existing shops (NGN or no currency saved) keep Naira formatting exactly', () => {
    setCurrency(undefined);
    expect(getCurrency()).toBe('NGN');
    expect(formatMoney(500000)).toBe('₦5,000'); // whole naira: no .00 (QW-D)
    expect(formatMoney(500050)).toBe('₦5,000.50');
    setCurrency('XYZ'); // unknown → NGN
    expect(formatMoney(150)).toBe('₦1.50');
  });

  it('defaults: NGN in Nigeria, otherwise from the device locale, else USD', () => {
    expect(defaultCurrency(true, ['en-US'])).toBe('NGN');
    expect(defaultCurrency(false, ['en-GH'])).toBe('GHS');
    expect(defaultCurrency(false, ['sw-KE', 'en'])).toBe('KES');
    expect(defaultCurrency(false, ['fr-CI'])).toBe('XOF');
    expect(defaultCurrency(false, ['de-DE'])).toBe('EUR');
    expect(defaultCurrency(false, ['en'])).toBe('USD');
    expect(defaultCurrency(false, ['en-NG'])).toBe('NGN'); // locale says Nigeria even if geo did not
    expect(currencyForCountry('zz')).toBeNull();
    expect(isSupportedCurrency('KES')).toBe(true);
  });

  it('formats with the local symbol and the currency’s own decimals', () => {
    setCurrency('GHS');
    expect(formatMoney(1250)).toMatch(/^GH₵\s?12\.50$/);
    setCurrency('UGX');
    expect(formatMoney(150000)).not.toMatch(/\.\d\d$/); // shilling has no cents
    setCurrency('USD');
    expect(formatMoney(199)).toBe('$1.99');
    expect(formatMoney(500)).toBe('$5.00'); // USD keeps cents
    expect(formatMoney(150000, 'KES')).toMatch(/1,500$/);
    expect(currencySymbol()).toBe('$');
  });

  it('parses amounts typed with any symbol / code and the k shorthand', () => {
    setCurrency('GHS');
    expect(parseAmount('GH₵ 20')).toBe(2000);
    expect(parseAmount('ghs 3k')).toBe(300000);
    expect(parseAmount('₦500')).toBe(50000); // any currency sign is ignored
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('k')).toBeNull();
    setCurrency('KES');
    expect(parseAmount('Ksh1,500.50')).toBe(150050);
  });

  it('quick amounts fit the currency', () => {
    expect(quickAmounts('NGN')).toEqual(['500', '1k', '2k', '5k', '10k']);
    expect(quickAmounts('USD')[0]).toBe('5');
    expect(quickAmounts('UGX')).toContain('50k');
  });

  it('strings use the shop currency, not a hardcoded ₦', () => {
    expect(t('money.hint')).toBe('NGN (₦) — tip: type 3k for ₦3,000');
    setCurrency('KES');
    expect(t('money.hint')).toContain('KES');
    expect(t('money.hint')).not.toContain('₦');
    expect(t('pdf.colCredit')).toBe('Credit (KES)');
    expect(t('statement.balanceSettled')).not.toContain('₦');
    expect(pdfMoney(123450)).toBe('KES 1,234.50');
    expect(pdfMoney(-5000, false)).toBe('-50.00');
  });

  it('Pay-me links carry cur= for non-Naira shops; old links mean NGN', () => {
    const shop = { name: 'S', payBankName: 'B', payAccountNumber: '1', payAccountName: 'N', payLinkUrl: '' };
    expect(buildPayMePageUrl({ origin: 'https://x', shop, amountKobo: 100 })).not.toContain('cur=');
    setCurrency('GHS');
    expect(buildPayMePageUrl({ origin: 'https://x', shop, amountKobo: 100 })).toContain('cur=GHS');
    expect(buildPayMeMessage({ shop, customerName: 'A', balanceKobo: 2000 })).toMatch(/GH₵\s?20\.00/);
  });
});

describe('Pay-me page route', () => {
  it('reads cur= (default NGN for old links)', async () => {
    const { parseHash } = await import('./router');
    const g = globalThis as { location?: unknown };
    const prev = g.location;
    g.location = { hash: '#/payme?shop=S&amountKobo=100' };
    expect(parseHash()).toMatchObject({ name: 'payme', currency: 'NGN' });
    g.location = { hash: '#/payme?shop=S&amountKobo=100&cur=KES' };
    expect(parseHash()).toMatchObject({ name: 'payme', currency: 'KES' });
    g.location = { hash: '#/payme?cur=<b>' };
    expect(parseHash()).toMatchObject({ currency: 'NGN' });
    g.location = prev;
  });
});
