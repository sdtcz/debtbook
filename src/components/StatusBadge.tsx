import { useEffect, useState } from 'preact/hooks';
import { countPendingOutbox } from '../db/outbox';
import { useLocale } from '../hooks/useLocale';
import { useOnline } from '../hooks/useOnline';

export function StatusBadge() {
  const online = useOnline();
  const { t } = useLocale();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const n = await countPendingOutbox();
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

  if (!online) {
    return (
      <span class="badge offline" title={t('status.offlineTitle')}>
        {t('status.offline')}
        {pending > 0 ? ` · ${t('status.pending', { n: pending })}` : ''}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span class="badge pending" title={t('status.pendingTitle')}>
        {t('status.pendingSync', { n: pending })}
      </span>
    );
  }
  return null;
}

export function notifyChanged() {
  window.dispatchEvent(new Event('debtbook:changed'));
}
