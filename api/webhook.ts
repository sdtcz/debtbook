declare const process: { env: Record<string, string | undefined> };

import Stripe from 'stripe';

/**
 * BashiBook Pro webhook (Vercel serverless) — Stripe.
 *
 * Verifies the Stripe-Signature header against the exact raw body with
 * STRIPE_WEBHOOK_SECRET. Missing signature → 400, bad signature → 400.
 * Handles:
 *   checkout.session.completed / checkout.session.async_payment_succeeded
 *     (fulfillment gated on payment_status === 'paid')
 *   customer.subscription.updated / customer.subscription.deleted
 * Offline-first app: entitlement is applied on-device via /api/verify; the
 * webhook is the provider-side audit trail. No secret → 501.
 * (Previous Paystack webhook: see git history, commit f805ac5.)
 */

/** Ask Vercel not to pre-parse the body so the exact raw bytes can be verified. */
export const config = { api: { bodyParser: false } };

type Req = AsyncIterable<Uint8Array | string> & {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

async function readRaw(req: Req): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const enc = new TextEncoder();
  for await (const c of req) {
    const u = typeof c === 'string' ? enc.encode(c) : c;
    chunks.push(u);
    total += u.length;
    if (total > 1_000_000) throw new Error('payload too large');
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

/** Verify signature + parse. Throws on a bad/missing signature. Exported for tests. */
export async function constructStripeEvent(
  raw: Uint8Array | string,
  signature: string | undefined,
  secret: string,
): Promise<Stripe.Event> {
  if (!signature) throw new Error('Missing Stripe-Signature header');
  const payload = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  return Stripe.webhooks.constructEventAsync(payload, signature, secret);
}

/** Summarize an event for logs/acks (no PII beyond ids). Exported for tests. */
export function describeEvent(event: Pick<Stripe.Event, 'type' | 'data'>): Record<string, unknown> {
  const obj = event.data?.object as unknown as Record<string, unknown>;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = obj as { id?: string; payment_status?: string; subscription?: unknown; metadata?: { plan?: string } };
      return {
        type: event.type,
        session: s.id,
        paid: s.payment_status === 'paid',
        plan: s.metadata?.plan,
        subscription: typeof s.subscription === 'string' ? s.subscription : undefined,
      };
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = obj as { id?: string; status?: string; cancel_at_period_end?: boolean; metadata?: { plan?: string } };
      return {
        type: event.type,
        subscription: sub.id,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        plan: sub.metadata?.plan,
      };
    }
    default:
      return { type: event.type, ignored: true };
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(501).json({
      ok: false,
      message: 'Webhook not configured. Set STRIPE_WEBHOOK_SECRET on Vercel.',
    });
    return;
  }

  const sigHeader = req.headers?.['stripe-signature'];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (!signature) {
    res.status(400).json({ ok: false, message: 'Missing Stripe-Signature header' });
    return;
  }

  let raw: Uint8Array;
  try {
    raw = await readRaw(req);
  } catch {
    res.status(400).json({ ok: false, message: 'Could not read body' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = await constructStripeEvent(raw, signature, secret);
  } catch {
    res.status(400).json({ ok: false, message: 'Invalid signature' });
    return;
  }

  const summary = describeEvent(event);
  if ((HANDLED_EVENTS as readonly string[]).includes(event.type)) {
    console.log('stripe event', event.id, JSON.stringify(summary));
  } else {
    console.log('stripe event ignored', event.id, event.type);
  }
  res.status(200).json({ ok: true, received: true });
}
