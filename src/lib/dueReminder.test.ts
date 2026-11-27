import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initLocale, setLocale } from '../i18n';
import { dueState } from '../db/repo';
import homeSrc from '../pages/HomePage.tsx?raw';
import customerSrc from '../pages/CustomerDetailPage.tsx?raw';
import chaseSrc from '../components/ChaseAllSheet.tsx?raw';
import { buildRemindMessage, remindCustomer } from './sms';
import type { Customer } from './types';

const DAY = 24 * 60 * 60 * 1000;

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

afterEach(async () => {
  await setLocale('en');
  vi.unstubAllGlobals();
});

async function sentText(due: ReturnType<typeof dueState> | undefined): Promise<string> {
  let url = '';
  vi.stubGlobal('window', { open: (u: string) => void (url = u) });
  const r = await remindCustomer({
    shopName: 'Shop',
    customerName: 'Ada',
    phone: '08031234567',
    balanceKobo: 5000,
    dueState: due,
  });
  expect(r).toBe('whatsapp');
  return decodeURIComponent(new URL(url).searchParams.get('text') || '');
}

describe("'Will pay on' reminders use the due wording", () => {
  it('remindCustomer passes dueState through to the WhatsApp text', async () => {
    expect(await sentText('today')).toContain('due today');
    expect(await sentText('passed')).toContain('now overdue');
    expect(await sentText('upcoming')).toContain('outstanding balance');
    expect(await sentText(undefined)).toContain('outstanding balance');
  });

  it('works with repo.dueState for a customer due today / past their date', async () => {
    const now = Date.now();
    const c = (dueAt?: number): Customer => ({ id: 'a', name: 'Ada', createdAt: now, updatedAt: now, dueAt }) as Customer;
    expect(await sentText(dueState(c(now), 5000))).toContain('due today');
    expect(await sentText(dueState(c(now - 2 * DAY), 5000))).toContain('now overdue');
    expect(await sentText(dueState(c(), 5000))).toContain('outstanding balance');
  });

  it('ha/yo keep the existing owes wording until the native-speaker check clears', async () => {
    for (const loc of ['ha', 'yo'] as const) {
      await setLocale(loc);
      const owes = buildRemindMessage('Shop', 'Ada', 5000);
      expect(owes).toContain(loc === 'ha' ? 'Sannu Ada' : 'Ẹ káàbọ̀ Ada');
      expect(buildRemindMessage('Shop', 'Ada', 5000, 'today')).toBe(owes);
      expect(buildRemindMessage('Shop', 'Ada', 5000, 'passed')).toBe(owes);
    }
  });

  it('every remind button passes dueState (Home row + due-today strip, customer page, chase-all sheet)', () => {
    for (const src of [homeSrc, chaseSrc]) {
      expect(src).toMatch(/remindCustomer\(\{[^}]*dueState: dueState\(row\.customer, row\.balanceKobo\)/);
    }
    expect(customerSrc).toMatch(/remindCustomer\(\{[^}]*dueState: dueState\(customer, balanceKobo\)/);
  });
});
