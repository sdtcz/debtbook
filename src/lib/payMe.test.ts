import { beforeAll, describe, expect, it } from 'vitest';
import { initLocale, setLocale } from '../i18n';
import {
  buildPayMeMessage,
  buildPayMePageUrl,
  hasPayMeDetails,
  parsePayMeQuery,
} from './payMe';
import type { ShopProfile } from './types';

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
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

function shop(partial: Partial<ShopProfile> & { name: string }): ShopProfile {
  return {
    id: 'shop',
    currency: 'NGN',
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('hasPayMeDetails', () => {
  it('false when empty', () => {
    expect(hasPayMeDetails(null)).toBe(false);
    expect(hasPayMeDetails(shop({ name: 'A' }))).toBe(false);
    expect(hasPayMeDetails(shop({ name: 'A', payAccountNumber: '  ' }))).toBe(false);
  });

  it('true when account number set', () => {
    expect(
      hasPayMeDetails(shop({ name: 'A', payAccountNumber: '0123456789' })),
    ).toBe(true);
  });

  it('true when pay link set', () => {
    expect(
      hasPayMeDetails(shop({ name: 'A', payLinkUrl: 'https://paystack.me/x' })),
    ).toBe(true);
  });
});

describe('buildPayMePageUrl', () => {
  it('encodes kobo amount and details', () => {
    const url = buildPayMePageUrl({
      origin: 'https://debtbook-neon.vercel.app',
      shop: shop({
        name: 'Mama Shop',
        payBankName: 'Opay',
        payAccountNumber: '0123456789',
        payAccountName: 'Ada Obi',
        payLinkUrl: 'https://paystack.me/mama',
      }),
      amountKobo: 150050,
      customerName: 'Chidi',
    });
    expect(url.startsWith('https://debtbook-neon.vercel.app/#/payme?')).toBe(
      true,
    );
    const q = url.split('?')[1];
    const params = new URLSearchParams(q);
    expect(params.get('shop')).toBe('Mama Shop');
    expect(params.get('amountKobo')).toBe('150050');
    expect(params.get('bank')).toBe('Opay');
    expect(params.get('acct')).toBe('0123456789');
    expect(params.get('name')).toBe('Ada Obi');
    expect(params.get('link')).toBe('https://paystack.me/mama');
    expect(params.get('customer')).toBe('Chidi');
  });

  it('omits empty optional fields', () => {
    const url = buildPayMePageUrl({
      origin: 'https://example.com/',
      shop: shop({ name: 'X', payAccountNumber: '1' }),
      amountKobo: 100,
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('bank')).toBeNull();
    expect(params.get('link')).toBeNull();
    expect(params.get('customer')).toBeNull();
    expect(params.get('acct')).toBe('1');
  });
});

describe('buildPayMeMessage', () => {
  it('includes amount, bank block, and page URL', () => {
    const msg = buildPayMeMessage({
      shop: shop({
        name: 'Mama Shop',
        payBankName: 'GTBank',
        payAccountNumber: '0123456789',
        payAccountName: 'Mama Shop',
      }),
      customerName: 'Chidi',
      balanceKobo: 500000,
      pageUrl: 'https://example.com/#/payme?x=1',
    });
    expect(msg).toContain('Chidi');
    expect(msg).toContain('Mama Shop');
    expect(msg).toContain('₦5,000.00');
    expect(msg).toContain('GTBank');
    expect(msg).toContain('0123456789');
    expect(msg).toContain('https://example.com/#/payme?x=1');
  });
});

describe('parsePayMeQuery', () => {
  it('parses amountKobo', () => {
    const p = parsePayMeQuery(
      'shop=A&amountKobo=2500&bank=Opay&acct=99&name=N&customer=C',
    );
    expect(p.amountKobo).toBe(2500);
    expect(p.shop).toBe('A');
    expect(p.bank).toBe('Opay');
    expect(p.acct).toBe('99');
    expect(p.customer).toBe('C');
  });
});
