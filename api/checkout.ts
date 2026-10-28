declare const process: { env: Record<string, string | undefined> };

import Stripe from 'stripe';

/**
 * BashiBook Pro checkout (Vercel serverless) — Stripe Checkout, subscription mode.
 *
 * POST { plan: 'monthly' | 'yearly', email }
 *   → stripe.checkout.sessions.create (USD inline price_data, customer_email,
 *     metadata {plan}, success_url ?session_id={CHECKOUT_SESSION_ID})
 *   → { ok: true, provider: 'stripe', plan, authorization_url, url, reference }
 *
 * Secret stays server-side (STRIPE_SECRET_KEY). Never sent to the client.
 * No key → 501. (Previous Paystack flow: see git history, commit f805ac5.)
 */

export type ProPlan = 'monthly' | 'yearly';

/** Server-side price list (USD cents). Client claims are never trusted. */
export const PLAN_AMOUNT_CENTS: Record<ProPlan, number> = {
  monthly: 199, // $1.99 / month
  yearly: 1500, // $15 / year
};

export const PLAN_INTERVAL: Record<ProPlan, 'month' | 'year'> = {
  monthly: 'month',
  yearly: 'year',
};

export const PLAN_CURRENCY = 'usd';
export const PRODUCT_NAME = 'BashiBook Pro';
/** Dashboard label for this Checkout flow (8-letter random suffix). */
export const INTEGRATION_IDENTIFIER = 'bashibook_pro_qkzvmtrw';

export function isProPlan(v: unknown): v is ProPlan {
  return v === 'monthly' || v === 'yearly';
}

export function isValidEmail(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
  );
}

const DEFAULT_ORIGIN = 'https://bashibook.app';

/** Return origin from the request host, limited to safe hosts (no open redirect). */
export function callbackOrigin(headers: Record<string, string | string[] | undefined> | undefined): string {
  const pick = (k: string) => {
    const v = headers?.[k];
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim().toLowerCase();
  };
  const host = pick('x-forwarded-host') || pick('host');
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return DEFAULT_ORIGIN;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  if (
    host === 'bashibook.app' ||
    host === 'www.bashibook.app' ||
    host === 'debtbook-neon.vercel.app' ||
    /^debtbook[a-z0-9-]*\.vercel\.app$/.test(host)
  ) {
    return `https://${host}`;
  }
  return DEFAULT_ORIGIN;
}

/** Stripe replaces {CHECKOUT_SESSION_ID} on redirect; the app rewrites it to #/pro?ref=… */
export function successUrl(origin: string): string {
  return `${origin}/?app=1&checkout=stripe&session_id={CHECKOUT_SESSION_ID}`;
}

export function cancelUrl(origin: string): string {
  return `${origin}/?app=1#/pro`;
}

/** Pure builder for the Checkout Session params. Exported for tests. */
export function buildSessionParams(
  plan: ProPlan,
  email: string,
  origin: string,
): Stripe.Checkout.SessionCreateParams {
  const metadata = { plan, product: 'bashibook-pro' };
  return {
    mode: 'subscription',
    customer_email: email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PLAN_CURRENCY,
          unit_amount: PLAN_AMOUNT_CENTS[plan],
          recurring: { interval: PLAN_INTERVAL[plan] },
          product_data: { name: PRODUCT_NAME },
        },
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: successUrl(origin),
    cancel_url: cancelUrl(origin),
    integration_identifier: INTEGRATION_IDENTIFIER,
  };
}

type Req = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

function parseBody(body: unknown): { plan?: unknown; email?: unknown } {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as { plan?: unknown; email?: unknown };
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? (body as { plan?: unknown; email?: unknown }) : {};
}

export const NOT_CONFIGURED_MESSAGE =
  'Checkout not configured. Set STRIPE_SECRET_KEY on Vercel. Until then use Activate Pro (demo) in Settings → Pro.';

export default async function handler(req: Req, res: Res) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const body = parseBody(req.body);
  const plan = body.plan ?? 'monthly';
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    res.status(501).json({ ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE, plan });
    return;
  }
  if (!isProPlan(plan)) {
    res.status(400).json({ ok: false, code: 'bad_plan', message: 'Plan must be monthly or yearly' });
    return;
  }
  if (!isValidEmail(body.email)) {
    res.status(400).json({
      ok: false,
      code: 'email_required',
      message: 'A valid email is required for checkout',
    });
    return;
  }
  const email = body.email.trim().toLowerCase();

  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create(
      buildSessionParams(plan, email, callbackOrigin(req.headers)),
    );
    if (!session.url) {
      res.status(502).json({ ok: false, code: 'provider_error', message: 'Could not start checkout. Try again.' });
      return;
    }
    res.status(200).json({
      ok: true,
      provider: 'stripe',
      plan,
      authorization_url: session.url,
      url: session.url,
      reference: session.id,
    });
  } catch (err) {
    const e = err as { type?: string; message?: string; statusCode?: number };
    console.error('stripe checkout create failed', e?.type, e?.statusCode, e?.message);
    res.status(502).json({
      ok: false,
      code: 'provider_error',
      message: 'Could not start secure checkout. Try again.',
    });
  }
}
