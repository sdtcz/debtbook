import type { Entitlement, Plan, ShopProfile } from './types';

export function getEntitlement(shop: ShopProfile | null | undefined): Entitlement {
  const e = shop?.entitlement;
  if (!e) return { plan: 'free' };
  if (e.plan === 'pro' && e.exp != null && e.exp < Date.now()) {
    return { plan: 'free', source: 'expired' };
  }
  return e;
}

export function isPro(shop: ShopProfile | null | undefined): boolean {
  return getEntitlement(shop).plan === 'pro';
}

export function demoProEntitlement(days = 30): Entitlement {
  return {
    plan: 'pro',
    exp: Date.now() + days * 24 * 60 * 60 * 1000,
    source: 'demo',
  };
}

export function planLabel(plan: Plan): string {
  return plan === 'pro' ? 'Pro' : 'Free';
}
