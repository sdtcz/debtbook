import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CHASE_ENABLED_KEY,
  CHASE_PROMPTED_KEY,
  CHASE_TIME_KEY,
  clearPromptedToday,
  hasPromptedToday,
  localDateKey,
  markPromptedToday,
  normalizeChaseTime,
  readChasePrefsFromStorage,
  resolveChasePrefs,
  shouldShowDailyChasePrompt,
  writeChasePrefsToStorage,
} from './chaseReminders';
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
});

afterEach(() => {
  localStorage.removeItem(CHASE_ENABLED_KEY);
  localStorage.removeItem(CHASE_TIME_KEY);
  localStorage.removeItem(CHASE_PROMPTED_KEY);
});

describe('normalizeChaseTime', () => {
  it('defaults and pads', () => {
    expect(normalizeChaseTime(null)).toBe('09:00');
    expect(normalizeChaseTime('9:00')).toBe('09:00');
    expect(normalizeChaseTime('14:30')).toBe('14:30');
  });

  it('rejects invalid', () => {
    expect(normalizeChaseTime('25:00')).toBe('09:00');
    expect(normalizeChaseTime('nope')).toBe('09:00');
  });
});

describe('chase prefs storage', () => {
  it('reads defaults off / 09:00', () => {
    expect(readChasePrefsFromStorage()).toEqual({ enabled: false, time: '09:00' });
  });

  it('writes and reads', () => {
    writeChasePrefsToStorage({ enabled: true, time: '08:15' });
    expect(readChasePrefsFromStorage()).toEqual({ enabled: true, time: '08:15' });
  });
});

describe('resolveChasePrefs', () => {
  it('prefers shop when set', () => {
    writeChasePrefsToStorage({ enabled: false, time: '07:00' });
    const shop = {
      chaseReminderEnabled: true,
      chaseReminderTime: '10:00',
    } as ShopProfile;
    expect(resolveChasePrefs(shop)).toEqual({ enabled: true, time: '10:00' });
  });

  it('falls back to storage when shop unset', () => {
    writeChasePrefsToStorage({ enabled: true, time: '11:00' });
    expect(resolveChasePrefs(null)).toEqual({ enabled: true, time: '11:00' });
  });
});

describe('daily prompt', () => {
  it('marks once per local day', () => {
    const now = new Date(2026, 8, 9, 10, 0, 0); // local Sep 9 2026
    expect(localDateKey(now)).toBe('2026-09-09');
    expect(hasPromptedToday(now)).toBe(false);
    markPromptedToday(now);
    expect(hasPromptedToday(now)).toBe(true);
    clearPromptedToday();
    expect(hasPromptedToday(now)).toBe(false);
  });

  it('shouldShowDailyChasePrompt gates correctly', () => {
    expect(
      shouldShowDailyChasePrompt({ enabled: true, overdueCount: 2 }),
    ).toBe(true);
    expect(
      shouldShowDailyChasePrompt({ enabled: false, overdueCount: 2 }),
    ).toBe(false);
    expect(
      shouldShowDailyChasePrompt({ enabled: true, overdueCount: 0 }),
    ).toBe(false);
    expect(
      shouldShowDailyChasePrompt({ enabled: true, overdueCount: 2, locked: true }),
    ).toBe(false);
    markPromptedToday();
    expect(
      shouldShowDailyChasePrompt({ enabled: true, overdueCount: 2 }),
    ).toBe(false);
  });
});
