import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLocale, setLocale } from '../i18n';
import { en } from '../i18n/locales/en';
import { ha } from '../i18n/locales/ha';
import { yo } from '../i18n/locales/yo';
import entryFormSrc from '../pages/EntryFormPage.tsx?raw';
import {
  PAID_INVITE_GAP_MS,
  buildInviteMessage,
  markPaidInviteShown,
  markPaidInviteSkipped,
  myRefCode,
  openPaidInviteWhatsApp,
  shouldShowPaidInvite,
} from './growth';

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
beforeEach(() => store.clear());

describe('"Tell a shop" after a customer pays in full', () => {
  const now = 1_800_000_000_000;
  it('only when a payment takes the customer from owing to settled', () => {
    expect(shouldShowPaidInvite({ beforeKobo: 500_00, afterKobo: 0, now })).toBe(true);
    expect(shouldShowPaidInvite({ beforeKobo: 500_00, afterKobo: -100, now })).toBe(true); // paid extra
    expect(shouldShowPaidInvite({ beforeKobo: 500_00, afterKobo: 200_00, now })).toBe(false); // part-payment
    expect(shouldShowPaidInvite({ beforeKobo: 0, afterKobo: -100, now })).toBe(false); // was not owing
    expect(shouldShowPaidInvite({ beforeKobo: -50, afterKobo: -150, now })).toBe(false);
    expect(shouldShowPaidInvite({ beforeKobo: null, afterKobo: 0, now })).toBe(false); // balance not loaded
  });
  it('at most once per 14 days', () => {
    markPaidInviteShown(now);
    expect(shouldShowPaidInvite({ beforeKobo: 1, afterKobo: 0, now: now + PAID_INVITE_GAP_MS - 1 })).toBe(false);
    expect(shouldShowPaidInvite({ beforeKobo: 1, afterKobo: 0, now: now + PAID_INVITE_GAP_MS })).toBe(true);
  });
  it('stops for good after two "Not now"', () => {
    markPaidInviteShown(now);
    markPaidInviteSkipped();
    expect(shouldShowPaidInvite({ beforeKobo: 1, afterKobo: 0, now: now + 2 * PAID_INVITE_GAP_MS })).toBe(true);
    markPaidInviteSkipped();
    expect(shouldShowPaidInvite({ beforeKobo: 1, afterKobo: 0, now: now + 10 * PAID_INVITE_GAP_MS })).toBe(false);
  });
  it('sharing opens WhatsApp with the invite tagged src=paid and the device ref, then never asks again', () => {
    const open = vi.fn();
    (globalThis as { window?: unknown }).window = { open };
    openPaidInviteWhatsApp();
    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.slice('https://wa.me/?text='.length));
    expect(text).toContain(`/?app=1&src=paid&ref=${myRefCode()}`);
    expect(text).toBe(buildInviteMessage(myRefCode(), 'paid'));
    expect(shouldShowPaidInvite({ beforeKobo: 1, afterKobo: 0, now: now + 100 * PAID_INVITE_GAP_MS })).toBe(false);
  });
  it('plain invite keeps src=inv', () => {
    expect(buildInviteMessage()).toContain('src=inv&ref=');
  });
  it('strings exist in en/ha/yo, neutral wording (no country), name placeholder kept', () => {
    for (const cat of [en, ha, yo] as Record<string, string>[]) {
      for (const k of ['entry.paidStepTitle', 'entry.paidStepWhy', 'entry.paidStepShare', 'entry.paidStepSkip']) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k]).not.toMatch(/Nigeria/i);
      }
      expect(cat['entry.paidStepTitle']).toContain('{{name}}');
    }
  });
  it('entry form shows the step only after a payment and finishes with the usual Undo toast', () => {
    const src = entryFormSrc;
    expect(src).toMatch(/shouldShowPaidInvite\(\{ beforeKobo: balanceKobo, afterKobo: after\.balanceKobo \}\)/);
    expect(src).toMatch(/markPaidInviteSkipped\(\);\s*finish\(paidStep\)/);
    expect(src).toMatch(/openPaidInviteWhatsApp\(\);\s*finish\(paidStep, t\('customer\.openingWhatsApp'\)\)/);
    // credit sales still go to the receipt step first
    expect(src.indexOf("if (type === 'credit') {")).toBeLessThan(src.indexOf('shouldShowPaidInvite({'));
  });
});
