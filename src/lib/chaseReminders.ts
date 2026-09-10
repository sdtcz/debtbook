/**
 * Auto overdue chase — local prefs + once-per-day prompt helpers.
 * Offline PWA: no server cron; shopkeeper still sends WhatsApp manually.
 */

import { t } from '../i18n';
import type { ShopProfile } from './types';

export const CHASE_ENABLED_KEY = 'debtbook-chase-enabled';
export const CHASE_TIME_KEY = 'debtbook-chase-time';
export const CHASE_PROMPTED_KEY = 'debtbook-chase-prompted';
export const DEFAULT_CHASE_TIME = '09:00';

export type ChasePrefs = {
  enabled: boolean;
  time: string; // HH:mm local
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Validate / normalize "HH:mm" (24h). Falls back to default. */
export function normalizeChaseTime(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_CHASE_TIME;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return DEFAULT_CHASE_TIME;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return DEFAULT_CHASE_TIME;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Local calendar day key YYYY-MM-DD (not UTC). */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function readChasePrefsFromStorage(): ChasePrefs {
  const enabled = lsGet(CHASE_ENABLED_KEY) === '1';
  const time = normalizeChaseTime(lsGet(CHASE_TIME_KEY));
  return { enabled, time };
}

/**
 * Prefer shop profile fields when set; otherwise localStorage.
 * Shop `chaseReminderEnabled === undefined` → fall back to storage.
 */
export function resolveChasePrefs(shop?: ShopProfile | null): ChasePrefs {
  const fromStorage = readChasePrefsFromStorage();
  const enabled =
    shop?.chaseReminderEnabled !== undefined
      ? Boolean(shop.chaseReminderEnabled)
      : fromStorage.enabled;
  const time = normalizeChaseTime(
    shop?.chaseReminderTime !== undefined && shop.chaseReminderTime !== ''
      ? shop.chaseReminderTime
      : fromStorage.time,
  );
  return { enabled, time };
}

/** Persist prefs to localStorage (always) — call alongside shop update. */
export function writeChasePrefsToStorage(prefs: Partial<ChasePrefs>): ChasePrefs {
  const cur = readChasePrefsFromStorage();
  const next: ChasePrefs = {
    enabled: prefs.enabled !== undefined ? prefs.enabled : cur.enabled,
    time: prefs.time !== undefined ? normalizeChaseTime(prefs.time) : cur.time,
  };
  lsSet(CHASE_ENABLED_KEY, next.enabled ? '1' : '0');
  lsSet(CHASE_TIME_KEY, next.time);
  return next;
}

export function hasPromptedToday(now = new Date()): boolean {
  return lsGet(CHASE_PROMPTED_KEY) === localDateKey(now);
}

export function markPromptedToday(now = new Date()): void {
  lsSet(CHASE_PROMPTED_KEY, localDateKey(now));
}

export function clearPromptedToday(): void {
  try {
    localStorage.removeItem(CHASE_PROMPTED_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldShowDailyChasePrompt(opts: {
  enabled: boolean;
  overdueCount: number;
  locked?: boolean;
  now?: Date;
}): boolean {
  if (opts.locked) return false;
  if (!opts.enabled) return false;
  if (opts.overdueCount < 1) return false;
  if (hasPromptedToday(opts.now)) return false;
  return true;
}

/** Best-effort Notification when daily prompt fires. Fail soft. */
export function tryNotifyChaseOverdue(overdueCount: number): boolean {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    if (overdueCount < 1) return false;
    const title = t('chase.notificationTitle');
    const body = t('chase.notificationBody', { n: overdueCount });
    const n = new Notification(title, { body, tag: 'debtbook-chase-daily' });
    void n;
    return true;
  } catch {
    return false;
  }
}

export async function requestChaseNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  try {
    if (typeof Notification === 'undefined' || !Notification.requestPermission) {
      return 'unsupported';
    }
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  try {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}
