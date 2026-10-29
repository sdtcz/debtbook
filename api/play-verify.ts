declare const process: { env: Record<string, string | undefined> };

/**
 * Google Play Billing verification for the Android app (Trusted Web Activity, app.bashibook.twa).
 * Separate from the Stripe endpoints (api/verify.ts, api/checkout.ts, api/webhook.ts), which are unchanged.
 *
 * GET               → 200 { ok: true, configured: true } | 501 { ok: false, code: 'not_configured' }
 *                     (the app asks first, so nobody is charged while the server can't verify yet)
 * POST { token, sku } → purchases.subscriptionsv2.get; acknowledges a new purchase (Play refunds
 *                     unacknowledged purchases after 3 days)
 *   → 200 { ok: true, plan, productId, paidAt, expiresAt, state, autoRenewing, acknowledged, test }
 *   → 402 { ok: false, code: 'not_active', state }  (expired / on hold / paused / pending)
 *   → 404 { ok: false, code: 'not_found' }          (unknown token or not one of our subscriptions)
 *   → 400 bad input · 405 · 501 not_configured · 502 Google error
 *
 * Needs GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (service account key JSON with Play Console access to the app;
 * scope androidpublisher). PLAY_PACKAGE_NAME overrides the package. Stores nothing; logs no tokens.
 */

type Req = { method?: string; body?: unknown };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader?: (k: string, v: string) => void;
};

export const PLAY_SKUS = { pro_monthly: 'monthly', pro_yearly: 'yearly' } as const;
export type PlaySku = keyof typeof PLAY_SKUS;
const TOKEN_RE = /^[A-Za-z0-9._:-]{20,2048}$/;
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
/** Still entitled until expiryTime (CANCELED = auto-renew off but paid up). */
const ENTITLED = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string') return null;
    return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, '\n'), token_uri: sa.token_uri };
  } catch {
    return null;
  }
}

function b64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RS256 with Web Crypto (Node 18+ global), so no extra dependency. */
async function signRs256(pem: string, data: string): Promise<string> {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data)));
}

let cached: { email: string; token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount, fetcher: typeof fetch, now = Date.now()): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.exp - 60_000 > now) return cached.token;
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud, iat, exp: iat + 3600 }));
  const sig = await signRs256(sa.private_key, `${head}.${claims}`);
  const res = await fetcher(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new Error(`google_auth_${res.status}`);
  cached = { email: sa.client_email, token: body.access_token, exp: now + (body.expires_in || 3600) * 1000 };
  return body.access_token;
}

/** Test hook: forget the cached Google access token. */
export function resetTokenCache(): void {
  cached = null;
}

type LineItem = { productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } };
export type SubscriptionV2 = {
  subscriptionState?: string;
  acknowledgementState?: string;
  startTime?: string;
  lineItems?: LineItem[];
  testPurchase?: unknown;
};

function parseBody(body: unknown): { token?: unknown; sku?: unknown } {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as { token?: unknown; sku?: unknown };
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' ? (body as { token?: unknown; sku?: unknown }) : {};
}

/** Our line item with the latest expiry, or null. */
export function pickLineItem(sub: SubscriptionV2): { sku: PlaySku; expiresAt: number; autoRenewing: boolean } | null {
  let best: { sku: PlaySku; expiresAt: number; autoRenewing: boolean } | null = null;
  for (const li of sub.lineItems || []) {
    if (!li.productId || !(li.productId in PLAY_SKUS)) continue;
    const t = Date.parse(li.expiryTime || '');
    if (!Number.isFinite(t)) continue;
    if (!best || t > best.expiresAt) {
      best = { sku: li.productId as PlaySku, expiresAt: t, autoRenewing: !!li.autoRenewingPlan?.autoRenewEnabled };
    }
  }
  return best;
}

export async function handlePlayVerify(
  req: Req,
  res: Res,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<void> {
  res.setHeader?.('Cache-Control', 'no-store');
  const sa = readServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!sa) return void res.status(501).json({ ok: false, code: 'not_configured' });
    return void res.status(200).json({ ok: true, configured: true });
  }
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'GET, POST');
    return void res.status(405).json({ ok: false, code: 'method_not_allowed' });
  }
  if (!sa) return void res.status(501).json({ ok: false, code: 'not_configured', message: 'Google Play billing is not configured' });

  const { token, sku } = parseBody(req.body);
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
    return void res.status(400).json({ ok: false, code: 'bad_token' });
  }
  if (sku != null && (typeof sku !== 'string' || !(sku in PLAY_SKUS))) {
    return void res.status(400).json({ ok: false, code: 'bad_sku' });
  }
  const pkg = env.PLAY_PACKAGE_NAME || 'app.bashibook.twa';
  try {
    const auth = await accessToken(sa, fetcher, now);
    const headers = { Authorization: `Bearer ${auth}` };
    const r = await fetcher(`${API}/${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers });
    if (r.status === 400 || r.status === 404 || r.status === 410) {
      return void res.status(404).json({ ok: false, code: 'not_found' });
    }
    if (!r.ok) return void res.status(502).json({ ok: false, code: 'play_error', status: r.status });
    const sub = (await r.json()) as SubscriptionV2;
    const li = pickLineItem(sub);
    if (!li) return void res.status(404).json({ ok: false, code: 'not_found' });
    const state = sub.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED';
    if (!ENTITLED.has(state) || li.expiresAt <= now) {
      return void res.status(402).json({ ok: false, code: 'not_active', state });
    }
    let acknowledged = sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    if (!acknowledged) {
      const a = await fetcher(
        `${API}/${encodeURIComponent(pkg)}/purchases/subscriptions/${li.sku}/tokens/${encodeURIComponent(token)}:acknowledge`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' },
      ).catch(() => null);
      // Not fatal: the app re-verifies on the next open (listPurchases), which retries the acknowledgement.
      acknowledged = !!a && a.ok;
    }
    const start = Date.parse(sub.startTime || '');
    res.status(200).json({
      ok: true,
      plan: PLAY_SKUS[li.sku],
      productId: li.sku,
      paidAt: Number.isFinite(start) ? start : now,
      expiresAt: li.expiresAt,
      state,
      autoRenewing: li.autoRenewing,
      acknowledged,
      test: sub.testPurchase != null,
    });
  } catch {
    res.status(502).json({ ok: false, code: 'play_unavailable' });
  }
}

export default function handler(req: Req, res: Res): Promise<void> {
  return handlePlayVerify(req, res);
}
