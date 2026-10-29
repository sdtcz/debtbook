import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntitlement } from './entitlement';
import {
  buyWithPlay,
  detectStore,
  entitlementFromPlay,
  playConfigured,
  playPrices,
  resetPlayService,
  syncPlay,
  type DigitalGoodsService,
} from './playBilling';
import { mayHavePlayBilling, playAppHint } from './playEnv';
import type { Entitlement } from './types';

const DAY = 864e5;
const NOW = Date.parse('2026-11-01T00:00:00Z');
const T1 = 'token-one-aaaaaaaaaaaaaaaaaaaa';
const T2 = 'token-two-bbbbbbbbbbbbbbbbbbbb';

function mem(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
const ok = (plan: 'monthly' | 'yearly', expiresAt: number) =>
  new Response(JSON.stringify({ ok: true, plan, productId: `pro_${plan}`, paidAt: NOW, expiresAt }), { status: 200 });
const svc = (purchases: { itemId: string; purchaseToken: string }[]): DigitalGoodsService => ({
  getDetails: async (ids) => ids.map((itemId) => ({ itemId, price: { currency: 'USD', value: itemId === 'pro_yearly' ? '15.00' : '1.99' } })),
  listPurchases: async () => purchases,
});

beforeEach(() => resetPlayService());
afterEach(() => vi.unstubAllGlobals());

describe('playEnv', () => {
  it('Play hint from the TWA referrer, remembered per tab; never on the website', () => {
    const ss = mem();
    expect(playAppHint({ referrer: 'https://www.google.com/' }, ss)).toBe(false);
    expect(playAppHint({ referrer: 'android-app://app.bashibook.twa/' }, ss)).toBe(true);
    expect(playAppHint({ referrer: '' }, ss)).toBe(true);
    expect(playAppHint({ referrer: 'android-app://com.other.app/' }, mem())).toBe(false);
  });
  it('mayHavePlayBilling: Digital Goods API present', () => {
    expect(mayHavePlayBilling({})).toBe(false);
    expect(mayHavePlayBilling({ getDigitalGoodsService: () => null })).toBe(true);
  });
});

describe('detectStore', () => {
  it('web when the Digital Goods API is missing or rejects (website keeps Stripe)', async () => {
    expect((await detectStore({})).store).toBe('web');
    resetPlayService();
    expect((await detectStore({ getDigitalGoodsService: () => Promise.reject(new Error('no')) })).store).toBe('web');
  });
  it('play when Play billing answers', async () => {
    const s = svc([]);
    const r = await detectStore({ getDigitalGoodsService: async () => s });
    expect(r.store).toBe('play');
    expect(await playPrices(r.service!, 'en-US')).toEqual({ monthly: '$1.99', yearly: '$15.00' });
  });
});

describe('server config probe', () => {
  it('501 → false (show "coming soon"), 200 → true, offline → null', async () => {
    expect(await playConfigured((async () => new Response('{}', { status: 501 })) as unknown as typeof fetch)).toBe(false);
    expect(await playConfigured((async () => new Response('{}', { status: 200 })) as unknown as typeof fetch)).toBe(true);
    expect(await playConfigured((async () => Promise.reject(new Error('x'))) as unknown as typeof fetch)).toBeNull();
  });
});

describe('entitlementFromPlay', () => {
  it('stores the purchase token and Google expiry; play Pro gets the 3-day grace', () => {
    const e = entitlementFromPlay({ ok: true, plan: 'yearly', productId: 'pro_yearly', paidAt: NOW, expiresAt: NOW + 365 * DAY }, T1, undefined, NOW);
    expect(e).toEqual({ plan: 'pro', exp: NOW + 365 * DAY, source: 'play-yearly', ref: T1 });
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 366 * DAY);
    expect(getEntitlement({ entitlement: e } as never).plan).toBe('pro');
    vi.setSystemTime(NOW + 369 * DAY);
    expect(getEntitlement({ entitlement: e } as never).plan).toBe('free');
    vi.useRealTimers();
  });
  it('never shortens a longer Stripe period', () => {
    const cur: Entitlement = { plan: 'pro', exp: NOW + 200 * DAY, source: 'stripe-yearly', ref: 'cs_1' };
    const e = entitlementFromPlay({ ok: true, plan: 'monthly', productId: 'pro_monthly', paidAt: NOW, expiresAt: NOW + 30 * DAY }, T1, cur, NOW);
    expect(e.exp).toBe(NOW + 200 * DAY);
    expect(e.source).toBe('play-monthly');
  });
});

