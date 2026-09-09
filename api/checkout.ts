/**
 * DebtBook Pro checkout stub (Vercel serverless).
 *
 * Preferred for Nigeria (NGN): Paystack — https://paystack.com
 * Optional: Stripe Checkout.
 *
 * Wire real calls only when env secrets exist:
 *   PAYSTACK_SECRET_KEY  (+ PAYSTACK_PLAN_CODE_MONTHLY / _YEARLY)
 *   or STRIPE_SECRET_KEY (+ STRIPE_PRICE_MONTHLY / _YEARLY)
 *
 * Missing secrets → 501 with a clear message (does not fail the Vite build).
 */

type Req = { method?: string; body?: { plan?: string } };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const plan = req.body?.plan || 'monthly';
  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (paystackKey) {
    // Placeholder: initialize Paystack transaction / subscription when ready
    res.status(501).json({
      ok: false,
      message:
        'Paystack key present but checkout not fully wired yet. Use Activate Pro (demo) or finish api/checkout.ts.',
      provider: 'paystack',
      plan,
    });
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
