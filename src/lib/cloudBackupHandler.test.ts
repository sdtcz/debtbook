import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory fake of @vercel/blob that behaves like a store of one access type.
const store = new Map<string, string>();
let storeAccess: 'private' | 'public' = 'private';
vi.mock('@vercel/blob', () => ({
  put: async (path: string, body: string, opts: { access: string }) => {
    if (opts.access !== storeAccess) {
      throw new Error(`Vercel Blob: Cannot use ${opts.access} access on a ${storeAccess} store. The store is configured with ${storeAccess} access.`);
    }
    store.set(path, body);
    return { url: `https://blob.test/${path}`, pathname: path };
  },
  get: async (path: string, opts: { access: string }) => {
    if (opts.access !== storeAccess) {
      throw new Error(`Vercel Blob: Cannot use ${opts.access} access on a ${storeAccess} store.`);
    }
    const v = store.get(path);
    if (v == null) return null;
    return { statusCode: 200, stream: new Response(v).body };
  },
}));

import handler from '../../api/cloud-backup';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
function call(method: string, opts: { body?: unknown; query?: Record<string, string> } = {}) {
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
    };
    void handler({ method, body: opts.body as never, query: opts.query }, res);
  });
}

const id = 'a'.repeat(64);
const blob = { backupId: id, ciphertext: 'Y2lwaGVy', iv: 'aXY=', salt: 'c2FsdA==', meta: { version: 1 } };

describe('/api/cloud-backup with private and public Blob stores', () => {
  beforeEach(() => {
    store.clear();
    env.BLOB_READ_WRITE_TOKEN = 'test-token';
    delete env.BLOB_ACCESS;
  });
  afterEach(() => {
    delete env.BLOB_READ_WRITE_TOKEN;
  });

  for (const access of ['private', 'public'] as const) {
    it(`round-trips on a ${access} store`, async () => {
      storeAccess = access;
      const up = await call('POST', { body: blob });
      expect(up).toMatchObject({ status: 200, body: { ok: true, backupId: id } });
      const meta = await call('GET', { query: { id, meta: '1' } });
      expect(meta.body).toMatchObject({ ok: true, meta: { version: 1 } });
      expect(meta.body.ciphertext).toBeUndefined();
      const got = await call('GET', { query: { id } });
      expect(got.body).toMatchObject({ ok: true, ciphertext: blob.ciphertext, iv: blob.iv, salt: blob.salt });
    });
  }

  it('404 for an unknown id, 501 without a token', async () => {
    storeAccess = 'private';
    expect((await call('GET', { query: { id: 'b'.repeat(64) } })).status).toBe(404);
    delete env.BLOB_READ_WRITE_TOKEN;
    expect((await call('GET', { query: { id } })).status).toBe(501);
  });
});
