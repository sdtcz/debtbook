/**
 * Wrong-PIN throttle: 5 free tries, then an increasing wait (30 s, 1 min, 2 min … up to 30 min)
 * before each further try. Kept in localStorage so reloading the app does not reset it.
 */
const KEY = 'bashibook-pin-fails';
export const FREE_TRIES = 5;
const BASE_MS = 30_000;
const MAX_MS = 30 * 60_000;

type State = { n: number; until: number };

function read(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as State | null;
    if (v && Number.isFinite(v.n) && Number.isFinite(v.until)) return v;
  } catch {
    /* ignore */
  }
  return { n: 0, until: 0 };
}

function write(s: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore private mode */
  }
}

/** Wait after the n-th wrong PIN (0 for the first four). */
export function lockoutMs(failures: number): number {
  if (failures < FREE_TRIES) return 0;
  return Math.min(BASE_MS * 2 ** (failures - FREE_TRIES), MAX_MS);
}

/** Milliseconds until the next try is allowed (0 = may try now). */
export function pinWaitRemaining(now = Date.now()): number {
  return Math.min(MAX_MS, Math.max(0, read().until - now));
}

/** Record a wrong PIN; returns the wait before the next try. */
export function recordPinFailure(now = Date.now()): number {
  const s = read();
  const n = s.n + 1;
  const wait = lockoutMs(n);
  write({ n, until: wait ? now + wait : 0 });
  return wait;
}

export function recordPinSuccess(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
