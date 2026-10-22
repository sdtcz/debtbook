import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory fake of a private Vercel Blob store with ETags.
const store = new Map<string, { body: string; etag: string }>();
let n = 0;
vi.mock('@vercel/blob', () => ({
  put: async (path: string, body: string, opts: { access: string; ifMatch?: string }) => {
    if (opts.access !== 'private') throw new Error('Vercel Blob: Cannot use public access on a private store.');
    const cur = store.get(path);
    if (opts.ifMatch && cur?.etag !== opts.ifMatch) {
      const e = new Error('Precondition failed');
      e.name = 'BlobPreconditionFailedError';
      throw e;
    }
    store.set(path, { body, etag: `e${++n}` });
    return { pathname: path };
  },
  get: async (path: string, opts: { access: string }) => {
    if (opts.access !== 'private') throw new Error('Vercel Blob: Cannot use public access on a private store.');
    const v = store.get(path);
    if (!v) return null;
    return { statusCode: 200, stream: new Response(v.body).body, blob: { etag: v.etag } };
  },
}));

import handler, { applyHits, monthKey, parseHits, resetRateLimitForTests, summarise } from '../../api/hit';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
type Out = { status: number; body: Record<string, unknown> };
function call(method: string, opts: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string> } = {}) {
  return new Promise<Out>((resolve) => {
    let status = 200;
    const res = {
      status(c: number) {
        status = c;
        return res;
      },
      json(b: unknown) {
        resolve({ status, body: b as Record<string, unknown> });
      },
      setHeader() {},
    };
    void handler({ method, body: opts.body, query: opts.query, headers: { 'x-real-ip': '1.2.3.4', ...opts.headers } }, res);
  });
}
const stats = (secret = 's3cret') => call('GET', { query: { stats: '1' }, headers: { authorization: `Bearer ${secret}` } });

describe('parseHits', () => {
  it('accepts known events and valid src tags (single, batch, or beacon text)', () => {
    expect(parseHits({ e: 'app_open', s: 'kippa-tw' })).toEqual([{ e: 'app_open', s: 'kippa-tw' }]);
    expect(parseHits('[{"e":"view_cb","s":"cb-x"},{"e":"first_customer"}]')).toEqual([
      { e: 'view_cb', s: 'cb-x' },
      { e: 'first_customer', s: 'direct' },
    ]);
  });
  it('rejects unknown events, junk and oversized batches; bad src becomes "direct"', () => {
    expect(parseHits({ e: 'purchase', s: 'x' })).toBeNull();
    expect(parseHits('nope')).toBeNull();
    expect(parseHits([])).toBeNull();
    expect(parseHits(Array.from({ length: 11 }, () => ({ e: 'app_open' })))).toBeNull();
    expect(parseHits({ e: 'app_open', s: 'Has Spaces' })).toEqual([{ e: 'app_open', s: 'direct' }]);
    expect(parseHits({ e: 'app_open', s: 'a'.repeat(33) })![0].s).toBe('direct');
    expect(parseHits({ e: 'app_open', s: 'kippa-' + 'a'.repeat(20) })![0].s).toBe('kippa-' + 'a'.repeat(20));
  });
  it('only ever stores event|src counts (no other fields survive)', () => {
    const doc = applyHits({ v: 1, month: '2026-10', writes: 0, counts: {} }, parseHits({ e: 'app_open', s: 'tw', phone: '0803', name: 'Ada' } as never)!);
    expect(doc).toEqual({ v: 1, month: '2026-10', writes: 1, counts: { 'app_open|tw': 1 } });
  });
  it('folds new srcs into "other" once a month has too many distinct keys', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 600; i++) counts[`app_open|s${i}`] = 1;
    const doc = applyHits({ v: 1, month: 'm', writes: 0, counts }, [{ e: 'app_open', s: 'brand-new' }]);
    expect(doc.counts['app_open|other']).toBe(1);
    expect(doc.counts['app_open|brand-new']).toBeUndefined();
  });
  it('summarises by src and by event', () => {
    expect(summarise({ 'app_open|tw': 2, 'view_cb|tw': 1, 'app_open|direct': 3 })).toEqual({
      bySrc: { tw: { app_open: 2, view_cb: 1 }, direct: { app_open: 3 } },
      byEvent: { app_open: 5, view_cb: 1 },
    });
  });
});

