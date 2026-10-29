import { beforeEach, describe, expect, it } from 'vitest';
import { handlePlayVerify, pickLineItem, readServiceAccount, resetTokenCache } from '../../api/play-verify';

async function pem(): Promise<string> {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
}

const NOW = Date.parse('2026-11-01T00:00:00Z');
const TOKEN = 'abcdefghijklmnopqrstuvwxyz.AO-J1Oz_123';
let env: Record<string, string>;
let calls: { url: string; init?: RequestInit }[];
let sub: Record<string, unknown>;
let subStatus = 200;
let ackStatus = 204;

const fetcher = (async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
  if (url.endsWith(':acknowledge')) return new Response(null, { status: ackStatus });
  if (url.includes('subscriptionsv2')) return new Response(JSON.stringify(sub), { status: subStatus });
  return new Response('{}', { status: 500 });
}) as unknown as typeof fetch;

function call(method: string, body?: unknown, e: Record<string, string | undefined> = env) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
    let status = 200;
    const res = {
      status(c: number) {
        status = c;
        return res;
      },
      json(b: unknown) {
        resolve({ status, body: b as Record<string, unknown> });
      },
    };
    void handlePlayVerify({ method, body }, res, e, fetcher, NOW);
  });
}

beforeEach(async () => {
  resetTokenCache();
  env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'play@x.iam.gserviceaccount.com', private_key: await pem() }) };
  calls = [];
  subStatus = 200;
  ackStatus = 204;
  sub = {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    startTime: '2026-10-31T10:00:00Z',
    lineItems: [{ productId: 'pro_monthly', expiryTime: '2026-11-30T10:00:00Z', autoRenewingPlan: { autoRenewEnabled: true } }],
  };
});

describe('api/play-verify', () => {
  it('501 not_configured without the service account (GET and POST)', async () => {
    expect((await call('GET', undefined, {})).status).toBe(501);
    const r = await call('POST', { token: TOKEN }, {});
    expect(r.status).toBe(501);
    expect(r.body.code).toBe('not_configured');
    expect(calls.length).toBe(0);
  });

  it('GET says configured when the key is set', async () => {
    expect(await call('GET')).toEqual({ status: 200, body: { ok: true, configured: true } });
  });

  it('verifies an active subscription, signs a JWT and acknowledges it', async () => {
    const r = await call('POST', { token: TOKEN, sku: 'pro_monthly' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, plan: 'monthly', productId: 'pro_monthly', acknowledged: true, autoRenewing: true });
    expect(r.body.expiresAt).toBe(Date.parse('2026-11-30T10:00:00Z'));
    const auth = calls[0];
    const assertion = new URLSearchParams(String(auth.init?.body)).get('assertion')!;
    expect(assertion.split('.')).toHaveLength(3);
    const claims = JSON.parse(atob(assertion.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expect(claims.scope).toBe('https://www.googleapis.com/auth/androidpublisher');
    expect(calls[1].url).toContain('/applications/app.bashibook.twa/purchases/subscriptionsv2/tokens/');
    expect(calls[2].url).toContain('/purchases/subscriptions/pro_monthly/tokens/');
    expect(calls[2].url.endsWith(':acknowledge')).toBe(true);
  });

  it('does not acknowledge twice and accepts cancelled-but-paid-up', async () => {
    sub.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    sub.subscriptionState = 'SUBSCRIPTION_STATE_CANCELED';
    const r = await call('POST', JSON.stringify({ token: TOKEN }));
    expect(r.status).toBe(200);
    expect(calls.some((c) => c.url.endsWith(':acknowledge'))).toBe(false);
  });

  it('402 for expired / on-hold subscriptions', async () => {
    sub.subscriptionState = 'SUBSCRIPTION_STATE_ON_HOLD';
    expect((await call('POST', { token: TOKEN })).body).toMatchObject({ code: 'not_active' });
    sub.subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE';
    sub.lineItems = [{ productId: 'pro_yearly', expiryTime: '2026-10-01T00:00:00Z' }];
    expect((await call('POST', { token: TOKEN })).status).toBe(402);
  });

  it('404 for unknown tokens or other products; 400 for bad input; 502 on Google errors', async () => {
    subStatus = 410;
    expect((await call('POST', { token: TOKEN })).status).toBe(404);
    subStatus = 200;
    sub.lineItems = [{ productId: 'gems', expiryTime: '2027-01-01T00:00:00Z' }];
    expect((await call('POST', { token: TOKEN })).status).toBe(404);
    expect((await call('POST', { token: 'short' })).status).toBe(400);
    expect((await call('POST', { token: TOKEN, sku: 'gold' })).status).toBe(400);
    expect((await call('PUT', {})).status).toBe(405);
    subStatus = 503;
    expect((await call('POST', { token: TOKEN })).status).toBe(502);
  });

  it('a failed acknowledgement still returns Pro (retried on next app open)', async () => {
    ackStatus = 500;
    const r = await call('POST', { token: TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.acknowledged).toBe(false);
  });

  it('helpers', () => {
    expect(readServiceAccount('{bad')).toBeNull();
    expect(readServiceAccount('{"client_email":"a"}')).toBeNull();
    expect(readServiceAccount('{"client_email":"a","private_key":"x\\\\ny"}')?.private_key).toBe('x\ny');
    expect(
      pickLineItem({ lineItems: [
        { productId: 'pro_monthly', expiryTime: '2026-11-01T00:00:00Z' },
        { productId: 'pro_yearly', expiryTime: '2027-11-01T00:00:00Z' },
      ] })?.sku,
    ).toBe('pro_yearly');
  });
});
