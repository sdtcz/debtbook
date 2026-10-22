declare const process: { env: Record<string, string | undefined> };

/**
 * Anonymous channel counter: POST /api/hit, read totals with GET /api/hit?stats=1.
 *
 * Stores ONLY monthly totals keyed by "event|src" — no IP, phone, user id,
 * names or amounts. The caller's IP is used transiently, in memory, for rate
 * limiting (salted hash, wiped every minute) and is never stored or logged.
 *
 * Storage (free):
 *  - Upstash Redis REST (Vercel Marketplace free tier) when KV_REST_API_URL +
 *    KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + _TOKEN) are set: atomic HINCRBY.
 *  - Otherwise the existing Vercel Blob store: one small JSON per month. Each
 *    counted hit costs 1 Blob read + 1 Blob write, so writes are hard-capped per
 *    month (HIT_MONTHLY_WRITE_CAP, default 1000) to protect the Hobby Blob quota
 *    that Pro cloud backup depends on. Hits over the cap are dropped.
 *
 * Stats are protected by the HIT_STATS_SECRET env var (Authorization: Bearer …).
 */

export const HIT_EVENTS = ['view_home', 'view_kippa', 'view_cb', 'app_open', 'first_customer', 'pro_checkout'] as const;
export type HitEvent = (typeof HIT_EVENTS)[number];
/** Same rule as the app's src tags (src/lib/growth.ts TAG_RE). */
export const SRC_RE = /^[a-z0-9-]{1,32}$/;
const MAX_BATCH = 10;
const MAX_KEYS = 600; // distinct event|src pairs per month; extra srcs fold into "other"
const PER_CLIENT_PER_MIN = 20;
const PER_INSTANCE_PER_MIN = 300;
const STATS_PREFIX = 'debtbook-stats'; // inside the existing (private) Blob store

type Req = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader?: (k: string, v: string) => void;
  end?: () => void;
};

export type Hit = { e: HitEvent; s: string };

/** Parse and validate a beacon body. Unknown events are rejected; bad srcs become "direct". */
export function parseHits(body: unknown): Hit[] | null {
  let raw: unknown = body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const list: unknown[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (!list.length || list.length > MAX_BATCH) return null;
  const out: Hit[] = [];
  for (const item of list) {
    const o = (item || {}) as { e?: unknown; s?: unknown };
    if (typeof o.e !== 'string' || !(HIT_EVENTS as readonly string[]).includes(o.e)) return null;
    const s = typeof o.s === 'string' && SRC_RE.test(o.s) ? o.s : 'direct';
    out.push({ e: o.e as HitEvent, s });
  }
  return out;
}

export function monthKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7); // UTC YYYY-MM
}

/* ── rate limiting (memory only) ─────────────────────────────────────── */
let windowStart = 0;
let instanceCount = 0;
const perClient = new Map<string, number>();
const salt = Math.random().toString(36).slice(2);

