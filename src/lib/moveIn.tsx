/**
 * bashibook.app/?app=1#/move-in — receives a book from the old address (see move.ts).
 * Rendered INSTEAD of the app; reloads into the app when done.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { useLocale } from '../hooks/useLocale';
import { t as tNow } from '../i18n';
import { importBackup, isBackupPayload } from './backup';
import { receiveBook } from './move';
import type { BackupPayload } from './types';

async function bookHere(): Promise<boolean> {
  const db = await getDb();
  return (await db.count('customers')) > 0 || (await db.count('entries')) > 0;
}

/** Import, asking first if this address already has a book (import replaces it). */
export async function acceptBook(
  backup: BackupPayload,
  confirmReplace: () => boolean,
): Promise<{ customers: number; entries: number } | 'declined'> {
  if ((await bookHere()) && !confirmReplace()) return 'declined';
  const r = await importBackup(backup);
  return { customers: r.customers, entries: r.entries };
}

export function mountMoveIn(root: HTMLElement): void {
  document.getElementById('boot')?.remove();
  render(<MoveIn />, root);
}

function MoveIn() {
  const { t } = useLocale();
  const [state, setState] = useState<string>('waiting');
  useEffect(() => {
    void receiveBook({
      opener: window.opener as Window | null,
      isBackup: isBackupPayload,
      accept: (b) => acceptBook(b, () => confirm(tNow('move.replaceConfirm'))),
      listen: (fn) => {
        const h = (e: MessageEvent) => fn(e);
        window.addEventListener('message', h);
        return () => window.removeEventListener('message', h);
      },
    }).then((r) => {
      if (r === 'done') {
        // Only the hash changes, so reload explicitly to start the app with the book.
        history.replaceState(null, '', '/?app=1#/');
        location.reload();
        return;
      }
      setState(r);
    });
  }, []);
  const msg =
    state === 'waiting'
      ? t('move.inWaiting')
      : state === 'declined'
        ? t('move.inDeclined')
        : state === 'no-opener'
          ? t('move.inNoOpener')
          : state === 'cancelled'
            ? t('move.inCancelled')
            : t('move.inFailed');
  return (
    <main class="setup-screen move-in">
      <h1>{t('move.title')}</h1>
      <p role="status">{msg}</p>
      {state !== 'waiting' && (
        <a
          class="btn btn-primary"
          href="/?app=1#/"
          onClick={(e) => {
            e.preventDefault();
            history.replaceState(null, '', '/?app=1#/');
            location.reload();
          }}
        >
          {t('move.openHere')}
        </a>
      )}
    </main>
  );
}
