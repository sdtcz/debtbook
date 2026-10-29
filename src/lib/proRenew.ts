/**
 * Pro renewals (lazy, idle, at most once a day). /api/verify re-reads the original Checkout Session with
 * its subscription, so while the subscription is active it returns the renewed current_period_end.
 * Network trouble never removes Pro: getEntitlement keeps a 3-day grace while `ref` is stored.
 */
import { entitlementFromPayment, isVerifiedPayment } from './checkoutReturn';
import type { Entitlement } from './types';

const DAY = 24 * 60 * 60 * 1000;
export const RENEW_KEY = 'bashibook-pro-renew-at';

/** Cheap check for App: only paid Stripe Pro with a reference, within 2 days of expiry (or past it). */
export function renewDue(e: Entitlement | undefined, now = Date.now()): boolean {
  return !!(e && e.plan === 'pro' && e.ref && e.exp && e.source?.startsWith('stripe') && e.exp - now < 2 * DAY);
}

export type RenewResult = 'skip' | 'extended' | 'same' | 'lapsed' | 'error';

export async function renewPro(
  e: Entitlement | undefined,
  save: (e: Entitlement) => Promise<unknown>,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  ls: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Promise<RenewResult> {
  if (!renewDue(e, now) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'skip';
  const last = Number(ls.getItem(RENEW_KEY));
  if (last && now - last < DAY) return 'skip';
  ls.setItem(RENEW_KEY, String(now));
  try {
    const res = await fetcher(`/api/verify?reference=${encodeURIComponent(e!.ref!)}`, { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as unknown;
    if (res.ok && isVerifiedPayment(body)) {
      const next = entitlementFromPayment(body, e, now, e!.ref);
      if ((next.exp || 0) <= (e!.exp || 0)) return 'same';
      await save(next);
      return 'extended';
    }
    // A definite "no" (cancelled / unpaid / unknown session): drop the reference, so Pro ends at exp as before.
    if (res.status >= 400 && res.status < 500) {
      const { ref: _drop, ...rest } = e!;
      await save(rest);
      return 'lapsed';
    }
  } catch {
    /* offline / blocked: try again tomorrow; grace keeps Pro meanwhile */
  }
  return 'error';
}
