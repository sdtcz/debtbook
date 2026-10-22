import type { Entitlement, ShopProfile, TrialMarker } from './types';

/** Free Pro trial length (was 30 days until Oct 2026). */
export const TRIAL_DAYS = 5;
/** Length of trials started before the change (demo entitlement = start + 30 days). */
export const LEGACY_TRIAL_DAYS = 30;
/** Grace for existing users whose capped trial would already be over. */
export const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Install-level "trial used" marker. Survives backup restore and wiping the shop. */
export const TRIAL_LS_KEY = 'bashibook-trial';

export function isTrialEntitlement(e: Entitlement | undefined | null): boolean {
  return Boolean(e && e.plan === 'pro' && e.source === 'demo');
}

function isMarker(v: unknown): v is TrialMarker {
  const m = v as TrialMarker;
  return Boolean(m && Number.isFinite(m.startedAt) && Number.isFinite(m.endsAt));
}

export function readLocalTrial(): TrialMarker | null {
  try {
    const raw = localStorage.getItem(TRIAL_LS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return isMarker(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeLocalTrial(m: TrialMarker): void {
  try {
    localStorage.setItem(TRIAL_LS_KEY, JSON.stringify(m));
  } catch {
    /* private mode / quota — the shop copy still applies */
  }
}

/** Earliest-ending of the known markers (a marker can only ever shorten a trial). */
function pickMarker(a: TrialMarker | null | undefined, b: TrialMarker | null | undefined): TrialMarker | null {
  if (!a) return b || null;
  if (!b) return a;
  return a.endsAt <= b.endsAt ? a : b;
}

/** The trial has been used on this phone/install (or this shop) — it can't be started again. */
export function trialUsed(shop: ShopProfile | null | undefined, local: TrialMarker | null = readLocalTrial()): boolean {
  return Boolean(shop?.trial || local || isTrialEntitlement(shop?.entitlement));
}

/** A brand-new 5-day trial. */
export function newTrial(now = Date.now()): { entitlement: Entitlement; trial: TrialMarker } {
  const endsAt = now + TRIAL_DAYS * DAY_MS;
  return {
    entitlement: { plan: 'pro', exp: endsAt, source: 'demo' },
    trial: { startedAt: now, endsAt },
  };
}

/**
 * Bring a shop's trial in line with the 5-day rule. Returns the fields to write, or null if nothing changes.
 *
 * Rule for trials started under the old 30-day offer (demo entitlement, no marker yet):
 *   start = exp − 30 days; end = min(exp, start + 5 days).
 *   If that end is already past but the old trial was still running, the user gets until now + 24 h
 *   (once), then sees the "trial ended" prompt.
 */
export function reconcileTrial(
  shop: ShopProfile,
  local: TrialMarker | null,
  now = Date.now(),
): { trial: TrialMarker; entitlement?: Entitlement } | null {
  const ent = shop.entitlement;
  const known = pickMarker(shop.trial, local);
  if (known) {
    const sameAsShop = shop.trial && shop.trial.startedAt === known.startedAt && shop.trial.endsAt === known.endsAt;
    const capEnt = isTrialEntitlement(ent) && ent!.exp != null && ent!.exp > known.endsAt;
    if (sameAsShop && !capEnt) return null;
    return { trial: known, ...(capEnt ? { entitlement: { ...ent!, exp: known.endsAt } } : {}) };
  }
  if (!isTrialEntitlement(ent) || ent!.exp == null) return null;
  const exp = ent!.exp;
  const startedAt = exp - LEGACY_TRIAL_DAYS * DAY_MS;
  let endsAt = Math.min(exp, startedAt + TRIAL_DAYS * DAY_MS);
  if (endsAt <= now && exp > now) endsAt = now + TRIAL_GRACE_MS;
  const trial: TrialMarker = { startedAt, endsAt, capped: true };
  return { trial, ...(endsAt !== exp ? { entitlement: { ...ent!, exp: endsAt } } : {}) };
}

export type TrialState = 'available' | 'active' | 'ended' | 'paid';

export interface TrialStatus {
  state: TrialState;
  /** Whole days left, rounded up (1 on the last day). Only for 'active'. */
  daysLeft: number;
  endsAt?: number;
}

export function trialStatus(
  shop: ShopProfile | null | undefined,
  local: TrialMarker | null = readLocalTrial(),
  now = Date.now(),
): TrialStatus {
  const ent = shop?.entitlement;
  const paid = ent?.plan === 'pro' && !isTrialEntitlement(ent) && (ent.exp == null || ent.exp > now);
  if (paid) return { state: 'paid', daysLeft: 0 };
  const marker = pickMarker(shop?.trial, local);
  let endsAt = marker?.endsAt;
  if (isTrialEntitlement(ent) && ent!.exp != null) endsAt = endsAt == null ? ent!.exp : Math.min(endsAt, ent!.exp);
  if (endsAt == null) return { state: 'available', daysLeft: 0 };
  if (endsAt > now && isTrialEntitlement(ent)) {
    return { state: 'active', daysLeft: Math.max(1, Math.ceil((endsAt - now) / DAY_MS)), endsAt };
  }
  return { state: 'ended', daysLeft: 0, endsAt };
}
