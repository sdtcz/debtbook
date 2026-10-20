import { beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL, publicUrl } from '../config';
import { initLocale, setLocale } from '../i18n';
import { buildPayMePageUrl } from './payMe';
import { buildEntryReceiptMessage } from './sms';

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
  initLocale('en');
  setLocale('en');
});

describe('entry receipt', () => {
  it('credit receipt shows amount, note and balance owed', () => {
    const msg = buildEntryReceiptMessage({
      shopName: 'Mama Ngozi',
      customerName: 'Tunde',
      type: 'credit',
      amountKobo: 250000,
      balanceKobo: 400000,
      note: '2 bags rice',
      at: new Date(2026, 9, 19).getTime(),
    });
    expect(msg).toContain('Tunde');
    expect(msg).toContain('Mama Ngozi');
    expect(msg).toContain('credit sale');
    expect(msg).toMatch(/2,500/);
    expect(msg).toContain('2 bags rice');
    expect(msg).toMatch(/Balance owed: .*4,000/);
  });

  it('payment receipt that settles the account', () => {
    const msg = buildEntryReceiptMessage({
      shopName: 'Shop',
      customerName: 'Ada',
      type: 'payment',
      amountKobo: 100000,
      balanceKobo: 0,
    });
    expect(msg).toContain('received your payment');
    expect(msg).toContain('settled');
    expect(msg).not.toContain('Note:');
  });
});

describe('public URL config', () => {
  it('has no trailing slash and builds hash routes', () => {
    expect(PUBLIC_APP_URL.endsWith('/')).toBe(false);
    expect(publicUrl('/payme?x=1')).toBe(`${PUBLIC_APP_URL}/#/payme?x=1`);
  });

  it('Pay-me links default to the canonical public URL', () => {
    const url = buildPayMePageUrl({
      shop: { name: 'S', payAccountNumber: '0123456789' },
      amountKobo: 500,
    });
    expect(url.startsWith(`${PUBLIC_APP_URL}/#/payme?`)).toBe(true);
  });
});
