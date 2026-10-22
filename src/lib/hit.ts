/**
 * Anonymous channel counter (see api/hit.ts). Sends only { event, src tag }.
 * Fire-and-forget via sendBeacon; never awaited, never blocks offline use.
 * Offline hits wait in a tiny localStorage queue and go out with the next hit
 * or when the phone comes back online.
 */
import { getAttribution, sanitizeTag } from './growth';

export type HitEvent = 'view_home' | 'app_open' | 'first_customer' | 'pro_checkout';
type Hit = { e: string; s?: string };

const QUEUE_KEY = 'bashibook-hitq';
const ONCE_PREFIX = 'bashibook-hit-';
const MAX_QUEUE = 20;
let listening = false;

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readQueue(ls: Storage): Hit[] {
  try {
    const q = JSON.parse(ls.getItem(QUEUE_KEY) || '[]') as Hit[];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function send(hits: Hit[]): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon || navigator.onLine === false) return false;
    return navigator.sendBeacon('/api/hit', new Blob([JSON.stringify(hits)], { type: 'text/plain' }));
  } catch {
    return false;
  }
}

/** Send queued hits plus `extra`; whatever can't go now is kept (max 20). */
export function flushHits(extra: Hit[] = []): void {
  const ls = store();
  const all = (ls ? readQueue(ls) : []).concat(extra);
  if (!all.length) return;
  const now = all.slice(0, 10);
  const later = all.slice(10);
  const left = (send(now) ? later : all).slice(-MAX_QUEUE);
  try {
    if (left.length) ls?.setItem(QUEUE_KEY, JSON.stringify(left));
    else ls?.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
  if (left.length && !listening && typeof addEventListener === 'function') {
    listening = true;
    addEventListener(
      'online',
      () => {
        listening = false;
        flushHits();
      },
      { once: true },
    );
  }
}

/**
 * Count `event` for this device's first-touch src tag. With `once`, only the
 * first call per device counts; `daily` limits it to once per device per day.
 */
export function hit(event: HitEvent, opts: { once?: boolean; daily?: boolean; src?: string | null } = {}): void {
  const ls = store();
  const src = sanitizeTag(opts.src) || getAttribution()?.src || undefined;
  if (opts.once || opts.daily) {
    const key = ONCE_PREFIX + event + (opts.daily ? `-${src || 'direct'}` : '');
    const mark = opts.daily ? new Date().toISOString().slice(0, 10) : '1';
    if (!ls || ls.getItem(key) === mark) return;
    try {
      ls.setItem(key, mark);
    } catch {
      return;
    }
  }
  flushHits([src ? { e: event, s: src } : { e: event }]);
}
