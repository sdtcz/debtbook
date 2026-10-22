import { getShop, updateShopFields } from '../db/repo';
import { newTrial, readLocalTrial, reconcileTrial, trialUsed, writeLocalTrial } from './trial';
import type { ShopProfile } from './types';

/** Apply the 5-day rule / sync the install marker. Safe to call on every start. */
export async function reconcileTrialOnStart(now = Date.now()): Promise<ShopProfile | null> {
  const shop = await getShop();
  if (!shop) return null;
  const local = readLocalTrial();
  const patch = reconcileTrial(shop, local, now);
  const trial = patch?.trial || shop.trial;
  if (trial && (!local || local.startedAt !== trial.startedAt || local.endsAt !== trial.endsAt)) writeLocalTrial(trial);
  if (!patch) return shop;
  return updateShopFields(patch);
}

export class TrialAlreadyUsedError extends Error {
  constructor() {
    super('trial already used');
  }
}

/** Start the one-time free trial. Throws TrialAlreadyUsedError if it was used on this phone/shop. */
export async function startTrial(now = Date.now()): Promise<ShopProfile> {
  const shop = await getShop();
  if (!shop) throw new Error('Shop not set up');
  if (trialUsed(shop)) throw new TrialAlreadyUsedError();
  const { entitlement, trial } = newTrial(now);
  writeLocalTrial(trial);
  return updateShopFields({ entitlement, trial });
}