describe('/api/hit on the Blob store', () => {
  beforeEach(() => {
    store.clear();
    resetRateLimitForTests();
    env.BLOB_READ_WRITE_TOKEN = 'blob-token';
    env.HIT_STATS_SECRET = 's3cret';
    delete env.HIT_MONTHLY_WRITE_CAP;
  });
  afterEach(() => {
    delete env.BLOB_READ_WRITE_TOKEN;
    delete env.HIT_STATS_SECRET;
    delete env.HIT_MONTHLY_WRITE_CAP;
  });

  it('counts hits and reads them back with the stats secret', async () => {
    expect((await call('POST', { body: '{"e":"app_open","s":"kippa-tw"}' })).body).toMatchObject({ ok: true, counted: 1 });
    await call('POST', { body: [{ e: 'app_open', s: 'kippa-tw' }, { e: 'view_kippa' }] });
    const r = await stats();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      month: monthKey(),
      backend: 'blob',
      writes: 2,
      bySrc: { 'kippa-tw': { app_open: 2 }, direct: { view_kippa: 1 } },
      byEvent: { app_open: 2, view_kippa: 1 },
    });
    expect(JSON.stringify(r.body)).not.toContain('1.2.3.4');
    expect([...store.values()].map((v) => v.body).join()).not.toContain('1.2.3.4');
  });

  it('protects stats: 401 with a wrong secret, 503 when no secret is set', async () => {
    expect((await stats('wrong')).status).toBe(401);
    expect((await call('GET', { query: { stats: '1' } })).status).toBe(401);
    delete env.HIT_STATS_SECRET;
    expect((await stats()).status).toBe(503);
  });

  it('validates input and method', async () => {
    expect((await call('POST', { body: { e: 'evil' } })).status).toBe(400);
    expect((await call('PUT')).status).toBe(405);
  });

  it('rate-limits a client to 20 hits a minute', async () => {
    for (let i = 0; i < 2; i++) {
      expect((await call('POST', { body: Array.from({ length: 10 }, () => ({ e: 'app_open' })) })).status).toBe(200);
    }
    expect((await call('POST', { body: { e: 'app_open' } })).status).toBe(429);
    expect((await call('POST', { body: { e: 'app_open' }, headers: { 'x-real-ip': '5.6.7.8' } })).status).toBe(200);
  });

  it('stops writing at the monthly write cap to protect the Blob quota', async () => {
    env.HIT_MONTHLY_WRITE_CAP = '2';
    await call('POST', { body: { e: 'app_open' } });
    await call('POST', { body: { e: 'app_open' } });
    const third = await call('POST', { body: { e: 'app_open' } });
    expect(third.body).toMatchObject({ ok: true, counted: 0, reason: 'capped' });
    expect((await stats()).body).toMatchObject({ writes: 2, capped: true, byEvent: { app_open: 2 } });
  });

  it('never fails the beacon when storage is missing', async () => {
    delete env.BLOB_READ_WRITE_TOKEN;
    expect((await call('POST', { body: { e: 'app_open' } })).body).toMatchObject({ ok: true, counted: 0 });
  });
});

describe('/api/hit on Upstash Redis (free tier) when configured', () => {
  const calls: unknown[] = [];
  beforeEach(() => {
    resetRateLimitForTests();
    calls.length = 0;
    env.KV_REST_API_URL = 'https://redis.test';
    env.KV_REST_API_TOKEN = 'kv';
    env.HIT_STATS_SECRET = 's3cret';
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const cmds = JSON.parse(init.body) as string[][];
      calls.push(cmds);
      const result = cmds[0][0] === 'HGETALL' ? ['app_open|tw', '4'] : 1;
      return new Response(JSON.stringify(cmds.map(() => ({ result }))));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete env.KV_REST_API_URL;
    delete env.KV_REST_API_TOKEN;
    delete env.HIT_STATS_SECRET;
  });
  it('increments atomically and reads back', async () => {
    await call('POST', { body: { e: 'app_open', s: 'tw' } });
    expect(calls[0]).toEqual([['HINCRBY', `bb:hits:${monthKey()}`, 'app_open|tw', 1]]);
    expect((await stats()).body).toMatchObject({ backend: 'redis', bySrc: { tw: { app_open: 4 } } });
  });
});