function clientKey(req: Req): string {
  const h = req.headers || {};
  const raw = String(h['x-real-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim();
  // Cheap salted hash so even the in-memory map never holds a raw IP.
  let x = 2166136261;
  for (const ch of salt + raw) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return (x >>> 0).toString(36);
}

export function rateLimited(req: Req, cost: number, now = Date.now()): boolean {
  if (now - windowStart > 60_000) {
    windowStart = now;
    instanceCount = 0;
    perClient.clear();
  }
  const k = clientKey(req);
  const used = perClient.get(k) || 0;
  if (used + cost > PER_CLIENT_PER_MIN || instanceCount + cost > PER_INSTANCE_PER_MIN) return true;
  perClient.set(k, used + cost);
  instanceCount += cost;
  return false;
}

export function resetRateLimitForTests(): void {
  windowStart = 0;
  instanceCount = 0;
  perClient.clear();
}

/* ── storage ─────────────────────────────────────────────────────────── */
type MonthDoc = { v: 1; month: string; writes: number; counts: Record<string, number> };

export function applyHits(doc: MonthDoc, hits: Hit[]): MonthDoc {
  const counts = { ...doc.counts };
  for (const h of hits) {
    let key = `${h.e}|${h.s}`;
    if (!(key in counts) && Object.keys(counts).length >= MAX_KEYS) key = `${h.e}|other`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return { ...doc, writes: doc.writes + 1, counts };
}

function env(name: string): string | undefined {
  return process.env[name] || undefined;
}

function redisConfig(): { url: string; token: string } | null {
  const url = env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redis(cfg: { url: string; token: string }, commands: (string | number)[][]): Promise<unknown[]> {
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return ((await r.json()) as { result: unknown }[]).map((x) => x.result);
}

function writeCap(): number {
  const n = Number(env('HIT_MONTHLY_WRITE_CAP'));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1000;
}

const cappedMonths = new Set<string>(); // per instance: skip Blob reads once the cap is hit

type Access = 'private' | 'public';
const accessOrder = (): Access[] => (env('BLOB_ACCESS') === 'public' ? ['public', 'private'] : ['private', 'public']);
const isAccessMismatch = (err: unknown) =>
  err instanceof Error && /(private|public) access on a (public|private) store/i.test(err.message);

async function blobRead(month: string, token: string): Promise<{ doc: MonthDoc; etag?: string; access: Access }> {
  const { get } = await import('@vercel/blob');
  let lastErr: unknown;
  for (const access of accessOrder()) {
    try {
      const hit = await get(`${STATS_PREFIX}/hits-${month}.json`, { access, token, useCache: false });
      if (hit && hit.statusCode === 200 && hit.stream) {
        const doc = JSON.parse(await new Response(hit.stream).text()) as MonthDoc;
        return { doc, etag: hit.blob.etag, access };
      }
      return { doc: { v: 1, month, writes: 0, counts: {} }, access };
    } catch (err) {
      if (/not ?found/i.test(err instanceof Error ? err.message : '')) {
        return { doc: { v: 1, month, writes: 0, counts: {} }, access };
      }
      lastErr = err;
      if (!isAccessMismatch(err)) break;
    }
  }
  throw lastErr;
}

/** Returns 'counted' | 'capped'. */
async function blobCount(hits: Hit[], month: string, token: string): Promise<'counted' | 'capped'> {
  if (cappedMonths.has(month)) return 'capped';
  const { put } = await import('@vercel/blob');
  for (let attempt = 0; attempt < 3; attempt++) {
    const { doc, etag, access } = await blobRead(month, token);
    if (doc.writes >= writeCap()) {
      cappedMonths.add(month);
      return 'capped';
    }
    try {
      await put(`${STATS_PREFIX}/hits-${month}.json`, JSON.stringify(applyHits(doc, hits)), {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        token,
        ...(etag ? { ifMatch: etag } : {}),
      });
      return 'counted';
    } catch (err) {
      // Lost a race with another write: re-read and retry.
      if (!/precondition|etag|412/i.test(err instanceof Error ? `${err.name} ${err.message}` : '')) throw err;
    }
  }
  throw new Error('hit write contention');
}

/** Group "event|src" counts into { src: { event: n } } plus per-event totals. */
export function summarise(counts: Record<string, number>) {
  const bySrc: Record<string, Record<string, number>> = {};
  const byEvent: Record<string, number> = {};
  for (const [k, n] of Object.entries(counts)) {
    const [e, s] = k.split('|');
    (bySrc[s] ||= {})[e] = n;
    byEvent[e] = (byEvent[e] || 0) + n;
  }
  return { bySrc, byEvent };
}

function header(req: Req, name: string): string {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] || '' : v || '';
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const secret = env('HIT_STATS_SECRET');
    if (!secret) {
      res.status(503).json({ ok: false, message: 'Set HIT_STATS_SECRET to read stats' });
      return;
    }
    const auth = header(req, 'authorization').replace(/^Bearer\s+/i, '');
    if (!auth || !safeEqual(auth, secret)) {
      res.status(401).json({ ok: false, message: 'Unauthorized' });
      return;
    }
    const m = typeof req.query?.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : monthKey();
    try {
      const cfg = redisConfig();
      if (cfg) {
        const [flat] = (await redis(cfg, [['HGETALL', `bb:hits:${m}`]])) as string[][];
        const counts: Record<string, number> = {};
        for (let i = 0; i + 1 < (flat || []).length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
        res.status(200).json({ ok: true, month: m, backend: 'redis', ...summarise(counts) });
        return;
      }
      const token = env('BLOB_READ_WRITE_TOKEN');
      if (!token) {
        res.status(501).json({ ok: false, message: 'No storage configured' });
        return;
      }
      const { doc } = await blobRead(m, token);
      res.status(200).json({
        ok: true,
        month: m,
        backend: 'blob',
        writes: doc.writes,
        writeCap: writeCap(),
        capped: doc.writes >= writeCap(),
        ...summarise(doc.counts),
      });
    } catch {
      res.status(500).json({ ok: false, message: 'Could not read stats' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const hits = parseHits(req.body);
  if (!hits) {
    res.status(400).json({ ok: false, message: 'Bad hit' });
    return;
  }
  if (rateLimited(req, hits.length)) {
    res.status(429).json({ ok: false, message: 'Slow down' });
    return;
  }

  const month = monthKey();
  try {
    const cfg = redisConfig();
    if (cfg) {
      await redis(
        cfg,
        hits.map((h) => ['HINCRBY', `bb:hits:${month}`, `${h.e}|${h.s}`, 1]),
      );
      res.status(200).json({ ok: true, counted: hits.length });
      return;
    }
    const token = env('BLOB_READ_WRITE_TOKEN');
    if (!token) {
      res.status(200).json({ ok: true, counted: 0, reason: 'no-storage' });
      return;
    }
    const r = await blobCount(hits, month, token);
    res.status(200).json({ ok: true, counted: r === 'counted' ? hits.length : 0, ...(r === 'capped' ? { reason: 'capped' } : {}) });
  } catch {
    // Never surface storage errors to the beacon; nothing to retry client-side.
    res.status(200).json({ ok: true, counted: 0, reason: 'error' });
  }
}
