import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbCache } from '../db/schema';
import { getShop, saveShop, setEntitlement, updateShopFields } from '../db/repo';
import { getEntitlement, isPro } from './entitlement';
import { exportBackup, importBackup } from './backup';
import {
  DAY_MS,
  newTrial,
  readLocalTrial,
  reconcileTrial,
  TRIAL_DAYS,
  TRIAL_GRACE_MS,
  TRIAL_LS_KEY,
  trialStatus,
  trialUsed,
} from './trial';
import { reconcileTrialOnStart, startTrial, TrialAlreadyUsedError } from './trialStore';
import type { ShopProfile } from './types';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const now = new Date(2026, 9, 22, 9).getTime();
const shopWith = (extra: Partial<ShopProfile>): ShopProfile =>
  ({ id: 'shop', name: 'S', currency: 'NGN', createdAt: 0, updatedAt: 0, ...extra }) as ShopProfile;
const legacy = (startedDaysAgo: number) =>
  shopWith({ entitlement: { plan: 'pro', source: 'demo', exp: now - startedDaysAgo * DAY_MS + 30 * DAY_MS } });

describe('trial rules (pure)', () => {
  it('new trial is 5 days', () => {
    expect(TRIAL_DAYS).toBe(5);
    const { entitlement, trial } = newTrial(now);
    expect(entitlement.exp! - now).toBe(5 * DAY_MS);
    expect(trial).toEqual({ startedAt: now, endsAt: now + 5 * DAY_MS });
  });

  it('days left rounds up and shows 1 on the last day', () => {
    const { entitlement, trial } = newTrial(now);
    const s = shopWith({ entitlement, trial });
    expect(trialStatus(s, null, now)).toMatchObject({ state: 'active', daysLeft: 5 });
    expect(trialStatus(s, null, now + 2.5 * DAY_MS).daysLeft).toBe(3);
    expect(trialStatus(s, null, now + 5 * DAY_MS - 60_000).daysLeft).toBe(1);
    expect(trialStatus(s, null, now + 5 * DAY_MS).state).toBe('ended');
    expect(trialStatus(shopWith({}), null, now).state).toBe('available');
  });

  it('legacy 30-day trial started 2 days ago ends at start + 5 days', () => {
    const r = reconcileTrial(legacy(2), null, now)!;
    expect(r.trial.startedAt).toBe(now - 2 * DAY_MS);
    expect(r.trial.endsAt).toBe(now + 3 * DAY_MS);
    expect(r.entitlement!.exp).toBe(now + 3 * DAY_MS);
    expect(r.trial.capped).toBe(true);
  });

  it('legacy trial already past day 5 gets 24h grace (only while the old trial was running)', () => {
    const r = reconcileTrial(legacy(12), null, now)!;
    expect(r.trial.endsAt).toBe(now + TRIAL_GRACE_MS);
    expect(r.entitlement!.exp).toBe(now + TRIAL_GRACE_MS);
    // Second start the next day: marker exists → no new grace
    const after = shopWith({ entitlement: r.entitlement, trial: r.trial });
    expect(reconcileTrial(after, r.trial, now + 2 * DAY_MS)).toBeNull();
    expect(trialStatus(after, r.trial, now + 2 * DAY_MS).state).toBe('ended');
  });

  it('an old trial that already expired gets no grace', () => {
    const r = reconcileTrial(legacy(40), null, now)!;
    expect(r.trial.endsAt).toBeLessThan(now);
  });

  it('paid Pro is never touched or counted as a trial', () => {
    const paid = shopWith({ entitlement: { plan: 'pro', source: 'stripe-monthly', exp: now + 20 * DAY_MS } });
    expect(reconcileTrial(paid, null, now)).toBeNull();
    expect(trialStatus(paid, null, now).state).toBe('paid');
    expect(trialUsed(paid, null)).toBe(false);
  });

  it('an install marker caps a restored longer trial', () => {
    const marker = { startedAt: now - DAY_MS, endsAt: now + 4 * DAY_MS };
    const s = shopWith({ entitlement: { plan: 'pro', source: 'demo', exp: now + 29 * DAY_MS } });
    const r = reconcileTrial(s, marker, now)!;
    expect(r.trial).toEqual(marker);
    expect(r.entitlement!.exp).toBe(marker.endsAt);
  });
});

async function freshDb() {
  try {
    (await getDb()).close();
  } catch {
    /* none */
  }
  resetDbCache();
  globalThis.indexedDB = new IDBFactory();
  store.clear();
}

describe('trial once per phone (IndexedDB + localStorage)', () => {
  beforeEach(freshDb);

  it('starts once; re-tapping or restarting after it ends is refused', async () => {
    await saveShop('Shop');
    const s = await startTrial(now);
    expect(s.trial!.endsAt).toBe(now + 5 * DAY_MS);
    expect(readLocalTrial()).toEqual(s.trial);
    await expect(startTrial(now + 1000)).rejects.toBeInstanceOf(TrialAlreadyUsedError);
    await setEntitlement({ plan: 'free' }); // e.g. expired and cleared
    await expect(startTrial(now + 6 * DAY_MS)).rejects.toBeInstanceOf(TrialAlreadyUsedError);
  });

  it('erasing the shop does not give a new trial on this phone', async () => {
    await saveShop('Shop');
    await startTrial(now);
    await freshDbKeepLocal();
    await saveShop('New shop');
    await expect(startTrial(now)).rejects.toBeInstanceOf(TrialAlreadyUsedError);
    const s = await reconcileTrialOnStart(now);
    expect(s!.trial).toEqual(readLocalTrial());
  });

  it('restoring an old backup (no marker, 30-day demo) cannot extend the trial', async () => {
    await saveShop('Shop');
    await startTrial(now);
    const backup = await exportBackup();
    const old = {
      ...backup,
      shop: { ...backup.shop!, trial: undefined, entitlement: { plan: 'pro' as const, source: 'demo', exp: now + 30 * DAY_MS } },
    };
    await importBackup(old);
    const shop = await getShop();
    expect(shop!.trial!.endsAt).toBe(now + 5 * DAY_MS);
    expect(getEntitlement(shop).exp).toBe(now + 5 * DAY_MS);
  });

  it('migrates an existing 30-day trial on start and keeps the marker in backups', async () => {
    await saveShop('Shop');
    await updateShopFields({ entitlement: { plan: 'pro', source: 'demo', exp: now + 27 * DAY_MS } }); // started 3 days ago
    const s = await reconcileTrialOnStart(now);
    expect(s!.entitlement!.exp).toBe(now + 2 * DAY_MS);
    expect(isPro(s)).toBe(true);
    expect(JSON.parse(store.get(TRIAL_LS_KEY)!).endsAt).toBe(now + 2 * DAY_MS);
    expect((await exportBackup()).shop!.trial!.endsAt).toBe(now + 2 * DAY_MS);
    // idempotent
    const again = await reconcileTrialOnStart(now + 1000);
    expect(again!.entitlement!.exp).toBe(now + 2 * DAY_MS);
  });
});

async function freshDbKeepLocal() {
  const keep = new Map(store);
  await freshDb();
  for (const [k, v] of keep) store.set(k, v);
}
