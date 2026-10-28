declare const process: { env: Record<string, string | undefined> };

import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import checkoutHandler, {
  NOT_CONFIGURED_MESSAGE,
  PLAN_AMOUNT_CENTS,
  buildSessionParams,
  callbackOrigin,
  isProPlan,
  isValidEmail,
} from '../../api/checkout';
import { evaluateStripeSession, isValidReference } from '../../api/verify';
import webhookHandler, { constructStripeEvent, describeEvent } from '../../api/webhook';
import { entitlementFromPayment, refFromHash, refFromSearch } from './checkoutReturn';

const DAY = 24 * 60 * 60 * 1000;
const t0s = Math.floor(Date.parse('2026-10-19T12:00:00.000Z') / 1000);
const t0 = t0s * 1000;

function mockRes() {
  const out: { code?: number; body?: unknown } = {};
  const res = {
    status(c: number) {
      out.code = c;
      return res;
    },
    json(b: unknown) {
      out.body = b;
    },
    setHeader() {},
  };
  return { res, out };
}

describe('stripe checkout session', () => {
  it('prices plans in USD cents server-side', () => {
    expect(PLAN_AMOUNT_CENTS.monthly).toBe(199);
    expect(PLAN_AMOUNT_CENTS.yearly).toBe(1500);
    expect(isProPlan('monthly')).toBe(true);
    expect(isProPlan('weekly')).toBe(false);
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it('builds a subscription session with inline price_data', () => {
    const m = buildSessionParams('monthly', 'a@b.co', 'https://debtbook-neon.vercel.app');
    expect(m.mode).toBe('subscription');
    expect(m.customer_email).toBe('a@b.co');
    expect('payment_method_types' in m).toBe(false);
    const pd = m.line_items?.[0]?.price_data;
    expect(pd).toMatchObject({
      currency: 'usd',
      unit_amount: 199,
      recurring: { interval: 'month' },
      product_data: { name: 'BashiBook Pro' },
    });
    expect(m.success_url).toBe(
      'https://debtbook-neon.vercel.app/?app=1&checkout=stripe&session_id={CHECKOUT_SESSION_ID}',
    );
    expect(m.cancel_url).toBe('https://debtbook-neon.vercel.app/?app=1#/pro');
    const b = buildSessionParams('monthly', 'a@b.co', callbackOrigin({ host: 'bashibook.app' }));
    expect(b.success_url).toBe('https://bashibook.app/?app=1&checkout=stripe&session_id={CHECKOUT_SESSION_ID}');
    expect(b.cancel_url).toBe('https://bashibook.app/?app=1#/pro');
    expect(m.metadata?.plan).toBe('monthly');
    const y = buildSessionParams('yearly', 'a@b.co', 'https://debtbook-neon.vercel.app');
    expect(y.line_items?.[0]?.price_data).toMatchObject({ unit_amount: 1500, recurring: { interval: 'year' } });
  });

  it('only redirects back to safe hosts', () => {
    expect(callbackOrigin({ host: 'debtbook-neon.vercel.app' })).toBe('https://debtbook-neon.vercel.app');
    expect(callbackOrigin({ host: 'evil.example.com' })).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'bashibook.app' })).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'www.bashibook.app' })).toBe('https://www.bashibook.app');
    expect(callbackOrigin({ 'x-forwarded-host': 'bashibook.app', host: 'debtbook-neon.vercel.app' })).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'debtbook-git-main-s-dz-8.vercel.app' })).toBe('https://debtbook-git-main-s-dz-8.vercel.app');
    expect(callbackOrigin({ host: 'bashibook.app.evil.com' })).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'evilbashibook.app' })).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'debtbook.evil.app' })).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'bashibook.app/x' })).toBe('https://bashibook.app');
    expect(callbackOrigin({})).toBe('https://bashibook.app');
    expect(callbackOrigin(undefined)).toBe('https://bashibook.app');
    expect(callbackOrigin({ host: 'localhost:5173' })).toBe('http://localhost:5173');
  });

  it('returns 501 with a clear message when STRIPE_SECRET_KEY is missing', async () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    const { res, out } = mockRes();
    await checkoutHandler({ method: 'POST', body: { plan: 'monthly', email: 'a@b.co' } }, res);
    expect(out.code).toBe(501);
    expect(out.body).toMatchObject({ ok: false, message: NOT_CONFIGURED_MESSAGE });
    if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev;
  });
});

