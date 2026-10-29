/**
 * Google Play Billing for Pro inside the Play app (lazy chunk; the website never loads it unless the
 * browser exposes the Digital Goods API). Prices from the Digital Goods API, purchases through the
 * Payment Request API (method https://play.google.com/billing), verification and acknowledgement on
 * the server (/api/play-verify). The purchase token is kept as Entitlement.ref with source play-*.
 */
import { playAppHint } from './playEnv';
import type { Entitlement } from './types';

export const PLAY_METHOD = 'https://play.google.com/billing';
export type PlayPlan = 'monthly' | 'yearly';
export const PLAY_SKU: Record<PlayPlan, string> = { monthly: 'pro_monthly', yearly: 'pro_yearly' };
const PLAN_OF: Record<string, PlayPlan> = { pro_monthly: 'monthly', pro_yearly: 'yearly' };
const DAY = 24 * 60 * 60 * 1000;
export const PLAY_SYNC_KEY = 'bashibook-play-sync-at';

type ItemDetails = { itemId: string; title?: string; price: { currency: string; value: string }; freeTrialPeriod?: string };
type PurchaseDetails = { itemId: string; purchaseToken: string };
export interface DigitalGoodsService {
  getDetails(ids: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
}
type DgsWindow = { getDigitalGoodsService?: (m: string) => Promise<DigitalGoodsService> };

let svc: Promise<DigitalGoodsService | null> | null = null;

/** The Play billing service, or null (website, old app build, Play missing). Never rejects. */
export function playService(w: DgsWindow = window as unknown as DgsWindow, timeoutMs = 4000): Promise<DigitalGoodsService | null> {
  if (svc) return svc;
  if (typeof w.getDigitalGoodsService !== 'function') return (svc = Promise.resolve(null));
  svc = Promise.race([
    w.getDigitalGoodsService(PLAY_METHOD).then((s) => s || null),
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]).catch(() => null);
  return svc;
}

/** Test hook. */
export function resetPlayService(): void {
  svc = null;
}

export type Store = 'web' | 'play' | 'play-unavailable';

/**
 * Which checkout to show: 'play' when the Play billing service answers, 'play-unavailable' when we're
 * in the Play app but billing can't be used (old build, Play missing) → never show Stripe there.
 */
export async function detectStore(w?: DgsWindow): Promise<{ store: Store; service: DigitalGoodsService | null }> {
  const service = await playService(w);
  if (service) return { store: 'play', service };
  return { store: playAppHint() ? 'play-unavailable' : 'web', service: null };
}

export function formatPrice(p: ItemDetails['price'], locale?: string): string {
  const v = Number(p.value);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: p.currency }).format(v);
  } catch {
    return `${p.currency} ${p.value}`;
  }
}

/** Localised Play prices per plan (missing → caller keeps the USD defaults). */
export async function playPrices(service: DigitalGoodsService, locale?: string): Promise<Partial<Record<PlayPlan, string>>> {
  const out: Partial<Record<PlayPlan, string>> = {};
  try {
    for (const d of await service.getDetails(Object.values(PLAY_SKU))) {
      const plan = PLAN_OF[d.itemId];
      if (plan && d.price) out[plan] = formatPrice(d.price, locale);
    }
  } catch {
    /* keep defaults */
  }
  return out;
}

export interface PlayVerified {
  ok: true;
  plan: PlayPlan;
  productId: string;
  paidAt: number;
  expiresAt: number;
}

export function isPlayVerified(v: unknown): v is PlayVerified {
  const o = v as Partial<PlayVerified> | null;
  return !!o && o.ok === true && (o.plan === 'monthly' || o.plan === 'yearly') && Number.isFinite(o.expiresAt) && (o.expiresAt as number) > 0;
}

export type VerifyResult =
  | { kind: 'ok'; body: PlayVerified }
  | { kind: 'no'; status: number }
  | { kind: 'not_configured' }
  | { kind: 'error' };