describe('buyWithPlay', () => {
  const stubPR = (token: string | null, complete = vi.fn(async () => {})) => {
    class PR {
      constructor(public methods: unknown[]) {}
      async show() {
        if (token === null) throw new DOMException('cancelled', 'AbortError');
        return { details: { purchaseToken: token }, complete };
      }
    }
    vi.stubGlobal('PaymentRequest', PR);
    return complete;
  };
  it('Payment Request with the Play method → verify → save → complete(success)', async () => {
    const complete = stubPR(T1);
    const save = vi.fn(async () => {});
    let sent: unknown;
    const fetcher = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return ok('monthly', NOW + 30 * DAY);
    }) as unknown as typeof fetch;
    const r = await buyWithPlay('monthly', undefined, save, fetcher);
    expect(r.result).toBe('ok');
    expect(sent).toEqual({ token: T1, sku: 'pro_monthly' });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ source: 'play-monthly', ref: T1 }));
    expect(complete).toHaveBeenCalledWith('success');
  });
  it('cancel, not configured and offline never unlock Pro', async () => {
    const save = vi.fn(async () => {});
    stubPR(null);
    expect((await buyWithPlay('yearly', undefined, save)).result).toBe('cancel');
    const complete = stubPR(T1);
    expect((await buyWithPlay('yearly', undefined, save, (async () => new Response('{}', { status: 501 })) as unknown as typeof fetch)).result).toBe('not_configured');
    expect(complete).toHaveBeenCalledWith('fail');
    expect((await buyWithPlay('yearly', undefined, save, (async () => Promise.reject(new Error('x'))) as unknown as typeof fetch)).result).toBe('offline');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('syncPlay (restore on app open + renewals)', () => {
  it('restores a purchase found by listPurchases', async () => {
    const save = vi.fn(async () => {});
    const r = await syncPlay(undefined, save, {
      service: svc([{ itemId: 'pro_yearly', purchaseToken: T1 }]),
      fetcher: (async () => ok('yearly', NOW + 300 * DAY)) as unknown as typeof fetch,
      now: NOW,
      ls: mem(),
    });
    expect(r).toBe('restored');
    expect(save).toHaveBeenCalledWith({ plan: 'pro', exp: NOW + 300 * DAY, source: 'play-yearly', ref: T1 });
  });
  it('no network when nothing is new and renewal is not due', async () => {
    const fetcher = vi.fn();
    const cur: Entitlement = { plan: 'pro', exp: NOW + 20 * DAY, source: 'play-monthly', ref: T1 };
    const r = await syncPlay(cur, vi.fn(), { service: svc([{ itemId: 'pro_monthly', purchaseToken: T1 }]), fetcher: fetcher as never, now: NOW, ls: mem() });
    expect(r).toBe('skip');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('near expiry: renewal extends; once a day', async () => {
    const ls = mem();
    const save = vi.fn(async () => {});
    const cur: Entitlement = { plan: 'pro', exp: NOW + DAY, source: 'play-monthly', ref: T1 };
    const fetcher = vi.fn(async () => ok('monthly', NOW + 31 * DAY));
    const opts = { service: svc([{ itemId: 'pro_monthly', purchaseToken: T1 }]), fetcher: fetcher as never, now: NOW, ls };
    expect(await syncPlay(cur, save, opts)).toBe('extended');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ exp: NOW + 31 * DAY, ref: T1 }));
    expect(await syncPlay(cur, save, { ...opts, now: NOW + 3600e3 })).toBe('skip');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('cancelled at Google: token dropped so Pro ends at exp; offline keeps it', async () => {
    const cur: Entitlement = { plan: 'pro', exp: NOW + DAY, source: 'play-monthly', ref: T1 };
    const save = vi.fn(async () => {});
    const no = (async () => new Response('{"ok":false}', { status: 402 })) as unknown as typeof fetch;
    expect(await syncPlay(cur, save, { service: svc([]), fetcher: no, now: NOW, ls: mem() })).toBe('lapsed');
    expect(save).toHaveBeenCalledWith({ plan: 'pro', exp: NOW + DAY, source: 'play-monthly' });
    const save2 = vi.fn();
    const off = (async () => Promise.reject(new Error('x'))) as unknown as typeof fetch;
    expect(await syncPlay(cur, save2, { service: null, fetcher: off, now: NOW, ls: mem() })).toBe('error');
    expect(save2).not.toHaveBeenCalled();
  });
  it('a newer token (plan change) replaces the old one', async () => {
    const cur: Entitlement = { plan: 'pro', exp: NOW + 5 * DAY, source: 'play-monthly', ref: T1 };
    const save = vi.fn(async () => {});
    const r = await syncPlay(cur, save, {
      service: svc([{ itemId: 'pro_yearly', purchaseToken: T2 }]),
      fetcher: (async () => ok('yearly', NOW + 365 * DAY)) as unknown as typeof fetch,
      now: NOW,
      ls: mem(),
    });
    expect(r).toBe('extended');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ref: T2, source: 'play-yearly' }));
  });
});
