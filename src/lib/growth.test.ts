import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL } from '../config';
import { initLocale, setLocale } from '../i18n';
import {
  appLink,
  buildInviteMessage,
  captureAttribution,
  getAttribution,
  myRefCode,
  sanitizeTag,
  setBrandFooterEnabled,
  shouldShowBackupNudge,
  withBrandFooter,
} from './growth';
import { buildRemindMessage } from './sms';

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
  setLocale('en');
});
beforeEach(() => {
  for (const k of Array.from(store.keys())) if (k !== 'debtbook-locale') store.delete(k);
});

describe('tagged links', () => {
  it('keep ?app=1 and add src/ref on the canonical URL', () => {
    const u = new URL(appLink('inv', 'bb-abc123'));
    expect(`${u.origin}`).toBe(PUBLIC_APP_URL);
    expect(u.searchParams.get('app')).toBe('1');
    expect(u.searchParams.get('src')).toBe('inv');
    expect(u.searchParams.get('ref')).toBe('bb-abc123');
  });
  it('drops unsafe ref values', () => {
    expect(sanitizeTag('cs_test_123')).toBeNull();
    expect(sanitizeTag('<script>')).toBeNull();
    expect(new URL(appLink('rem', 'Bad Ref!')).searchParams.has('ref')).toBe(false);
  });
});

describe('brand footer', () => {
  it('is on by default and appended to reminders', () => {
    const msg = buildRemindMessage('Shop', 'Ada', 5000);
    expect(msg).toContain('Recorded in BashiBook');
    expect(msg).toContain(`${PUBLIC_APP_URL}/?app=1&src=rem`);
  });
  it('can be switched off', () => {
    setBrandFooterEnabled(false);
    expect(withBrandFooter('hi')).toBe('hi');
    expect(buildRemindMessage('Shop', 'Ada', 5000)).not.toContain('BashiBook ·');
  });
});

describe('attribution', () => {
  it('stores first touch from the query string only', () => {
    expect(captureAttribution('https://x.test/?app=1&src=rem&ref=bb-zz9#/')).toMatchObject({
      src: 'rem',
      ref: 'bb-zz9',
    });
    captureAttribution('https://x.test/?src=inv&ref=bb-other');
    expect(getAttribution()).toMatchObject({ src: 'rem', ref: 'bb-zz9' });
  });
  it('ignores the Stripe #/pro?ref= hash', () => {
    expect(captureAttribution('https://x.test/?app=1#/pro?ref=cs_test_1')).toBeNull();
  });
});

describe('invite + nudge', () => {
  it('invite uses a stable random ref code, not the shop name', () => {
    const code = myRefCode();
    expect(code).toMatch(/^bb-[a-z0-9]{6}$/);
    expect(myRefCode()).toBe(code);
    expect(buildInviteMessage()).toContain(`src=inv&ref=${code}`);
  });
  it('backup nudge only after 10 customers and no recent backup', () => {
    const now = Date.now();
    expect(shouldShowBackupNudge({ customerCount: 9, now })).toBe(false);
    expect(shouldShowBackupNudge({ customerCount: 10, now })).toBe(true);
    expect(shouldShowBackupNudge({ customerCount: 12, cloudBackupAt: now - 1000, now })).toBe(false);
  });
});