export async function verifyPlay(token: string, sku?: string, fetcher: typeof fetch = fetch): Promise<VerifyResult> {
  try {
    const res = await fetcher('/api/play-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, sku }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (res.ok && isPlayVerified(body)) return { kind: 'ok', body };
    if (res.status === 501) return { kind: 'not_configured' };
    if (res.status >= 400 && res.status < 500) return { kind: 'no', status: res.status };
  } catch {
    /* offline */
  }
  return { kind: 'error' };
}

/** Is the server able to verify Play purchases? (Asked before showing the buy button.) */
export async function playConfigured(fetcher: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const res = await fetcher('/api/play-verify', { cache: 'no-store' });
    if (res.status === 501) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

/** Play is the source of truth for the period: Pro until Google's expiryTime (sanity-capped). */
export function entitlementFromPlay(p: PlayVerified, token: string, current?: Entitlement, now = Date.now()): Entitlement {
  let exp = Math.min(p.expiresAt, now + (p.plan === 'yearly' ? 400 : 40) * DAY);
  // Don't shorten a longer paid period from another purchase (e.g. Stripe bought on the website).
  const paid = current?.plan === 'pro' && !!current.source && current.source !== 'demo';
  if (paid && current!.ref !== token && current!.exp && current!.exp > exp) exp = current!.exp;
  return { plan: 'pro', exp, source: `play-${p.plan}`, ref: token };
}

export type BuyResult = 'ok' | 'cancel' | 'not_configured' | 'failed' | 'offline';

/** Buy a plan with Google Play, verify + acknowledge on the server, then save Pro. */
export async function buyWithPlay(
  plan: PlayPlan,
  current: Entitlement | undefined,
  save: (e: Entitlement) => Promise<unknown>,
  fetcher: typeof fetch = fetch,
): Promise<{ result: BuyResult; ent?: Entitlement }> {
  const sku = PLAY_SKU[plan];
  let response: PaymentResponse;
  try {
    const req = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku } }], {
      // Required by the API, ignored by Play (it charges the Play Console price).
      total: { label: 'Total', amount: { currency: 'USD', value: '0' } },
    });
    response = await req.show();
  } catch {
    return { result: 'cancel' };
  }
  const token = (response.details as { purchaseToken?: string } | undefined)?.purchaseToken;
  if (!token) {
    await response.complete('fail').catch(() => {});
    return { result: 'failed' };
  }
  const v = await verifyPlay(token, sku, fetcher);
  if (v.kind === 'ok') {
    const ent = entitlementFromPlay(v.body, token, current);
    await save(ent);
    await response.complete('success').catch(() => {});
    return { result: 'ok', ent };
  }
  await response.complete(v.kind === 'error' ? 'unknown' : 'fail').catch(() => {});
  // Offline after paying: the purchase stays in Play; syncPlay (app open) verifies it later.
  return { result: v.kind === 'not_configured' ? 'not_configured' : v.kind === 'error' ? 'offline' : 'failed' };
}

export type SyncResult = 'skip' | 'restored' | 'extended' | 'same' | 'lapsed' | 'error';

/**
 * App open (idle): restore purchases with listPurchases and re-check renewals. Network only when
 * there is something to learn: a purchase we don't have yet, or our Play Pro is within 2 days of expiry
 * (at most once a day). A definite "no" from the server drops the token so Pro ends at exp.
 */
export async function syncPlay(
  current: Entitlement | undefined,
  save: (e: Entitlement) => Promise<unknown>,
  opts: { service?: DigitalGoodsService | null; fetcher?: typeof fetch; now?: number; ls?: Pick<Storage, 'getItem' | 'setItem'>; force?: boolean } = {},
): Promise<SyncResult> {
  const now = opts.now ?? Date.now();
  const fetcher = opts.fetcher ?? fetch;
  const ls = opts.ls ?? localStorage;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'skip';
  const service = opts.service !== undefined ? opts.service : await playService();
  const isPlayPro = !!(current?.plan === 'pro' && current.ref && current.source?.startsWith('play'));
  const due = isPlayPro && (!current!.exp || current!.exp - now < 2 * DAY);
  const last = Number(ls.getItem(PLAY_SYNC_KEY));
  const recently = !!last && now - last < DAY;

  let purchases: PurchaseDetails[] = [];
  if (service) {
    try {
      purchases = (await service.listPurchases()).filter((p) => PLAN_OF[p.itemId] && p.purchaseToken);
    } catch {
      purchases = [];
    }
  }
  const curPro = current?.plan === 'pro' && current.source !== 'demo';
  // Purchases we don't hold yet (new install / restore). Once a day if we already have paid Pro.
  const unknown = curPro && recently && !opts.force ? [] : purchases.filter((p) => p.purchaseToken !== current?.ref);
  const toCheck = unknown.length ? unknown : due && (!recently || opts.force) && current?.ref ? [{ itemId: '', purchaseToken: current.ref }] : [];
  if (!toCheck.length) return 'skip';
  ls.setItem(PLAY_SYNC_KEY, String(now));

  let best: Entitlement | null = null;
  let definiteNoForCurrent = false;
  let anyError = false;
  for (const p of toCheck) {
    const v = await verifyPlay(p.purchaseToken, p.itemId || undefined, fetcher);
    if (v.kind === 'ok') {
      const e = entitlementFromPlay(v.body, p.purchaseToken, undefined, now);
      if (!best || (e.exp || 0) > (best.exp || 0)) best = e;
    } else if (v.kind === 'no' && p.purchaseToken === current?.ref) definiteNoForCurrent = true;
    else if (v.kind !== 'no') anyError = true;
  }
  if (best) {
    const cur = current?.plan === 'pro' && current.source !== 'demo' ? current.exp || 0 : 0;
    if ((best.exp || 0) <= cur) return 'same'; // nothing newer (or a longer website period stays)
    await save(best);
    return isPlayPro ? 'extended' : 'restored';
  }
  if (definiteNoForCurrent && current) {
    const { ref: _drop, ...rest } = current;
    await save(rest);
    return 'lapsed';
  }
  return anyError ? 'error' : 'same';
}

