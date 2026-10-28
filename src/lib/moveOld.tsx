/**
 * Old address (debtbook-neon.vercel.app) only. Lazy chunk: other hosts never load it.
 * See move.ts for the plan. Never deletes anything on this origin.
 */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { useLocale } from '../hooks/useLocale';
import { downloadJson, exportBackup } from './backup';
import { MOVED_KEY, NEW_ORIGIN, newAddress, sendBook } from './move';
import { guardExport } from './pinGuard';
import { getShop } from '../db/repo';

/** True when this origin holds a shop book (shop profile or any customer). */
export async function hasLocalBook(): Promise<boolean> {
  try {
    const db = await getDb();
    if (await db.get('shop', 'shop')) return true;
    return (await db.count('customers')) > 0;
  } catch {
    return true; // can't tell: stay, never risk hiding a book
  }
}

function moved(): boolean {
  try {
    return localStorage.getItem(MOVED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Decide before the app mounts. Returns true to start the app here (book on this phone),
 * false when the page is being sent to bashibook.app.
 */
export async function oldHostBoot(): Promise<boolean> {
  const go = moved() || !(await hasLocalBook());
  if (!go) return true;
  location.replace(newAddress(location));
  return false;
}

export function mountMoveCard(): void {
  if (window.top !== window) return; // inside the landing-page phone frame: the top page decides
  const host = document.createElement('div');
  host.id = 'move-root';
  document.body.appendChild(host);
  render(<MoveCard />, host);
}

type State = 'ask' | 'pill' | 'working' | 'done' | 'fallback';

function MoveCard() {
  const { t } = useLocale();
  const [state, setState] = useState<State>('ask');
  const [counts, setCounts] = useState({ customers: 0, entries: 0 });
  const [why, setWhy] = useState('');

  const move = () => {
    // Open the tab inside the click (popup blockers), THEN ask for the PIN.
    const win = window.open(`${NEW_ORIGIN}/?app=1#/move-in`, '_blank');
    if (!win) {
      setWhy(t('move.popupBlocked'));
      return setState('fallback');
    }
    setState('working');
    const backup = guardExport(getShop).then((ok) => (ok ? exportBackup() : null));
    void sendBook({
      win,
      backup,
      listen: (fn) => {
        const h = (e: MessageEvent) => fn(e);
        window.addEventListener('message', h);
        return () => window.removeEventListener('message', h);
      },
    }).then((r) => {
      if (r.ok) {
        try {
          localStorage.setItem(MOVED_KEY, '1');
        } catch {
          /* ignore */
        }
        setCounts({ customers: r.customers, entries: r.entries });
        return setState('done');
      }
      if (r.reason === 'cancelled') return setState('ask');
      setWhy(r.reason === 'declined' ? t('move.declined') : t('move.failed'));
      setState('fallback');
    });
  };

  const download = async () => {
    if (!(await guardExport(getShop))) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`bashibook-backup-${stamp}.json`, await exportBackup());
  };

  if (state === 'pill') {
    return (
      <button type="button" class="move-pill" onClick={() => setState('ask')}>
        {t('move.pill')}
      </button>
    );
  }
  return (
    <div class="move-overlay" role="dialog" aria-modal="true" aria-labelledby="move-title">
      <div class="move-card">
        <h2 id="move-title">{state === 'done' ? t('move.doneTitle') : t('move.title')}</h2>
        {state === 'ask' && (
          <>
            <p>{t('move.body')}</p>
            <p class="hint">{t('move.safe')}</p>
            <button type="button" class="btn btn-primary" onClick={move}>
              {t('move.cta')}
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setState('pill')}>
              {t('move.later')}
            </button>
          </>
        )}
        {state === 'working' && <p role="status">{t('move.working')}</p>}
        {state === 'done' && (
          <>
            <p>{t('move.done', counts)}</p>
            <a class="btn btn-primary" href={`${NEW_ORIGIN}/?app=1`}>
              {t('move.open')}
            </a>
          </>
        )}
        {state === 'fallback' && (
          <>
            <p role="alert">{why}</p>
            <p>{t('move.fallback')}</p>
            <button type="button" class="btn btn-primary" onClick={download}>
              {t('move.download')}
            </button>
            <a class="btn btn-secondary" href={`${NEW_ORIGIN}/?app=1`} target="_blank" rel="noopener">
              {t('move.open')}
            </a>
            <button type="button" class="btn btn-ghost" onClick={() => setState('ask')}>
              {t('move.tryAgain')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
