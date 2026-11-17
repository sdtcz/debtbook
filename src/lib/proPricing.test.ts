declare const process: { env: Record<string, string | undefined> };

import proPageSrc from '../pages/ProPage.tsx?raw';
import { describe, expect, it } from 'vitest';
import checkoutHandler, {
  NGN_PLAN_AMOUNT_KOBO,
  PLAN_AMOUNT_CENTS,
  buildSessionParams,
  chargeTotalMinor,
  ngnCheckoutEnabled,
  ngnVatKobo,
} from '../../api/checkout';
import { en } from '../i18n/locales/en';
import { ha } from '../i18n/locales/ha';
import { yo } from '../i18n/locales/yo';
import {
  PRO_PRICE_MINOR,
  formatProMoney,
  ngnPricingEnabled,
  pickProCurrency,
  proPriceView,
  totalMinor,
  vatMinor,
} from './proPricing';
import { trialStakesKey } from './trialStakes';

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

describe('naira Pro pricing: currency selection', () => {
  it('flag off → USD for everyone, even Nigeria or a saved naira choice', () => {
    expect(pickProCurrency({ enabled: false, country: 'NG' })).toBe('USD');
    expect(pickProCurrency({ enabled: false, saved: 'NGN', country: 'NG' })).toBe('USD');
    // The build flag is off unless NGN_PRICING=1 at build time (tests run without it).
    expect(ngnPricingEnabled()).toBe(false);
  });

  it('flag on → Nigeria defaults to naira, everyone else to USD', () => {
    expect(pickProCurrency({ enabled: true, country: 'NG' })).toBe('NGN');
    expect(pickProCurrency({ enabled: true, country: 'GH' })).toBe('USD');
    expect(pickProCurrency({ enabled: true, country: 'US' })).toBe('USD');
    expect(pickProCurrency({ enabled: true, country: null })).toBe('USD');
  });

  it('the visible switch wins over the country default (both directions); junk is ignored', () => {
    expect(pickProCurrency({ enabled: true, saved: 'USD', country: 'NG' })).toBe('USD');
    expect(pickProCurrency({ enabled: true, saved: 'NGN', country: 'US' })).toBe('NGN');
    expect(pickProCurrency({ enabled: true, saved: 'EUR', country: 'NG' })).toBe('NGN');
  });

  it('server naira checkout follows the same env var (off by default)', () => {
    expect(ngnCheckoutEnabled({})).toBe(false);
    expect(ngnCheckoutEnabled({ NGN_PRICING: '0' })).toBe(false);
    expect(ngnCheckoutEnabled({ NGN_PRICING: '1' })).toBe(true);
  });
});

