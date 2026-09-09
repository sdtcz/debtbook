import { useEffect, useState } from 'preact/hooks';
import { countPendingOutbox } from '../db/outbox';
import { useOnline } from '../hooks/useOnline';

export function StatusBadge() {
  const online = useOnline();
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
      <span class="badge offline" title="You are offline — data stays on this phone">
        Offline
        {pending > 0 ? ` · ${pending} pending` : ''}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span class="badge pending" title="Changes queued for sync when a backend is connected">
        {pending} pending sync
      </span>
    );
  }
  return null;
}

export function notifyChanged() {
  window.dispatchEvent(new Event('debtbook:changed'));
}
