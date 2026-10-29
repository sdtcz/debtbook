import { describe, expect, it, vi } from 'vitest';
import { renewPro, renewDue, RENEW_KEY } from './proRenew';
import { entitlementFromPayment } from './checkoutReturn';
import { getEntitlement } from './entitlement';
import type { Entitlement, ShopProfile } from './types';
import app from '../App.tsx?raw';

const DAY = 864e5;
const NOW = Date.UTC(2026, 10, 27, 12);
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const pro = (exp: number): Entitlement => ({ plan: 'pro', exp, source: 'stripe-monthly', ref: 'cs_live_abc' });
const reply = (status: number, body: unknown) =>
  vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as unknown as Response);
const shop = (e: Entitlement) => ({ entitlement: e }) as unknown as ShopProfile;

describe('Pro renewals (re-verify the stored Checkout reference)', () => {
  it('stores the reference with Pro on the first verify', () => {
    const e = entitlementFromPayment({ ok: true, plan: 'monthly', paidAt: NOW, expiresAt: NOW + 30 * DAY }, undefined, NOW, 'cs_live_abc');
    expect(e).toEqual({ plan: 'pro', exp: NOW + 30 * DAY, source: 'stripe-monthly', ref: 'cs_live_abc' });
  });

  it('a renewal extends Pro to the new period end (not capped by the first period)', async () => {
    const save = vi.fn(async () => {});
    const end = NOW + DAY;
    const f = reply(200, { ok: true, plan: 'monthly', paidAt: end, expiresAt: end + 30 * DAY, reference: 'cs_live_abc' });
    expect(await renewPro(pro(end), save, NOW, f, mem())).toBe('extended');
    expect(f).toHaveBeenCalledWith('/api/verify?reference=cs_live_abc', { cache: 'no-store' });
    expect(save).toHaveBeenCalledWith({ plan: 'pro', exp: end + 30 * DAY, source: 'stripe-monthly', ref: 'cs_live_abc' });
  });

  it('a renewal seen after expiry (old paidAt fallback) is still not cut short', () => {
    const e = entitlementFromPayment({ ok: true, plan: 'monthly', paidAt: NOW - 40 * DAY, expiresAt: NOW + 25 * DAY }, pro(NOW - DAY), NOW);
    expect(e.exp).toBe(NOW + 25 * DAY);
  });

  it('a cancelled subscription lapses at expiry, as before', async () => {
    let saved: Entitlement | undefined;
    const save = vi.fn(async (e: Entitlement) => void (saved = e));
    const f = reply(402, { ok: false, code: 'not_active' });
    expect(await renewPro(pro(NOW - DAY), save, NOW, f, mem())).toBe('lapsed');
    expect(saved).toEqual({ plan: 'pro', exp: NOW - DAY, source: 'stripe-monthly' });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(getEntitlement(shop(saved!)).plan).toBe('free');
    vi.useRealTimers();
  });

  it('offline or server errors never remove Pro early; 3 days of grace past expiry', async () => {
    const save = vi.fn(async () => {});
    const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await renewPro(pro(NOW - DAY), save, NOW, down as unknown as typeof fetch, mem())).toBe('error');
    expect(await renewPro(pro(NOW - DAY), save, NOW, reply(502, { ok: false }), mem())).toBe('error');
    expect(save).not.toHaveBeenCalled();
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 2 * DAY);
    expect(getEntitlement(shop(pro(NOW))).plan).toBe('pro'); // within grace
    vi.setSystemTime(NOW + 4 * DAY);
    expect(getEntitlement(shop(pro(NOW))).plan).toBe('free'); // grace over
    const { ref: _r, ...noRef } = pro(NOW);
    vi.setSystemTime(NOW + DAY);
    expect(getEntitlement(shop(noRef)).plan).toBe('free'); // no reference (legacy / lapsed): no grace
    vi.useRealTimers();
  });

  it('runs at most once a day, only near expiry, only for paid Stripe Pro', async () => {
    const ls = mem();
    const f = reply(200, { ok: true, plan: 'monthly', paidAt: NOW, expiresAt: NOW + DAY });
    const save = vi.fn(async () => {});
    await renewPro(pro(NOW + DAY), save, NOW, f, ls);
    expect(ls.getItem(RENEW_KEY)).toBe(String(NOW));
    expect(await renewPro(pro(NOW + DAY), save, NOW + 20 * 3600e3, f, ls)).toBe('skip');
    expect(f).toHaveBeenCalledTimes(1);
    await renewPro(pro(NOW + DAY), save, NOW + DAY + 1, f, ls);
    expect(f).toHaveBeenCalledTimes(2);
    expect(renewDue(pro(NOW + 5 * DAY), NOW)).toBe(false);
    expect(renewDue({ plan: 'pro', exp: NOW, source: 'demo', ref: 'x' }, NOW)).toBe(false);
    expect(renewDue({ plan: 'pro', exp: NOW, source: 'stripe-yearly' }, NOW)).toBe(false);
  });

  it('App runs it lazily on idle', () => {
    expect(app).toContain("import('./lib/proRenew')");
    expect(app).toContain('requestIdleCallback(run');
  });
});
