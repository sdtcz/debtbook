import { useEffect, useState } from 'preact/hooks';
import { countPendingOutbox } from '../db/outbox';
import { getShop } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { useOnline } from '../hooks/useOnline';

export type BadgeKind = 'offline' | 'pending' | null;

/** Which status badge to show. A pending count of 0 (or anything not a positive number) never shows a counter. */
export function statusBadge(online: boolean, pending: number): { kind: BadgeKind; pending: number } {
  const n = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
  if (!online) return { kind: 'offline', pending: n };
  return { kind: n > 0 ? 'pending' : null, pending: n };
}

export function StatusBadge() {
  const online = useOnline();
  const { t } = useLocale();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        // Only cloud-backup users have anything to sync; for everyone else the
        // book is simply saved on this phone, so don't show a scary counter.
        const shop = await getShop();
        const syncing = Boolean(shop?.cloudBackupEnabled && shop?.cloudBackupId);
        const n = syncing ? await countPendingOutbox() : 0;
        if (alive) setPending(n);
      } catch {
        /* db not ready */
      }
    };
    refresh();
    const id = window.setInterval(refresh, 2000);
    window.addEventListener('debtbook:changed', refresh);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('debtbook:changed', refresh);
    };
  }, []);

  const b = statusBadge(online, pending);
  if (b.kind === 'offline') {
    return (
      <span class="badge offline" title={t('status.offlineTitle')}>
        {t('status.offline')}
        {b.pending > 0 ? ` · ${t('status.pending', { n: b.pending })}` : ''}
      </span>
    );
  }
  if (b.kind === 'pending') {
    return (
      <span class="badge pending" title={t('status.pendingTitle')}>
        {t('status.pendingSync', { n: b.pending })}
      </span>
    );
  }
  return null;
}

export function notifyChanged() {
  window.dispatchEvent(new Event('debtbook:changed'));
}
