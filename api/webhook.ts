declare const process: { env: Record<string, string | undefined> };

/**
 * BashiBook Pro webhook (Vercel serverless).
 *
 * Paystack: verifies x-paystack-signature = HMAC-SHA512(raw body, PAYSTACK_SECRET_KEY).
 * Bad / missing signature → 401. charge.success → logged + 200 ack.
 * (Offline-first app: entitlement is applied on-device via /api/verify; the
 * webhook is the provider-side audit trail.)
 *
 * Stripe: still a stub (501). No secrets → 501.
 */

/** Ask Vercel not to pre-parse the body so the exact raw bytes can be signed. */
export const config = { api: { bodyParser: false } };

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha512Hex(secret: string, payload: Uint8Array | string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const data = typeof payload === 'string' ? enc.encode(payload) : payload;
  return toHex(await crypto.subtle.sign('HMAC', key, data));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only when signature is the hex HMAC-SHA512 of the raw body. */
export async function verifyPaystackSignature(
  secret: string,
  rawBody: Uint8Array | string,
  signature: string | undefined | null,
): Promise<boolean> {
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = await hmacSha512Hex(secret, rawBody);
  return timingSafeEqualStr(expected, signature.toLowerCase());
}

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

  const sigHeader = req.headers?.['x-paystack-signature'];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

  if (paystackKey && (signature || !stripeSecret)) {
    let raw: Uint8Array;
    try {
      raw = await readRaw(req);
    } catch {
      res.status(400).json({ ok: false, message: 'Could not read body' });
      return;
    }
    if (!(await verifyPaystackSignature(paystackKey, raw, signature))) {
      res.status(401).json({ ok: false, message: 'Invalid signature' });
      return;
    }
    let event: { event?: string; data?: { reference?: string; amount?: number; currency?: string; status?: string; metadata?: { plan?: string } } } = {};
    try {
      event = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      res.status(400).json({ ok: false, message: 'Invalid JSON' });
      return;
    }
    if (event.event === 'charge.success') {
      const d = event.data || {};
      console.log(
        'paystack charge.success',
        JSON.stringify({
          reference: d.reference,
          amount: d.amount,
          currency: d.currency,
          status: d.status,
          plan: d.metadata?.plan,
        }),
      );
    } else {
      console.log('paystack event ignored', event.event);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(501).json({
    ok: false,
    message: 'Stripe webhook verification is not wired yet.',
  });
}
