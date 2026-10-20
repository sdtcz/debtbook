declare const process: { env: Record<string, string | undefined> };

import Stripe from 'stripe';

/**
 * BashiBook Pro payment verification (Vercel serverless) — Stripe.
 *
 * GET ?reference=<Checkout Session id> (also accepts ?session_id=)
 *   → stripe.checkout.sessions.retrieve(id, { expand: ['subscription'] })
 * Pro only if the session is a complete subscription checkout with
 * payment_status 'paid', USD amount matching the plan, and the subscription
 * status 'active'.
 * → { ok: true, plan, paidAt, expiresAt, reference } or { ok: false, code, message }
 *
 * Never trusts client claims of payment. No key → 501.
 * (Previous Paystack verify: see git history, commit f805ac5.)
 */

type ProPlan = 'monthly' | 'yearly';

/** Keep in sync with api/checkout.ts (server-side price list, USD cents). */
const PLAN_AMOUNT_CENTS: Record<ProPlan, number> = {
  monthly: 199,
  yearly: 1500,
};

const PLAN_DAYS: Record<ProPlan, number> = { monthly: 30, yearly: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Checkout Session ids look like cs_live_… / cs_test_… */
export function isValidReference(ref: unknown): ref is string {
  return typeof ref === 'string' && /^cs_(live|test)_[A-Za-z0-9]{10,240}$/.test(ref);
}

/** The subset of a Checkout Session we rely on (subscription expanded). */
export interface StripeSessionLike {
  id?: string;
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  currency?: string | null;
  amount_total?: number | null;
  created?: number;
  metadata?: Record<string, string> | null;
  subscription?:
    | string
    | {
        status?: string;
        start_date?: number;
        items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
      }
    | null;
}

export type VerifyOutcome =
  | { ok: true; plan: ProPlan; paidAt: number; expiresAt: number; reference?: string }
  | { ok: false; code: string; message: string };

/** Pure check of a retrieved Checkout Session. Exported for tests. */
export function evaluateStripeSession(
  s: StripeSessionLike | null | undefined,
  now = Date.now(),
): VerifyOutcome {
  if (!s) return { ok: false, code: 'not_found', message: 'Payment not found' };
  if (s.mode !== 'subscription') {
    return { ok: false, code: 'bad_mode', message: 'Not a Pro subscription checkout' };
  }
  if (s.payment_status !== 'paid' || s.status !== 'complete') {
    return {
      ok: false,
      code: 'not_paid',
      message: `Payment not successful (${s.payment_status || s.status || 'unknown'})`,
    };
  }
  if ((s.currency || '').toLowerCase() !== 'usd') {
    return { ok: false, code: 'bad_currency', message: 'Unexpected currency' };
  }
  const claimed = s.metadata?.plan;
  const plan: ProPlan | undefined =
    claimed === 'monthly' || claimed === 'yearly'
      ? claimed
      : (Object.keys(PLAN_AMOUNT_CENTS) as ProPlan[]).find((p) => PLAN_AMOUNT_CENTS[p] === s.amount_total);
  if (!plan || s.amount_total !== PLAN_AMOUNT_CENTS[plan]) {
    return { ok: false, code: 'bad_amount', message: 'Amount does not match plan' };
  }
  const sub = s.subscription;
  if (!sub || typeof sub === 'string') {
    return { ok: false, code: 'no_subscription', message: 'Subscription not found' };
  }
  if (sub.status !== 'active') {
    return { ok: false, code: 'not_active', message: `Subscription not active (${sub.status || 'unknown'})` };
  }
  const item = sub.items?.data?.[0];
  const startSec = item?.current_period_start || sub.start_date || s.created;
  const paidAt = startSec ? startSec * 1000 : now;
  const fallbackExp = paidAt + PLAN_DAYS[plan] * DAY_MS;
  const expiresAt = item?.current_period_end ? item.current_period_end * 1000 : fallbackExp;
  return { ok: true, plan, paidAt, expiresAt, reference: s.id };
}

type Req = { method?: string; query?: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

export default async function handler(req: Req, res: Res) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    res.status(501).json({ ok: false, code: 'not_configured', message: 'Stripe not configured' });
    return;
  }
  const raw = req.query?.reference ?? req.query?.session_id;
  const reference = Array.isArray(raw) ? raw[0] : raw;
  if (!isValidReference(reference)) {
    res.status(400).json({ ok: false, code: 'bad_reference', message: 'Missing or invalid reference' });
    return;
  }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.retrieve(reference, { expand: ['subscription'] });
    const outcome = evaluateStripeSession(session as unknown as StripeSessionLike);
    res.status(outcome.ok ? 200 : 402).json(outcome);
  } catch (err) {
    const e = err as { statusCode?: number; code?: string; type?: string; message?: string };
    const notFound = e?.statusCode === 404 || e?.code === 'resource_missing';
    if (!notFound) console.error('stripe verify error', e?.type, e?.statusCode, e?.message);
    res.status(notFound ? 404 : 502).json({
      ok: false,
      code: notFound ? 'not_found' : 'provider_error',
      message: notFound ? 'Payment not found' : 'Could not verify payment. Try again.',
    });
  }
}
