import type { TrialStatus } from './trial';
import type { MessageKey } from '../i18n';

/**
 * "What's at stake" line for the trial chip / trial-ended card on Home.
 * Names the shop's own numbers (money owed + how many customers) instead of a
 * generic feature list. Computed on the phone from data already on screen;
 * nothing is stored or sent.
 */
export interface TrialStakes {
  amountKobo: number;
  customers: number;
  phase: 'ending' | 'ended';
}

/** Show the line on the last N days of the trial (and after it ends). */
export const STAKES_LAST_DAYS = 2;

export function trialStakes(trial: TrialStatus, totalOwedKobo: number, owingCustomers: number): TrialStakes | null {
  if (!(totalOwedKobo > 0) || !(owingCustomers > 0)) return null;
  if (trial.state === 'ended') return { amountKobo: totalOwedKobo, customers: owingCustomers, phase: 'ended' };
  if (trial.state === 'active' && trial.daysLeft <= STAKES_LAST_DAYS) {
    return { amountKobo: totalOwedKobo, customers: owingCustomers, phase: 'ending' };
  }
  return null;
}

/** i18n key for the stakes line (singular for one customer). */
export function trialStakesKey(s: TrialStakes): MessageKey {
  if (s.phase === 'ended') return s.customers === 1 ? 'home.trialStakesEnded1' : 'home.trialStakesEnded';
  return s.customers === 1 ? 'home.trialStakesEnding1' : 'home.trialStakesEnding';
}

/**
 * Split a rendered stakes line so the ₦ amount can be shown bold and the
 * trailing price (after " · ") kept on one line. Pure string work; falls back
 * to the whole text as `before` when the amount isn't found.
 */
export function stakesParts(text: string, amount: string): { before: string; amount: string; after: string; price: string } {
  let body = text;
  let price = '';
  const dot = body.lastIndexOf(' · ');
  if (dot > -1 && /\$/.test(body.slice(dot))) {
    price = body.slice(dot + 3);
    body = body.slice(0, dot);
  }
  const i = amount ? body.indexOf(amount) : -1;
  if (i < 0) return { before: body, amount: '', after: '', price };
  return { before: body.slice(0, i), amount, after: body.slice(i + amount.length), price };
}
