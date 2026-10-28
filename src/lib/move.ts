/**
 * Domain move (Oct 2026): debtbook-neon.vercel.app → bashibook.app.
 *
 * A phone's book lives in IndexedDB, which belongs to ONE origin. So the old address is NOT
 * hard-redirected for people who have a book there:
 *  - old address, no book on this phone (or already moved) → go to the same path/search/hash on
 *    bashibook.app (also forwards Stripe's ?session_id return);
 *  - old address WITH a book → the app opens as before with a "Move your book" card. Moving opens
 *    bashibook.app in a new tab and hands the book over with window.postMessage between the two
 *    exact origins (never through a server or a URL). The old copy is never deleted.
 * Pure helpers here are unit-tested; DOM wiring is in moveOld.tsx / moveIn.tsx.
 */
import { MOVE_OLD_ORIGIN, PUBLIC_APP_URL } from '../config';
import type { BackupPayload } from './types';

/** Both fixed at BUILD time (VITE_PUBLIC_APP_URL / VITE_MOVE_OLD_ORIGIN for local tests), never at runtime. */
export const NEW_ORIGIN = PUBLIC_APP_URL;
export const OLD_ORIGIN = MOVE_OLD_ORIGIN;
export const MOVED_KEY = 'bashibook-moved';

export const isOldOrigin = (origin: string): boolean => origin === OLD_ORIGIN;

/** Same path, query and hash on the new address. */
export function newAddress(loc: { pathname: string; search: string; hash: string }): string {
  return `${NEW_ORIGIN}${loc.pathname || '/'}${loc.search || ''}${loc.hash || ''}`;
}

export type MoveMsg =
  | { type: 'bb-move-ready' }
  | { type: 'bb-move'; v: 1; backup: BackupPayload }
  | { type: 'bb-move-cancel' }
  | { type: 'bb-move-done'; customers: number; entries: number }
  | { type: 'bb-move-error'; reason: 'declined' | 'invalid' | 'failed' };

export function msgType(data: unknown): MoveMsg['type'] | null {
  const t = (data as { type?: unknown } | null)?.type;
  return typeof t === 'string' && t.startsWith('bb-move') ? (t as MoveMsg['type']) : null;
}

type MsgEvent = { origin: string; source: unknown; data: unknown };
type Listen = (fn: (e: MsgEvent) => void) => () => void;
type Target = { postMessage: (msg: unknown, origin: string) => void; closed?: boolean };

/**
 * OLD side: wait for the new tab to say it is ready, send the book (only to NEW_ORIGIN and
 * only to that tab), then wait for its answer.
 */
export function sendBook(opts: {
  win: Target;
  backup: Promise<BackupPayload | null>;
  listen: Listen;
  timeoutMs?: number;
}): Promise<{ ok: true; customers: number; entries: number } | { ok: false; reason: string }> {
  const { win, listen } = opts;
  return new Promise((resolve) => {
    let sent = false;
    const finish = (r: Awaited<ReturnType<typeof sendBook>>) => {
      off();
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: sent ? 'no-answer' : 'no-ready' }), opts.timeoutMs ?? 30_000);
    const off = listen((e) => {
      if (e.origin !== NEW_ORIGIN || e.source !== win) return;
      const t = msgType(e.data);
      if (t === 'bb-move-ready' && !sent) {
        sent = true;
        void opts.backup.then(
          (backup) => {
            if (!backup) {
              win.postMessage({ type: 'bb-move-cancel' }, NEW_ORIGIN);
              finish({ ok: false, reason: 'cancelled' });
            } else win.postMessage({ type: 'bb-move', v: 1, backup }, NEW_ORIGIN);
          },
          () => finish({ ok: false, reason: 'export-failed' }),
        );
      } else if (t === 'bb-move-done') {
        const d = e.data as { customers?: number; entries?: number };
        finish({ ok: true, customers: Number(d.customers) || 0, entries: Number(d.entries) || 0 });
      } else if (t === 'bb-move-error') {
        finish({ ok: false, reason: String((e.data as { reason?: unknown }).reason || 'failed') });
      }
    });
  });
}

/**
 * NEW side: tell the opener (the old address) we are ready, accept ONE book from exactly
 * OLD_ORIGIN and that opener, import it via `accept`, and answer.
 */
export function receiveBook(opts: {
  opener: Target | null;
  listen: Listen;
  accept: (backup: BackupPayload) => Promise<{ customers: number; entries: number } | 'declined'>;
  isBackup: (d: unknown) => d is BackupPayload;
  timeoutMs?: number;
}): Promise<'done' | 'declined' | 'cancelled' | 'no-opener' | 'timeout' | 'invalid' | 'failed'> {
  const { opener, listen } = opts;
  if (!opener) return Promise.resolve('no-opener');
  return new Promise((resolve) => {
    let busy = false;
    const finish = (r: Awaited<ReturnType<typeof receiveBook>>) => {
      off();
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => !busy && finish('timeout'), opts.timeoutMs ?? 5 * 60_000);
    const off = listen((e) => {
      if (!isOldOrigin(e.origin) || e.source !== opener || busy) return;
      const t = msgType(e.data);
      if (t === 'bb-move-cancel') return finish('cancelled');
      if (t !== 'bb-move') return;
      const backup = (e.data as { backup?: unknown }).backup;
      if (!opts.isBackup(backup)) {
        opener.postMessage({ type: 'bb-move-error', reason: 'invalid' }, OLD_ORIGIN);
        return finish('invalid');
      }
      busy = true;
      opts.accept(backup).then(
        (r) => {
          if (r === 'declined') {
            opener.postMessage({ type: 'bb-move-error', reason: 'declined' }, OLD_ORIGIN);
            return finish('declined');
          }
          opener.postMessage({ type: 'bb-move-done', ...r }, OLD_ORIGIN);
          finish('done');
        },
        () => {
          opener.postMessage({ type: 'bb-move-error', reason: 'failed' }, OLD_ORIGIN);
          finish('failed');
        },
      );
    });
    opener.postMessage({ type: 'bb-move-ready' }, OLD_ORIGIN);
  });
}
