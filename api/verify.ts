declare const process: { env: Record<string, string | undefined> };

/**
 * BashiBook Pro payment verification (Vercel serverless).
 *
 * GET ?reference=… → Paystack /transaction/verify/:reference (server-side)
 * Paid only if status === 'success', currency NGN and amount matches the plan.
 * → { ok: true, plan, paidAt, expiresAt } or { ok: false, code, message }
 *
 * Never trusts client claims of payment. No key → 501.
 */

type ProPlan = 'monthly' | 'yearly';

/** Keep in sync with api/checkout.ts (server-side price list, kobo). */
const PLAN_AMOUNT_KOBO: Record<ProPlan, number> = {
  monthly: 150_000,
  yearly: 1_200_000,
};

const PLAN_DAYS: Record<ProPlan, number> = { monthly: 30, yearly: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidReference(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9_.=-]{1,100}$/.test(ref);
}

export interface PaystackTx {
  status?: string;
  currency?: string;
  amount?: number;
  reference?: string;
  paid_at?: string | null;
  paidAt?: string | null;
  metadata?: unknown;
}

export type VerifyOutcome =
  | { ok: true; plan: ProPlan; paidAt: number; expiresAt: number; reference?: string }
  | { ok: false; code: string; message: string };

function metaPlan(metadata: unknown): unknown {
  let m = metadata;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return undefined;
    }
  }
  return m && typeof m === 'object' ? (m as { plan?: unknown }).plan : undefined;
}

/** Pure check of a Paystack verify payload. Exported for tests. */
export function evaluatePaystackTx(tx: PaystackTx | null | undefined, now = Date.now()): VerifyOutcome {
  if (!tx) return { ok: false, code: 'not_found', message: 'Payment not found' };
  if (tx.status !== 'success') {
    return { ok: false, code: 'not_paid', message: `Payment not successful (${tx.status || 'unknown'})` };
  }
  if (tx.currency !== 'NGN') {
    return { ok: false, code: 'bad_currency', message: 'Unexpected currency' };
  }
  const claimed = metaPlan(tx.metadata);
  const plan: ProPlan | undefined =
    claimed === 'monthly' || claimed === 'yearly'
      ? claimed
      : (Object.keys(PLAN_AMOUNT_KOBO) as ProPlan[]).find((p) => PLAN_AMOUNT_KOBO[p] === tx.amount);
  if (!plan || tx.amount !== PLAN_AMOUNT_KOBO[plan]) {
    return { ok: false, code: 'bad_amount', message: 'Amount does not match plan' };
  }
  const paidRaw = tx.paid_at || tx.paidAt;
  const parsed = paidRaw ? Date.parse(paidRaw) : NaN;
  const paidAt = Number.isFinite(parsed) ? parsed : now;
  return {
    ok: true,
    plan,
    paidAt,
    expiresAt: paidAt + PLAN_DAYS[plan] * DAY_MS,
    reference: tx.reference,
  };
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
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    res.status(501).json({ ok: false, code: 'not_configured', message: 'Paystack not configured' });
    return;
  }
  const raw = req.query?.reference ?? req.query?.trxref;
  const reference = Array.isArray(raw) ? raw[0] : raw;
  if (!isValidReference(reference)) {
    res.status(400).json({ ok: false, code: 'bad_reference', message: 'Missing or invalid reference' });
    return;
  }

  try {
    const r = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const data = (await r.json().catch(() => null)) as
      | { status?: boolean; message?: string; data?: PaystackTx }
      | null;
    if (!r.ok || !data?.status) {
      // Unknown reference → 404 from Paystack
      const notFound = r.status === 400 || r.status === 404;
      res.status(notFound ? 404 : 502).json({
        ok: false,
        code: notFound ? 'not_found' : 'provider_error',
        message: notFound ? 'Payment not found' : 'Could not verify payment. Try again.',
      });
      return;
    }
    const outcome = evaluatePaystackTx(data.data);
    res.status(outcome.ok ? 200 : 402).json(outcome);
  } catch (err) {
    console.error('paystack verify error', (err as Error)?.message);
    res.status(502).json({ ok: false, code: 'provider_unreachable', message: 'Paystack is unreachable. Try again.' });
  }
}