describe('stripe verify', () => {
  const sub = {
    status: 'active',
    items: { data: [{ current_period_start: t0s, current_period_end: t0s + 31 * 86400 }] },
  };
  const base = {
    id: 'cs_test_a1B2c3D4e5F6g7H8',
    mode: 'subscription',
    status: 'complete',
    payment_status: 'paid',
    currency: 'usd',
    created: t0s,
    subscription: sub,
  };

  it('accepts paid + active monthly / yearly sessions with period expiry', () => {
    const m = evaluateStripeSession({ ...base, amount_total: 199, metadata: { plan: 'monthly' } });
    expect(m).toMatchObject({ ok: true, plan: 'monthly', paidAt: t0, expiresAt: t0 + 31 * DAY });
    const y = evaluateStripeSession({
      ...base,
      amount_total: 1500,
      metadata: { plan: 'yearly' },
      subscription: { status: 'active' },
    });
    expect(y).toMatchObject({ ok: true, plan: 'yearly' });
    if (y.ok) expect(y.expiresAt - y.paidAt).toBe(365 * DAY);
  });

  it('rejects unpaid, inactive, wrong amount/currency/mode, or missing subscription', () => {
    const ok = { ...base, amount_total: 199, metadata: { plan: 'monthly' } };
    expect(evaluateStripeSession({ ...ok, payment_status: 'unpaid' }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, status: 'open' }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, subscription: { ...sub, status: 'incomplete' } }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, subscription: { ...sub, status: 'canceled' } }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, subscription: 'sub_123' }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, subscription: null }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, amount_total: 100 }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, metadata: { plan: 'yearly' } }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, currency: 'ngn' }).ok).toBe(false);
    expect(evaluateStripeSession({ ...ok, mode: 'payment' }).ok).toBe(false);
    expect(evaluateStripeSession(null).ok).toBe(false);
  });

  it('validates Checkout Session ids', () => {
    expect(isValidReference('cs_live_a1B2c3D4e5F6g7H8i9J0')).toBe(true);
    expect(isValidReference('cs_test_a1B2c3D4e5F6g7H8i9J0')).toBe(true);
    expect(isValidReference('../etc')).toBe(false);
    expect(isValidReference('T1')).toBe(false);
    expect(isValidReference('')).toBe(false);
  });
});

describe('stripe webhook signature', () => {
  const secret = 'whsec_dummy_for_unit_tests';
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', payment_status: 'paid', metadata: { plan: 'monthly' } } },
  });

  it('accepts a valid Stripe-Signature over the raw body and rejects anything else', async () => {
    const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
    const ev = await constructStripeEvent(payload, header, secret);
    expect(ev.type).toBe('checkout.session.completed');
    expect(describeEvent(ev)).toMatchObject({ paid: true, plan: 'monthly' });
    await expect(constructStripeEvent(payload + ' ', header, secret)).rejects.toThrow();
    await expect(constructStripeEvent(payload, header, 'whsec_other')).rejects.toThrow();
    await expect(constructStripeEvent(payload, undefined, secret)).rejects.toThrow();
    await expect(constructStripeEvent(payload, 't=1,v1=abc', secret)).rejects.toThrow();
  });

  it('handler rejects unsigned / badly signed requests and acks signed ones', async () => {
    const prev = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const req = (headers: Record<string, string>, body: string) =>
      Object.assign(
        (async function* () {
          yield new TextEncoder().encode(body);
        })(),
        { method: 'POST', headers },
      );
    try {
      let r = mockRes();
      await webhookHandler(req({}, payload), r.res);
      expect(r.out.code).toBe(400);
      r = mockRes();
      await webhookHandler(req({ 'stripe-signature': 't=1,v1=deadbeef' }, payload), r.res);
      expect(r.out.code).toBe(400);
      const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
      r = mockRes();
      await webhookHandler(req({ 'stripe-signature': header }, payload), r.res);
      expect(r.out.code).toBe(200);
      const subPayload = JSON.stringify({
        id: 'evt_2',
        object: 'event',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_1', status: 'canceled' } },
      });
      const h2 = await Stripe.webhooks.generateTestHeaderStringAsync({ payload: subPayload, secret });
      r = mockRes();
      await webhookHandler(req({ 'stripe-signature': h2 }, subPayload), r.res);
      expect(r.out.code).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = prev;
    }
  });
});

describe('stripe return (client)', () => {
  it('reads the session id from the success_url and hash route', () => {
    expect(refFromSearch('?app=1&checkout=stripe&session_id=cs_test_T1')).toBe('cs_test_T1');
    expect(refFromSearch('?app=1')).toBeNull();
    expect(refFromHash('#/pro?ref=cs_test_T2')).toBe('cs_test_T2');
    expect(refFromHash('#/pro')).toBeNull();
  });

  it('sets Pro for one billing period from a verified payment', () => {
    const m = entitlementFromPayment({ ok: true, plan: 'monthly', paidAt: t0, expiresAt: t0 + 30 * DAY });
    expect(m).toEqual({ plan: 'pro', exp: t0 + 30 * DAY, source: 'stripe-monthly' });
    const y = entitlementFromPayment({ ok: true, plan: 'yearly', paidAt: t0, expiresAt: t0 + 365 * DAY });
    expect(y.exp).toBe(t0 + 365 * DAY);
    const capped = entitlementFromPayment({ ok: true, plan: 'monthly', paidAt: t0, expiresAt: t0 + 90 * DAY });
    expect(capped.exp).toBe(t0 + 31 * DAY);
  });
});
