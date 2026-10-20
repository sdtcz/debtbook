import { describe, expect, it } from 'vitest';
import {
  PLAN_AMOUNT_KOBO,
  callbackOrigin,
  isProPlan,
  isValidEmail,
} from '../../api/checkout';
import { evaluatePaystackTx, isValidReference } from '../../api/verify';
import { hmacSha512Hex, verifyPaystackSignature } from '../../api/webhook';
import { entitlementFromPayment, refFromHash, refFromSearch } from './paystackReturn';

const DAY = 24 * 60 * 60 * 1000;
const paidAt = '2026-10-19T12:00:00.000Z';

describe('paystack checkout validation', () => {
  it('prices plans in kobo server-side', () => {
    expect(PLAN_AMOUNT_KOBO.monthly).toBe(150_000);
    expect(PLAN_AMOUNT_KOBO.yearly).toBe(1_200_000);
    expect(isProPlan('monthly')).toBe(true);
    expect(isProPlan('weekly')).toBe(false);
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it('only redirects back to safe hosts', () => {
    expect(callbackOrigin({ host: 'debtbook-neon.vercel.app' })).toBe('https://debtbook-neon.vercel.app');
    expect(callbackOrigin({ host: 'evil.example.com' })).toBe('https://debtbook-neon.vercel.app');
    expect(callbackOrigin({ host: 'localhost:5173' })).toBe('http://localhost:5173');
  });
});

describe('paystack verify', () => {
  const base = { status: 'success', currency: 'NGN', paid_at: paidAt, reference: 'r1' };

  it('accepts matching monthly / yearly payments with correct expiry', () => {
    const m = evaluatePaystackTx({ ...base, amount: 150_000, metadata: { plan: 'monthly' } });
    expect(m).toMatchObject({ ok: true, plan: 'monthly' });
    if (m.ok) expect(m.expiresAt - m.paidAt).toBe(30 * DAY);
    const y = evaluatePaystackTx({ ...base, amount: 1_200_000, metadata: { plan: 'yearly' } });
    expect(y).toMatchObject({ ok: true, plan: 'yearly' });
    if (y.ok) expect(y.expiresAt - y.paidAt).toBe(365 * DAY);
  });

  it('rejects wrong amount, currency, status, or plan/amount mismatch', () => {
    expect(evaluatePaystackTx({ ...base, amount: 100, metadata: { plan: 'monthly' } }).ok).toBe(false);
    expect(evaluatePaystackTx({ ...base, amount: 150_000, metadata: { plan: 'yearly' } }).ok).toBe(false);
    expect(evaluatePaystackTx({ ...base, currency: 'USD', amount: 150_000 }).ok).toBe(false);
    expect(evaluatePaystackTx({ ...base, status: 'abandoned', amount: 150_000 }).ok).toBe(false);
    expect(evaluatePaystackTx(null).ok).toBe(false);
  });

  it('validates references', () => {
    expect(isValidReference('abc_123-x')).toBe(true);
    expect(isValidReference('../etc')).toBe(false);
    expect(isValidReference('')).toBe(false);
  });
});

describe('paystack webhook signature', () => {
  it('accepts the HMAC-SHA512 of the raw body and rejects anything else', async () => {
    const secret = 'sk_test_dummy_for_unit_tests';
    const body = '{"event":"charge.success","data":{"reference":"r1"}}';
    const sig = await hmacSha512Hex(secret, body);
    expect(sig).toHaveLength(128);
    expect(await verifyPaystackSignature(secret, body, sig)).toBe(true);
    expect(await verifyPaystackSignature(secret, body + ' ', sig)).toBe(false);
    expect(await verifyPaystackSignature('other', body, sig)).toBe(false);
    expect(await verifyPaystackSignature(secret, body, undefined)).toBe(false);
    expect(await verifyPaystackSignature(secret, body, 'abc')).toBe(false);
  });
});

describe('paystack return (client)', () => {
  it('reads reference from Paystack query and hash route', () => {
    expect(refFromSearch('?app=1&paystack=1&trxref=T1&reference=T1')).toBe('T1');
    expect(refFromHash('#/pro?ref=T2')).toBe('T2');
    expect(refFromHash('#/pro')).toBeNull();
  });

  it('sets 30/365-day Pro from a verified payment', () => {
    const t0 = Date.parse(paidAt);
    const m = entitlementFromPayment({ ok: true, plan: 'monthly', paidAt: t0, expiresAt: t0 + 30 * DAY });
    expect(m).toEqual({ plan: 'pro', exp: t0 + 30 * DAY, source: 'paystack-monthly' });
    const y = entitlementFromPayment({ ok: true, plan: 'yearly', paidAt: t0, expiresAt: t0 + 365 * DAY });
    expect(y.exp).toBe(t0 + 365 * DAY);
  });
});
