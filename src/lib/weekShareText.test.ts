import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import weekSrc from './week.ts?raw';
import { PUBLIC_APP_URL } from '../config';
import { initLocale, setLocale, t } from '../i18n';
import { setBrandFooterEnabled } from './growth';
import { formatMoney } from './money';
import type { Customer, Entry } from './types';
import { weekFacts, weekShareParts } from './week';

const store = new Map<string, string>();
beforeAll(() => {
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
  initLocale('en');
});
beforeEach(async () => {
  store.clear();
  await setLocale('en');
});

const DAY = 864e5;
const SUN = new Date(2026, 10, 1, 18, 0).getTime();
const tr = t as unknown as (k: string, v?: Record<string, string | number>) => string;
const ngn = (k: number) => formatMoney(k, 'NGN');
const cust = (id: string, name: string): Customer => ({ id, name, createdAt: 0, updatedAt: 0 });
const entry = (id: string, customerId: string, type: 'credit' | 'payment', naira: number, at: number): Entry => ({
  id, customerId, type, amountKobo: naira * 100, occurredAt: at, createdAt: at, updatedAt: at,
});
const facts = () =>
  weekFacts([cust('a', 'Ngozi'), cust('b', 'Ade')], [entry('e1', 'a', 'credit', 5000, SUN - 2 * DAY), entry('e2', 'b', 'credit', 2000, SUN - DAY), entry('e3', 'b', 'payment', 1000, SUN - DAY)], SUN);

describe('"Share my week" text footer', () => {
  it('ends with the brand line and a tagged app link when the toggle is on (default)', () => {
    const out = weekShareParts(facts(), 'Ade Stores', tr, ngn, false, 'en-US').text.split('\n');
    expect(out[out.length - 2]).toBe('');
    expect(out[out.length - 1]).toMatch(/^Recorded in BashiBook · free credit book for /);
    expect(out[out.length - 1]).toContain(`${PUBLIC_APP_URL}/?app=1&src=rem`);
    expect(out.join('\n')).not.toContain('— BashiBook');
    expect(out.join('\n')).not.toMatch(/\$|Pro\b|trial/);
  });

  it('respects "Add BashiBook line to messages" off: plain sign-off, no link', () => {
    setBrandFooterEnabled(false);
    const text = weekShareParts(facts(), 'Ade Stores', tr, ngn, false, 'en-US').text;
    expect(text.split('\n').pop()).toBe('— BashiBook');
    expect(text).not.toContain('bashibook.app');
    expect(text).not.toContain('http');
  });

  it('never puts customer names in the text, even with names on in the picture', () => {
    const text = weekShareParts(facts(), 'Ade Stores', tr, ngn, true, 'en-US').text;
    expect(text).not.toContain('Ngozi');
    expect(text).not.toMatch(/\bAde\b(?! Stores)/);
  });

  it('uses the existing localized brand line in ha/yo (no new strings)', async () => {
    await setLocale('ha');
    expect(weekShareParts(facts(), 'Ade Stores', tr, ngn, false).text).toContain('An rubuta a BashiBook');
    await setLocale('yo');
    expect(weekShareParts(facts(), 'Ade Stores', tr, ngn, false).text).toContain('A kọ ọ́ sínú BashiBook');
  });

  it('week.ts builds the text through reportShareText (no hard-coded untagged link)', () => {
    expect(weekSrc).toContain('reportShareText([');
    expect(weekSrc).not.toContain("'— BashiBook · bashibook.app'");
  });
});
