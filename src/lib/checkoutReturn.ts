/** Stripe Checkout return handling (client). Never grants Pro by itself — see /api/verify. */
import type { Entitlement } from './types';

export type ProBillingPlan = 'monthly' | 'yearly';

const REF_RE = /^[A-Za-z0-9_.=-]{1,255}$/;

export function cleanRef(v: string | null | undefined): string | null {
  return v && REF_RE.test(v) ? v : null;
}

/** Checkout Session id from Stripe's success_url (?session_id=cs_…). */
export function refFromSearch(search: string): string | null {
  const q = new URLSearchParams(search);
  return cleanRef(q.get('session_id'));
}

/** Reference from hash route, e.g. #/pro?ref=abc */
export function refFromHash(hash: string): string | null {
  const raw = (hash || '').replace(/^#/, '');
  const i = raw.indexOf('?');
  if (i < 0) return null;
  const q = new URLSearchParams(raw.slice(i + 1));
  return cleanRef(q.get('ref') || q.get('reference'));
}

/**
 * If the page loaded from Stripe's success_url (/?app=1&checkout=stripe&session_id=cs_…),
 * rewrite to /?app=1#/pro?ref=… so the Pro page can verify it.
 */
export function normalizeCheckoutReturnUrl(): void {
  try {
    const u = new URL(window.location.href);
    const ref = refFromSearch(u.search);
    if (!ref) return;
    ['session_id', 'checkout'].forEach((k) => u.searchParams.delete(k));
    u.searchParams.set('app', '1');
    const next = `${u.pathname}?${u.searchParams.toString()}#/pro?ref=${encodeURIComponent(ref)}`;
    window.history.replaceState(null, '', next);
  } catch {
    /* ignore */
  }
}

/** Remove ?ref from the hash after handling, keep the user on #/pro. */
export function clearRefFromHash(): void {
  try {
    const u = new URL(window.location.href);
    window.history.replaceState(null, '', `${u.pathname}${u.search}#/pro`);
  } catch {
    /* ignore */
  }
}

export interface VerifiedPayment {
  ok: true;
  plan: ProBillingPlan;
  paidAt: number;
  expiresAt: number;
  reference?: string;
}

export function isVerifiedPayment(v: unknown): v is VerifiedPayment {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.ok === true &&
    (o.plan === 'monthly' || o.plan === 'yearly') &&
    typeof o.expiresAt === 'number' &&
    Number.isFinite(o.expiresAt)
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Paid (server-verified) sources, incl. legacy Paystack entitlements. */
export function isPaidSource(source: string | undefined): boolean {
  return !!source && (source.startsWith('stripe') || source.startsWith('paystack'));
}

/**
 * Pro entitlement from a server-verified payment: one billing period
 * (Stripe's current_period_end), capped at 31 days monthly / 366 days yearly
 * from the later of the period start and now, so a renewed period is never cut short.
 * Keeps the Checkout reference for renewal checks (lib/proRenew).
 */
export function entitlementFromPayment(
  p: VerifiedPayment,
  current?: Entitlement,
  now = Date.now(),
  ref?: string | null,
): Entitlement {
  const days = p.plan === 'yearly' ? 366 : 31;
  const start = Number.isFinite(p.paidAt) && p.paidAt > 0 ? p.paidAt : now;
  let exp = Math.min(p.expiresAt, Math.max(start, now) + days * DAY_MS);
  // Don't shorten an existing paid (non-demo) Pro period.
  if (current?.plan === 'pro' && isPaidSource(current.source) && current.exp && current.exp > exp) {
    exp = current.exp;
  }
  const r = cleanRef(p.reference) || cleanRef(ref) || current?.ref;
  return r ? { plan: 'pro', exp, source: `stripe-${p.plan}`, ref: r } : { plan: 'pro', exp, source: `stripe-${p.plan}` };
}

const EMAIL_KEY = 'bashibook-pay-email';

export function rememberedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
