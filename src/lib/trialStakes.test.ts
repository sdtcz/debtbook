import { describe, expect, it } from 'vitest';
import { trialStakes, trialStakesKey, stakesParts, STAKES_LAST_DAYS } from './trialStakes';
type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
const css = readFileSync('src/styles/app.css', 'utf8');
import { en } from '../i18n/locales/en';
import { ha } from '../i18n/locales/ha';
import { yo } from '../i18n/locales/yo';
import homeSrc from '../pages/HomePage.tsx?raw';

const active = (daysLeft: number) => ({ state: 'active' as const, daysLeft, endsAt: Date.now() + daysLeft * 864e5 });

describe('trial stakes line (Home trial chip / trial-ended card)', () => {
  it('stays hidden early in the trial, before the trial, and once paid', () => {
    expect(trialStakes(active(5), 4500000, 6)).toBeNull();
    expect(trialStakes(active(STAKES_LAST_DAYS + 1), 4500000, 6)).toBeNull();
    expect(trialStakes({ state: 'available', daysLeft: 0 }, 4500000, 6)).toBeNull();
    expect(trialStakes({ state: 'paid', daysLeft: 0 }, 4500000, 6)).toBeNull();
  });

  it('shows on the last days of the trial and after it ends, with the shop\'s own numbers', () => {
    expect(trialStakes(active(2), 4500000, 6)).toEqual({ amountKobo: 4500000, customers: 6, phase: 'ending' });
    expect(trialStakes(active(1), 100, 1)).toEqual({ amountKobo: 100, customers: 1, phase: 'ending' });
    expect(trialStakes({ state: 'ended', daysLeft: 0 }, 4500000, 6)).toEqual({ amountKobo: 4500000, customers: 6, phase: 'ended' });
  });

  it('never shows an empty or negative stake (falls back to the generic copy)', () => {
    expect(trialStakes({ state: 'ended', daysLeft: 0 }, 0, 0)).toBeNull();
    expect(trialStakes({ state: 'ended', daysLeft: 0 }, -5000, 1)).toBeNull();
    expect(trialStakes(active(1), 5000, 0)).toBeNull();
    expect(trialStakes(active(1), Number.NaN, 2)).toBeNull();
  });

  it('picks singular keys for one customer', () => {
    expect(trialStakesKey({ amountKobo: 1, customers: 1, phase: 'ended' })).toBe('home.trialStakesEnded1');
    expect(trialStakesKey({ amountKobo: 1, customers: 3, phase: 'ended' })).toBe('home.trialStakesEnded');
    expect(trialStakesKey({ amountKobo: 1, customers: 1, phase: 'ending' })).toBe('home.trialStakesEnding1');
    expect(trialStakesKey({ amountKobo: 1, customers: 3, phase: 'ending' })).toBe('home.trialStakesEnding');
  });

  it('has en/ha/yo copy with the amount (and count where plural); ended copy keeps the real price', () => {
    for (const cat of [en, ha, yo]) {
      for (const k of ['home.trialStakesEnding', 'home.trialStakesEnded'] as const) {
        expect(cat[k]).toContain('{{amount}}');
        expect(cat[k]).toContain('{{n}}');
        expect(cat[`${k}1` as const]).toContain('{{amount}}');
        expect(cat[`${k}1` as const]).not.toContain('{{n}}');
      }
      expect(cat['home.trialStakesEnded']).toContain('$1.99');
      expect(cat['home.trialStakesEnded']).toContain('$15');
    }
  });

  it('Home wires it in, hidden while the PIN lock is on', () => {
    expect(homeSrc).toContain('trialStakes(trial, total, owesCount)');
    expect(homeSrc).toMatch(/locked \? null : trialStakes/);
    expect(homeSrc).toContain('pro-trial-stakes');
  });

  it('splits the line so the ₦ amount is bold and the price stays on one line', () => {
    expect(stakesParts('₦11,700 owed by 2 customers. Keep it backed up after the trial.', '₦11,700')).toEqual({
      before: '', amount: '₦11,700', after: ' owed by 2 customers. Keep it backed up after the trial.', price: '',
    });
    expect(stakesParts('Ajiye ₦11,700 da abokan ciniki 2 ke binka a girgije · $1.99/wata ko $15/shekara', '₦11,700')).toEqual({
      before: 'Ajiye ', amount: '₦11,700', after: ' da abokan ciniki 2 ke binka a girgije', price: '$1.99/wata ko $15/shekara',
    });
    expect(stakesParts('no amount here', '₦5')).toEqual({ before: 'no amount here', amount: '', after: '', price: '' });
    for (const cat of [en, ha, yo]) {
      const txt = cat['home.trialStakesEnded'].replace('{{amount}}', '₦9,000').replace('{{n}}', '3');
      const p = stakesParts(txt, '₦9,000');
      expect(p.amount).toBe('₦9,000');
      expect(p.price).toMatch(/^\$1\.99/);
      expect(p.before + p.amount + p.after + ' · ' + p.price).toBe(txt);
    }
  });

  it('last-days chip puts the stakes full width under the countdown row (no squeezed column)', () => {
    expect(homeSrc).toContain("'pro-trial-chip has-stakes'");
    expect(homeSrc).toContain('pro-trial-stakes-amt');
    expect(css).toMatch(/\.pro-trial-chip\.has-stakes\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.pro-trial-stakes\s*\{[^}]*flex:\s*1 0 100%/);
    expect(css).toMatch(/\.pro-trial-stakes-price\s*\{[^}]*white-space:\s*nowrap/);
  });
});
