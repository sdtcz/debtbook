import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import reportsPage from '../pages/ReportsPage.tsx?raw';
import { PUBLIC_APP_URL } from '../config';
import { initLocale, setLocale } from '../i18n';
import { reportShareText, setBrandFooterEnabled } from './growth';

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

const lines = ['Ade Stores — This month report', 'Credit given: ₦5,000', 'Collected: ₦2,000'];

describe('shared Reports text', () => {
  it('ends with the brand line and a tagged app link when the toggle is on (default)', () => {
    const text = reportShareText(lines);
    const out = text.split('\n');
    expect(out.slice(0, 3)).toEqual(lines);
    expect(out[3]).toBe('');
    expect(out[4]).toMatch(/^Recorded in BashiBook · free credit book for /);
    expect(out[4]).toContain(`${PUBLIC_APP_URL}/?app=1&src=rem`);
    expect(text).not.toContain('— BashiBook');
    expect(text).not.toMatch(/\$|Pro\b|trial/);
  });

  it('keeps the plain sign-off without a link when the toggle is off', () => {
    setBrandFooterEnabled(false);
    expect(reportShareText(lines)).toBe([...lines, '— BashiBook'].join('\n'));
  });

  it('uses the existing localized brand line in ha/yo (no new strings)', async () => {
    await setLocale('ha');
    expect(reportShareText(lines)).toContain('An rubuta a BashiBook');
    await setLocale('yo');
    expect(reportShareText(lines)).toContain('A kọ ọ́ sínú BashiBook');
  });

  it('Reports page shares through reportShareText', () => {
    const src = reportsPage;
    expect(src).toContain('shareOrCopyText(reportShareText(lines)');
    expect(src).not.toContain("'— BashiBook',");
  });
});