describe('naira Pro pricing: VAT on top', () => {
  it('₦1,500/mo + 7.5% VAT = ₦1,612.50; ₦12,000/yr + 7.5% VAT = ₦12,900', () => {
    expect(PRO_PRICE_MINOR.NGN).toEqual({ monthly: 150000, yearly: 1200000 });
    expect(vatMinor('NGN', 'monthly')).toBe(11250);
    expect(vatMinor('NGN', 'yearly')).toBe(90000);
    expect(totalMinor('NGN', 'monthly')).toBe(161250);
    expect(totalMinor('NGN', 'yearly')).toBe(1290000);
    expect(proPriceView('NGN', 'monthly')).toMatchObject({ price: '₦1,500', vat: '₦112.50', total: '₦1,612.50', hasVat: true });
    expect(proPriceView('NGN', 'yearly')).toMatchObject({ price: '₦12,000', vat: '₦900', total: '₦12,900', hasVat: true });
  });

  it('USD unchanged, no VAT line', () => {
    expect(proPriceView('USD', 'monthly')).toMatchObject({ price: '$1.99', vat: '', total: '$1.99', hasVat: false });
    expect(proPriceView('USD', 'yearly')).toMatchObject({ price: '$15', vat: '', total: '$15', hasVat: false });
    expect(formatProMoney('USD', 1500)).toBe('$15');
  });

  it('client price list matches what the server charges', () => {
    for (const plan of ['monthly', 'yearly'] as const) {
      expect(PRO_PRICE_MINOR.USD[plan]).toBe(PLAN_AMOUNT_CENTS[plan]);
      expect(PRO_PRICE_MINOR.NGN[plan]).toBe(NGN_PLAN_AMOUNT_KOBO[plan]);
      expect(vatMinor('NGN', plan)).toBe(ngnVatKobo(plan));
      expect(totalMinor('NGN', plan)).toBe(chargeTotalMinor(plan, 'ngn'));
      expect(totalMinor('USD', plan)).toBe(chargeTotalMinor(plan, 'usd'));
    }
  });

  it('Stripe session (VAT line fallback) charges exactly the total shown, in NGN', () => {
    for (const plan of ['monthly', 'yearly'] as const) {
      const p = buildSessionParams(plan, 'a@b.co', 'https://bashibook.app', 'ngn');
      const items = p.line_items || [];
      expect(items).toHaveLength(2);
      for (const it of items) {
        expect(it.price_data?.currency).toBe('ngn');
        expect(it.price_data?.recurring?.interval).toBe(plan === 'yearly' ? 'year' : 'month');
      }
      expect(items[1].price_data?.product_data?.name).toBe('VAT (7.5%)');
      const sum = items.reduce((a, it) => a + (it.price_data?.unit_amount || 0) * (it.quantity || 1), 0);
      expect(sum).toBe(totalMinor('NGN', plan));
      expect(p.metadata).toMatchObject({ plan, currency: 'ngn', vat: '7.5%' });
    }
  });

  it('Stripe session with a tax rate: one NGN line at the pre-VAT price + the 7.5% rate', () => {
    const p = buildSessionParams('monthly', 'a@b.co', 'https://bashibook.app', 'ngn', 'txr_test123');
    expect(p.line_items).toHaveLength(1);
    expect(p.line_items?.[0]).toMatchObject({
      tax_rates: ['txr_test123'],
      price_data: { currency: 'ngn', unit_amount: 150000 },
    });
  });

  it('USD session is unchanged (single line, no VAT, no currency metadata)', () => {
    const p = buildSessionParams('yearly', 'a@b.co', 'https://bashibook.app');
    expect(p.line_items).toHaveLength(1);
    expect(p.line_items?.[0]?.price_data).toMatchObject({ currency: 'usd', unit_amount: 1500 });
    expect(p.metadata).toEqual({ plan: 'yearly', product: 'bashibook-pro' });
  });

  it('checkout refuses naira while NGN_PRICING is off (before calling Stripe)', async () => {
    const prev = { key: process.env.STRIPE_SECRET_KEY, flag: process.env.NGN_PRICING };
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_not_used';
    delete process.env.NGN_PRICING;
    try {
      for (const currency of ['ngn', 'eur', 5]) {
        const { res, out } = mockRes();
        await checkoutHandler({ method: 'POST', body: { plan: 'monthly', email: 'a@b.co', currency } }, res);
        expect(out.code).toBe(400);
        expect(out.body).toMatchObject({ ok: false, code: 'currency_unavailable' });
      }
    } finally {
      if (prev.key === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = prev.key;
      if (prev.flag !== undefined) process.env.NGN_PRICING = prev.flag;
    }
  });
});

describe('naira Pro pricing: one currency at a time (no side-by-side)', () => {
  const ngnKeys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => /Ngn(Base)?$/.test(k) && k !== 'pro.currencyNgn');
  const usdPriceKeys = [
    'pro.perMonth',
    'pro.perYear',
    'pro.orYear',
    'pro.planYearlyMeta',
    'pro.trialEndedBody',
    'home.trialEndedSub',
    'home.trialStakesEnded',
    'home.trialStakesEnded1',
  ] as const;

  it('every naira string shows ₦ and never $; every USD price string never shows ₦', () => {
    expect(ngnKeys.length).toBeGreaterThanOrEqual(10);
    for (const cat of [en, ha, yo] as Record<string, string>[]) {
      for (const k of ngnKeys) {
        if (k === 'pro.planBestNgn' || k === 'pro.securedByNgn') continue; // no amount in these
        expect(cat[k], k).toContain('₦');
        expect(cat[k], k).not.toContain('$');
      }
      for (const k of usdPriceKeys) expect(cat[k], k).not.toContain('₦');
    }
  });

  it('naira price strings that show a price say "+ 7.5% VAT" or show the VAT, and match the price list', () => {
    expect(en['pro.perMonthNgn']).toBe(`${proPriceView('NGN', 'monthly').price}/mo + 7.5% VAT`);
    expect(en['pro.perYearNgn']).toBe(`${proPriceView('NGN', 'yearly').price}/yr + 7.5% VAT`);
    expect(en['pro.perMonthNgnBase']).toBe(`${proPriceView('NGN', 'monthly').price}/mo`);
    expect(en['pro.perYearNgnBase']).toBe(`${proPriceView('NGN', 'yearly').price}/yr`);
    for (const k of ['pro.orYearNgn', 'pro.trialEndedBodyNgn', 'home.trialEndedSubNgn', 'home.trialStakesEndedNgn', 'home.trialStakesEnded1Ngn'] as const) {
      expect(en[k], k).toContain('7.5% VAT');
    }
    expect(en['pro.vatLine']).toContain('+ 7.5% VAT');
    expect(en['pro.totalMonthly']).toContain('{{total}}');
    expect(en['pro.totalYearly']).toContain('{{vat}}');
  });

  it('price views stay in one currency', () => {
    for (const plan of ['monthly', 'yearly'] as const) {
      const n = proPriceView('NGN', plan);
      const u = proPriceView('USD', plan);
      expect([n.price, n.vat, n.total].join(' ')).not.toContain('$');
      expect([u.price, u.total].join(' ')).not.toContain('₦');
    }
  });

  it('Pro page picks every price from ONE currency (webCur) and the switch replaces it', () => {
    const src = proPageSrc;
    // Every naira key is behind the `ngn` choice, paired with its USD key in the same ternary.
    for (const k of ['pro.orYearNgn', 'pro.trialEndedBodyNgn', 'pro.securedByNgn', 'pro.planBestNgn', 'pro.planYearlyMetaNgn']) {
      const usd = k.replace(/Ngn$/, '');
      expect(src, k).toContain(`ngn ? '${k}' : '${usd}'`);
    }
    expect(src).toContain("ngn ? 'pro.perMonthNgnBase' : 'pro.perMonth'");
    expect(en['pro.orYearNgn']).toContain(`= ${proPriceView('NGN', 'monthly').total}/mo`);
    expect(en['pro.orYearNgn']).toContain(`= ${proPriceView('NGN', 'yearly').total}`);
    expect(src).toContain("ngn ? ngnPlanPrice(p) : t(p === 'yearly' ? 'pro.perYear' : 'pro.perMonth')");
    expect(src).toContain("price: ngn ? payView.total : usd(plan)");
    expect(src).toContain("currency: webCur === 'NGN' ? 'ngn' : 'usd'");
    // Play app keeps Google Play prices: naira switch is web (Stripe) only.
    expect(src).toContain("store === 'web' ? cur : 'USD'");
  });

  it('Home stakes line uses the naira key only when naira is the chosen currency', () => {
    const s = { amountKobo: 1, customers: 3, phase: 'ended' as const };
    expect(trialStakesKey(s)).toBe('home.trialStakesEnded');
    expect(trialStakesKey(s, true)).toBe('home.trialStakesEndedNgn');
    expect(trialStakesKey({ ...s, customers: 1 }, true)).toBe('home.trialStakesEnded1Ngn');
    expect(trialStakesKey({ ...s, phase: 'ending' }, true)).toBe('home.trialStakesEnding');
  });
});
