import { TRIAL_DAYS } from './trial';
import type { Entitlement, Plan, ShopProfile } from './types';

export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export function getEntitlement(shop: ShopProfile | null | undefined): Entitlement {
  const e = shop?.entitlement;
  if (!e) return { plan: 'free' };
  // A trial can never outlive its marker (e.g. after restoring an old backup).
  let exp = e.exp;
  if (e.source === 'demo' && exp != null && shop?.trial) exp = Math.min(exp, shop.trial.endsAt);
  // Paid Pro with a renewal reference: 3 days' grace past expiry while the renewal check can't get through.
  const grace = e.ref && (e.source?.startsWith('stripe') || e.source?.startsWith('play')) ? GRACE_MS : 0;
  if (e.plan === 'pro' && exp != null && exp + grace < Date.now()) {
    return { plan: 'free', source: 'expired' };
  }
  return exp === e.exp ? e : { ...e, exp };
}

export function isPro(shop: ShopProfile | null | undefined): boolean {
  return getEntitlement(shop).plan === 'pro';
}

export function demoProEntitlement(days = TRIAL_DAYS): Entitlement {
  return {
    plan: 'pro',
    exp: Date.now() + days * 24 * 60 * 60 * 1000,
    source: 'demo',
  };
}

export function planLabel(plan: Plan): string {
  return plan === 'pro' ? 'Pro' : 'Free';
}
