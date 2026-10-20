declare const process: { env: Record<string, string | undefined> };

/**
 * BashiBook Pro checkout (Vercel serverless).
 *
 * POST { plan: 'monthly' | 'yearly', email }
 *   → Paystack /transaction/initialize (NGN, amount in kobo, metadata {plan})
 *   → { ok: true, authorization_url, reference }
 *
 * Secrets stay server-side (PAYSTACK_SECRET_KEY). Never sent to the client.
 * Stripe path is still a 501 stub. No key → 501.
 */

export type ProPlan = 'monthly' | 'yearly';

/** Server-side price list (kobo). Client claims are never trusted. */
export const PLAN_AMOUNT_KOBO: Record<ProPlan, number> = {
  monthly: 150_000, // ₦1,500
  yearly: 1_200_000, // ₦12,000
};

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

const DEFAULT_ORIGIN = 'https://debtbook-neon.vercel.app';

/** Callback origin from the request host, limited to safe hosts (no open redirect). */
export function callbackOrigin(headers: Record<string, string | string[] | undefined> | undefined): string {
  const pick = (k: string) => {
    const v = headers?.[k];
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim().toLowerCase();
  };
  const host = pick('x-forwarded-host') || pick('host');
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return DEFAULT_ORIGIN;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  if (host === 'debtbook-neon.vercel.app' || /^debtbook[a-z0-9-]*\.vercel\.app$/.test(host)) {
    return `https://${host}`;
  }
  return DEFAULT_ORIGIN;
}

export function callbackUrl(origin: string): string {
  // Paystack appends &trxref=…&reference=… to this URL on return.
  return `${origin}/?app=1&paystack=1`;
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

export default async function handler(req: Req, res: Res) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const body = parseBody(req.body);
  const plan = body.plan ?? 'monthly';
  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (paystackKey) {
    if (!isProPlan(plan)) {
      res.status(400).json({ ok: false, code: 'bad_plan', message: 'Plan must be monthly or yearly' });
      return;
    }
    if (!isValidEmail(body.email)) {
      res.status(400).json({
        ok: false,
        code: 'email_required',
        message: 'A valid email is required for Paystack checkout',
      });
      return;
    }
    const email = body.email.trim().toLowerCase();
    try {
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: PLAN_AMOUNT_KOBO[plan],
          currency: 'NGN',
          callback_url: callbackUrl(callbackOrigin(req.headers)),
          metadata: { plan, product: 'bashibook-pro' },
        }),
      });
      const data = (await r.json().catch(() => null)) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; reference?: string };
      } | null;
      if (!r.ok || !data?.status || !data.data?.authorization_url || !data.data.reference) {
        console.error('paystack initialize failed', r.status, data?.message);
        res.status(502).json({
          ok: false,
          code: 'provider_error',
          message: 'Could not start Paystack checkout. Try again.',
        });
        return;
      }
      res.status(200).json({
        ok: true,
        provider: 'paystack',
        plan,
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
      });
    } catch (err) {
      console.error('paystack initialize error', (err as Error)?.message);
      res.status(502).json({
        ok: false,
        code: 'provider_unreachable',
        message: 'Paystack is unreachable. Try again.',
      });
    }
    return;
  }

  if (stripeKey) {
    res.status(501).json({
      ok: false,
      message:
        'Stripe key present but checkout not fully wired yet. Use Activate Pro (demo) or finish api/checkout.ts.',
      provider: 'stripe',
      plan,
    });
    return;
  }

  res.status(501).json({
    ok: false,
    message:
      'Checkout not configured. Set PAYSTACK_SECRET_KEY (preferred for NGN) or STRIPE_SECRET_KEY. Until then use Activate Pro (demo) in Settings → Pro.',
    plan,
  });
}
