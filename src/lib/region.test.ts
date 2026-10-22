import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import geoHandler, { countryFromHeaders } from '../../api/geo';
import { isRegionNigeria, loadLocale, setRegionNigeria, t } from '../i18n';
import { en } from '../i18n/locales/en';
import { deviceSaysNigeria, getCountry, refreshRegion } from './region';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => setRegionNigeria(false));

const geo = (country: unknown, ok = true) =>
  (async () => ({ ok, json: async () => ({ country }) })) as unknown as typeof fetch;

describe('region detection', () => {
  it('device hints: Africa/Lagos time zone or a *-NG language mean Nigeria', () => {
    expect(deviceSaysNigeria('Africa/Lagos', ['en-US'])).toBe(true);
    expect(deviceSaysNigeria('Europe/London', ['en-NG'])).toBe(true);
    expect(deviceSaysNigeria('Europe/London', ['en-GB', 'ha-ng'])).toBe(true);
    expect(deviceSaysNigeria('Africa/Accra', ['en-GH', 'en'])).toBe(false);
    expect(deviceSaysNigeria('', [])).toBe(false);
  });

  it('caches the /api/geo answer on the phone and uses it offline', async () => {
    expect(await refreshRegion(geo('NG'), 1000)).toBe('NG');
    expect(isRegionNigeria()).toBe(true);
    expect(JSON.parse(store.get('bashibook-region')!)).toEqual({ c: 'NG', at: 1000 });
    // later, no network: still NG from the cache
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await refreshRegion(boom, 2000)).toBe('NG');
  });

  it('a geo answer outside Nigeria wins over nothing and gives neutral wording', async () => {
    expect(await refreshRegion(geo('GH'), 1000)).toBe('GH');
    expect(getCountry()).toBe('GH');
    expect(isRegionNigeria()).toBe(false);
  });

  it('ignores junk answers and refreshes a stale cache', async () => {
    expect(await refreshRegion(geo('<script>'), 1000)).not.toBe('<script>');
    expect(store.get('bashibook-region')).toBeUndefined();
    await refreshRegion(geo('NG'), 1000);
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(await refreshRegion(geo('KE'), 1000 + week + 1)).toBe('KE');
  });
});

describe('{{shops}} placeholder', () => {
  it('reads "small shops" by default and "Nigerian shops" only in Nigeria', async () => {
    expect(t('settings.aboutLine2')).toBe('Offline credit book (bashi) for small shops');
    setRegionNigeria(true);
    expect(t('settings.aboutLine2')).toBe('Offline credit book (bashi) for Nigerian shops');
    await loadLocale('ha');
    expect(t('settings.aboutLine2', undefined, 'ha')).toContain('shagunan Najeriya');
    setRegionNigeria(false);
    expect(t('settings.aboutLine2', undefined, 'ha')).toContain('ƙananan shaguna');
  });

  it('no app string names Nigeria except the region phrase itself', async () => {
    await Promise.all([loadLocale('ha'), loadLocale('yo')]);
    const re = /nigeria|najeriya|nàìjíríà/i;
    for (const loc of ['en', 'ha', 'yo'] as const) {
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        if (k === 'region.shopsNG') continue;
        expect(t(k, undefined, loc), `${loc} ${k}`).not.toMatch(re);
      }
    }
  });
});

describe('/api/geo', () => {
  it('returns only the x-vercel-ip-country header, uncached', () => {
    expect(countryFromHeaders({ 'x-vercel-ip-country': 'ng' })).toBe('NG');
    expect(countryFromHeaders({ 'x-vercel-ip-country': 'XXX' })).toBeNull();
    expect(countryFromHeaders({})).toBeNull();
    const headers: Record<string, string> = {};
    let status = 0;
    let body: unknown;
    const res = {
      status(c: number) { status = c; return res; },
      json(b: unknown) { body = b; },
      setHeader(k: string, v: string) { headers[k] = v; },
    };
    geoHandler({ method: 'GET', headers: { 'x-vercel-ip-country': 'GH', 'x-real-ip': '1.2.3.4' } }, res);
    expect(status).toBe(200);
    expect(body).toEqual({ country: 'GH' });
    expect(headers['Cache-Control']).toBe('private, no-store');
  });
});
