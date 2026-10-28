import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';
import { PUBLIC_APP_URL } from '../config';
import { getDb, resetDbCache } from '../db/schema';
import { saveShop, upsertCustomer } from '../db/repo';
import { exportBackup, isBackupPayload } from './backup';
import { NEW_ORIGIN, OLD_ORIGIN, newAddress, receiveBook, sendBook } from './move';
import { acceptBook } from './moveIn';
import { hasLocalBook } from './moveOld';
import type { BackupPayload } from './types';

beforeEach(async () => {
  try {
    (await getDb()).close();
  } catch {
    /* none */
  }
  resetDbCache();
  globalThis.indexedDB = new IDBFactory();
});

/** Two fake windows wired together like window.open + opener. */
function pair() {
  type L = (e: { origin: string; source: unknown; data: unknown }) => void;
  const oldL = new Set<L>();
  const newL = new Set<L>();
  const sent: { to: string; origin: string; data: unknown }[] = [];
  const oldWin = {} as { postMessage: (m: unknown, o: string) => void };
  const newWin = {} as { postMessage: (m: unknown, o: string) => void };
  // Delivery honours targetOrigin like the browser: wrong origin = silently dropped.
  newWin.postMessage = (data, origin) => {
    sent.push({ to: 'new', origin, data });
    if (origin === NEW_ORIGIN) queueMicrotask(() => newL.forEach((f) => f({ origin: OLD_ORIGIN, source: oldWin, data })));
  };
  oldWin.postMessage = (data, origin) => {
    sent.push({ to: 'old', origin, data });
    if (origin === OLD_ORIGIN) queueMicrotask(() => oldL.forEach((f) => f({ origin: NEW_ORIGIN, source: newWin, data })));
  };
  const listen = (set: Set<L>) => (fn: L) => (set.add(fn), () => set.delete(fn));
  return { oldWin, newWin, sent, listenOld: listen(oldL), listenNew: listen(newL) };
}

const book = (n = 1): BackupPayload => ({
  version: 1,
  exportedAt: 1,
  shop: { id: 'shop', name: 'Ada', createdAt: 1, updatedAt: 1 } as never,
  customers: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `C${i}`, createdAt: 1, updatedAt: 1 }) as never),
  entries: [],
});

describe('domain move', () => {
  it('new address is bashibook.app; old links keep path, query and hash', () => {
    expect(PUBLIC_APP_URL).toBe('https://bashibook.app');
    expect(newAddress({ pathname: '/', search: '?app=1&checkout=stripe&session_id=cs_1', hash: '' })).toBe(
      'https://bashibook.app/?app=1&checkout=stripe&session_id=cs_1',
    );
    expect(newAddress({ pathname: '/', search: '?app=1', hash: '#/customers/x' })).toBe('https://bashibook.app/?app=1#/customers/x');
  });

  it('hands the book over only between the two exact origins, then reports counts', async () => {
    const { oldWin, newWin, sent, listenOld, listenNew } = pair();
    let got: BackupPayload | null = null;
    const recv = receiveBook({
      opener: oldWin,
      listen: listenNew,
      isBackup: isBackupPayload,
      accept: async (b) => ((got = b), { customers: b.customers.length, entries: 0 }),
    });
    const send = sendBook({ win: newWin, backup: Promise.resolve(book(3)), listen: listenOld });
    expect(await recv).toBe('done');
    expect(await send).toEqual({ ok: true, customers: 3, entries: 0 });
    expect(got!.customers).toHaveLength(3);
    for (const m of sent) expect(m.origin).toBe(m.to === 'new' ? NEW_ORIGIN : OLD_ORIGIN);
  });

  it('ignores messages from any other origin or window', async () => {
    const { oldWin, listenNew } = pair();
    let fire: ((e: { origin: string; source: unknown; data: unknown }) => void) | null = null;
    const accepted: unknown[] = [];
    const recv = receiveBook({
      opener: oldWin,
      listen: (fn) => ((fire = fn), listenNew(fn)),
      isBackup: isBackupPayload,
      accept: async (b) => (accepted.push(b), { customers: 1, entries: 0 }),
      timeoutMs: 50,
    });
    fire!({ origin: 'https://evil.example', source: oldWin, data: { type: 'bb-move', v: 1, backup: book() } });
    fire!({ origin: OLD_ORIGIN, source: {}, data: { type: 'bb-move', v: 1, backup: book() } });
    expect(await recv).toBe('timeout');
    expect(accepted).toEqual([]);
  });

  it('PIN cancelled on the old address: nothing is sent', async () => {
    const { oldWin, newWin, sent, listenOld, listenNew } = pair();
    const recv = receiveBook({ opener: oldWin, listen: listenNew, isBackup: isBackupPayload, accept: async () => ({ customers: 0, entries: 0 }) });
    const send = await sendBook({ win: newWin, backup: Promise.resolve(null), listen: listenOld });
    expect(send).toEqual({ ok: false, reason: 'cancelled' });
    expect(await recv).toBe('cancelled');
    expect(sent.some((m) => (m.data as { type: string }).type === 'bb-move')).toBe(false);
  });

  it('no opener (typed address): nothing to receive', async () => {
    expect(await receiveBook({ opener: null, listen: () => () => {}, isBackup: isBackupPayload, accept: async () => 'declined' })).toBe('no-opener');
  });

  it('old address: knows whether this phone has a book', async () => {
    expect(await hasLocalBook()).toBe(false);
    await saveShop('Ada');
    expect(await hasLocalBook()).toBe(true);
  });

  it('new address: imports into an empty phone; asks before replacing a book already there', async () => {
    expect(await acceptBook(book(2), () => false)).toEqual({ customers: 2, entries: 0 });
    await upsertCustomer({ name: 'Here already' });
    const before = (await exportBackup()).customers.length;
    expect(await acceptBook(book(5), () => false)).toBe('declined');
    expect((await exportBackup()).customers.length).toBe(before);
    expect(await acceptBook(book(5), () => true)).toEqual({ customers: 5, entries: 0 });
  });
});

describe('vercel.app → bashibook.app redirect', () => {
  const r = (vercel as { redirects: { source: string; destination: string; permanent: boolean; has: { value: string }[] }[] }).redirects[0];
  const re = new RegExp('^' + r.source.replace('/(', '/(') + '$');
  it('is a 308 for the old host only (previews untouched)', () => {
    expect(r.permanent).toBe(true);
    expect(r.has).toEqual([{ type: 'host', value: 'debtbook-neon.vercel.app' }]);
    expect(r.destination).toBe('https://bashibook.app/$1');
  });
  it('keeps the app shell, assets, service worker and /api on the old host', () => {
    for (const p of ['/', '/index.html', '/api/webhook', '/api/hit', '/assets/app-x.js', '/app.js', '/sw.js', '/workbox-dcde9eb3.js', '/manifest.webmanifest', '/icons/icon-192.png', '/favicon.ico'])
      expect(re.test(p), p).toBe(false);
  });
  it('sends pages to bashibook.app', () => {
    for (const p of ['/credit-book-app', '/ng/kippa-alternative', '/sitemap.xml', '/robots.txt', '/og-image.png', '/privacy', '/nope'])
      expect(re.test(p), p).toBe(true);
  });
});
