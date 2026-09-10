declare const process: { env: Record<string, string | undefined> };

/**
 * BashiBook Pro webhook stub (Vercel serverless).
 *
 * Paystack: verify x-paystack-signature with PAYSTACK_SECRET_KEY
 * Stripe: verify Stripe-Signature with STRIPE_WEBHOOK_SECRET
 *
 * On successful charge → mark entitlement plan=pro (needs user mapping —
 * offline MVP uses Activate Pro demo instead).
 *
 * Missing secrets → 501. Does not fail the Vite frontend build.
 */

type Req = { method?: string };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!paystackKey && !stripeSecret) {
    res.status(501).json({
      ok: false,
      message:
        'Webhook stub — configure PAYSTACK_SECRET_KEY or STRIPE_WEBHOOK_SECRET to verify events.',
    });
    return;
  }

  res.status(501).json({
    ok: false,
    message:
      'Webhook received but entitlement sync is not wired yet (offline-first demo uses Activate Pro).',
  });
}
