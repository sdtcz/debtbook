import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type B = { pathname: string; url: string; uploadedAt: Date };
const store = new Map<string, B>();
const listPrefixes: string[] = [];
const deleted: string[] = [];
vi.mock('@vercel/blob', () => ({
  list: async (opts: { prefix?: string }) => {
    listPrefixes.push(opts.prefix ?? '');
    return {
      blobs: [...store.values()].filter((b) => b.pathname.startsWith(opts.prefix ?? '')),
      hasMore: false,
    };
  },
  del: async (urls: string[]) => {
    for (const u of urls) {
      deleted.push(u);
      for (const [k, b] of store) if (b.url === u) store.delete(k);
    }
  },
}));

import handler, {
  isBackupPath,
  MAX_DELETES_PER_RUN,
  RETENTION_DAYS,
  selectExpired,
} from '../../api/cloud-backup-retention';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16, 9, 0, 0);
const hex = (n: number) => n.toString(16).padStart(64, '0');
function add(pathname: string, ageMs: number) {
  store.set(pathname, { pathname, url: `https://blob.test/${pathname}`, uploadedAt: new Date(NOW - ageMs) });
}
const backup = (n: number) => `debtbook-backups/${hex(n)}.json`;

function call(opts: { auth?: string; query?: Record<string, string>; method?: string } = {}) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
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
    void handler(
      {
        method: opts.method ?? 'GET',
        query: opts.query,
        headers: opts.auth ? { authorization: opts.auth } : {},
      },
      res,
    );
  });
}

beforeEach(() => {
  store.clear();
  listPrefixes.length = 0;
  deleted.length = 0;
  env.CRON_SECRET = 'cron-test-secret';
  env.BLOB_READ_WRITE_TOKEN = 'test-token';
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  delete env.CRON_SECRET;
  delete env.BLOB_READ_WRITE_TOKEN;
});

const AUTH = 'Bearer cron-test-secret';

describe('cloud backup retention (90 days)', () => {
  it('boundary: exactly 90 days is kept, 90 days + 1 ms is deleted', () => {
    expect(RETENTION_DAYS).toBe(90);
    const blobs = [
      { pathname: backup(1), url: 'u1', uploadedAt: new Date(NOW - 90 * DAY) },
      { pathname: backup(2), url: 'u2', uploadedAt: new Date(NOW - 90 * DAY - 1) },
      { pathname: backup(3), url: 'u3', uploadedAt: new Date(NOW - 89 * DAY) },
    ];
    expect(selectExpired(blobs, NOW).map((b) => b.url)).toEqual(['u2']);
  });

  it('only recognises files in the backup folder', () => {
    expect(isBackupPath(backup(1))).toBe(true);
    expect(isBackupPath('debtbook-stats/hits-2026-01.json')).toBe(false);
    expect(isBackupPath(`other/${hex(1)}.json`)).toBe(false);
    expect(isBackupPath(`debtbook-backups/${hex(1)}.json.bak`)).toBe(false);
    expect(isBackupPath('debtbook-backups/nested/x.json')).toBe(false);
  });

  it('auth: 501 without CRON_SECRET, 401 without or with a wrong bearer', async () => {
    add(backup(1), 200 * DAY);
    delete env.CRON_SECRET;
    expect((await call({ auth: AUTH })).status).toBe(501);
    env.CRON_SECRET = 'cron-test-secret';
    expect((await call()).status).toBe(401);
    expect((await call({ auth: 'Bearer wrong' })).status).toBe(401);
    expect((await call({ auth: 'cron-test-secret' })).status).toBe(401);
    expect(deleted).toHaveLength(0);
    expect(listPrefixes).toHaveLength(0);
  });

  it('deletes only stale backups and never touches usage counts or other folders', async () => {
    add(backup(1), 91 * DAY);
    add(backup(2), 10 * DAY);
    add('debtbook-stats/hits-2025-01.json', 400 * DAY);
    add(`other/${hex(9)}.json`, 400 * DAY);
    const r = await call({ auth: AUTH });
    expect(r).toMatchObject({ status: 200, body: { ok: true, dryRun: false, scanned: 2, expired: 1, deleted: 1, capped: false } });
    expect(listPrefixes).toEqual(['debtbook-backups/']);
    expect(deleted).toEqual([`https://blob.test/${backup(1)}`]);
    expect(store.has('debtbook-stats/hits-2025-01.json')).toBe(true);
    expect(store.has(`other/${hex(9)}.json`)).toBe(true);
    expect(store.has(backup(2))).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain(hex(1));
  });

  it(`caps deletions at ${MAX_DELETES_PER_RUN} per run`, async () => {
    for (let i = 1; i <= MAX_DELETES_PER_RUN + 7; i++) add(backup(i), 100 * DAY);
    const r = await call({ auth: AUTH });
    expect(r.body).toMatchObject({ expired: MAX_DELETES_PER_RUN + 7, deleted: MAX_DELETES_PER_RUN, capped: true });
    expect(deleted).toHaveLength(MAX_DELETES_PER_RUN);
    expect(store.size).toBe(7);
  });

  it('dry run reports but deletes nothing', async () => {
    add(backup(1), 120 * DAY);
    add(backup(2), 1 * DAY);
    const r = await call({ auth: AUTH, query: { dry: '1' } });
    expect(r.body).toMatchObject({ ok: true, dryRun: true, scanned: 2, expired: 1, wouldDelete: 1 });
    expect(deleted).toHaveLength(0);
    expect(store.size).toBe(2);
  });
});
