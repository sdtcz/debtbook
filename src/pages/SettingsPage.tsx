import { useEffect, useState } from 'preact/hooks';
import { notifyChanged, StatusBadge } from '../components/StatusBadge';
import { countPendingOutbox, flushOutboxStub, listPendingOutbox } from '../db/outbox';
import { getShop, saveShop } from '../db/repo';
import { useOnline } from '../hooks/useOnline';
import { navigate } from '../lib/router';

interface Props {
  toast: (msg: string) => void;
}

export function SettingsPage({ toast }: Props) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  const refresh = async () => {
    const s = await getShop();
    if (s) setName(s.name);
    setPending(await countPendingOutbox());
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Shop name required');
      return;
    }
    setBusy(true);
    try {
      await saveShop(name);
      notifyChanged();
      toast('Shop updated');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const flush = async () => {
    const items = await listPendingOutbox();
    if (items.length === 0) {
      toast('Nothing pending');
      return;
    }
    // Stub — no real backend
    const n = await flushOutboxStub();
    notifyChanged();
    setPending(await countPendingOutbox());
    toast(`Marked ${n} mutation(s) synced (stub)`);
  };

  return (
    <div class="app-shell">
      <header class="topbar">
        <button
          class="icon-btn"
          type="button"
          aria-label="Back"
          onClick={() => navigate('/')}
        >
          ←
        </button>
        <h1>Settings</h1>
        <StatusBadge />
      </header>
      <main class="main">
        <form class="card" onSubmit={save}>
          <div class="field">
            <label for="shop">Shop name</label>
            <input
              id="shop"
              class="input"
              value={name}
              maxlength={80}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <button class="btn btn-primary" type="submit" disabled={busy}>
            Save
          </button>
        </form>

        <div class="card">
          <div class="section-title" style={{ marginTop: 0 }}>
            Sync outbox
          </div>
          <p class="muted" style={{ marginTop: 0 }}>
            Network: <strong>{online ? 'Online' : 'Offline'}</strong>
            <br />
            Pending mutations: <strong>{pending}</strong>
          </p>
          <p class="muted" style={{ fontSize: '0.85rem' }}>
            IndexedDB is the source of truth. Mutations are queued with ids and
            client timestamps (LWW-ready). There is no backend yet — Flush only
            marks the stub queue as synced.
          </p>
          <button class="btn btn-secondary" type="button" onClick={flush}>
            Flush outbox (stub)
          </button>
        </div>

        <div class="card">
          <div class="section-title" style={{ marginTop: 0 }}>
            About
          </div>
          <p class="muted" style={{ marginTop: 0, marginBottom: 0 }}>
            DebtBook MVP — Nigeria · English · ₦ Naira
            <br />
            Offline-first PWA for shopkeeper book debt (udhar).
          </p>
        </div>
      </main>
    </div>
  );
}
