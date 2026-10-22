import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushHits, hit } from './hit';
import pageKippa from '../../public/kippa-alternative.html?raw';
import pageCb from '../../public/credit-book-app.html?raw';

let mem: Record<string, string>;
let sent: unknown[][];
let online = true;
let beaconOk = true;

beforeEach(() => {
  mem = {};
  sent = [];
  online = true;
  beaconOk = true;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => void (mem[k] = String(v)),
    removeItem: (k: string) => void delete mem[k],
  });
  vi.stubGlobal('navigator', {
    get onLine() {
      return online;
    },
    sendBeacon: (url: string, blob: Blob) => {
      expect(url).toBe('/api/hit');
      if (!beaconOk) return false;
      void blob.text().then((t) => sent.push(JSON.parse(t)));
      return true;
    },
  });
  vi.stubGlobal('addEventListener', () => {});
});
afterEach(() => vi.unstubAllGlobals());
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('client hit()', () => {
  it('sends event + first-touch src only, and once-per-device events only once', async () => {
    mem['bashibook-attribution'] = JSON.stringify({ at: 1, src: 'kippa-tw', ref: 'bb-xyz' });
    hit('app_open', { once: true });
    hit('app_open', { once: true });
    await settle();
    expect(sent).toEqual([[{ e: 'app_open', s: 'kippa-tw' }]]);
    expect(JSON.stringify(sent)).not.toContain('bb-xyz');
  });

  it('daily events count once per device per day per src', async () => {
    hit('view_home', { daily: true, src: 'TW' });
    hit('view_home', { daily: true, src: 'tw' });
    hit('view_home', { daily: true, src: 'fb' });
    await settle();
    expect(sent).toEqual([[{ e: 'view_home', s: 'tw' }], [{ e: 'view_home', s: 'fb' }]]);
  });

  it('queues offline and flushes the queue with the next hit when back online', async () => {
    online = false;
    hit('first_customer', { once: true });
    expect(sent).toEqual([]);
    expect(JSON.parse(mem['bashibook-hitq'])).toEqual([{ e: 'first_customer' }]);
    online = true;
    hit('pro_checkout', { once: true });
    await settle();
    expect(sent).toEqual([[{ e: 'first_customer' }, { e: 'pro_checkout' }]]);
    expect(mem['bashibook-hitq']).toBeUndefined();
  });

  it('keeps at most 20 queued hits and never throws without sendBeacon', () => {
    beaconOk = false;
    for (let i = 0; i < 30; i++) flushHits([{ e: 'app_open' }]);
    expect(JSON.parse(mem['bashibook-hitq'])).toHaveLength(20);
    vi.stubGlobal('navigator', {});
    expect(() => hit('app_open')).not.toThrow();
  });
});

describe('static SEO pages count a daily view with the sanitised src', () => {
  for (const [html, ev] of [
    [pageKippa, 'view_kippa'],
    [pageCb, 'view_cb'],
  ] as const) {
    it(ev, async () => {
      const code = [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('/api/hit'))!;
      const run = (search: string) => new Function('location', code)({ search });
      run('?src=Google_Ads%20NG');
      run('?src=Google_Ads%20NG');
      run('');
      await settle();
      expect(sent).toEqual([{ e: ev, s: 'googleadsng' }, { e: ev }]);
    });
  }
});
