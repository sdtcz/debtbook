import { useEffect, useRef, useState } from 'preact/hooks';
import { notifyChanged, StatusBadge } from '../components/StatusBadge';
import { countPendingOutbox, flushOutboxStub, listPendingOutbox } from '../db/outbox';
import {
  clearPin,
  getDashboardBalances,
  getShop,
  listEntriesForCustomer,
  saveShop,
  setPin,
} from '../db/repo';
import { useOnline } from '../hooks/useOnline';
import { downloadJson, exportBackup, importBackup, readJsonFile } from '../lib/backup';
import { buildCsvExport, downloadCsv } from '../lib/csv';
import { getEntitlement, isPro } from '../lib/entitlement';
import { hashPin, isValidPin, randomSalt } from '../lib/pin';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
  onPinChanged?: () => void;
}

export function SettingsPage({ toast, onPinChanged }: Props) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pro, setPro] = useState(false);
  const [entLabel, setEntLabel] = useState('Free');
  const [expLabel, setExpLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const online = useOnline();

  const refresh = async () => {
    const s = await getShop();
    if (s) {
      setName(s.name);
      setHasPin(Boolean(s.pinHash && s.pinSalt));
      setPro(isPro(s));
      const e = getEntitlement(s);
      setEntLabel(e.plan === 'pro' ? 'Pro' : 'Free');
      setExpLabel(
        e.plan === 'pro' && e.exp
          ? `Until ${new Date(e.exp).toLocaleDateString('en-NG')}`
          : e.plan === 'pro' && e.source
            ? String(e.source)
            : 'Ledger + backup + PIN',
      );
    }
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
    const n = await flushOutboxStub();
    notifyChanged();
    setPending(await countPendingOutbox());
    toast(`Marked ${n} mutation(s) synced (stub)`);
  };

  const savePin = async () => {
    if (!isValidPin(pinInput)) {
      toast('PIN must be 4 digits');
      return;
    }
    const salt = randomSalt();
    const hash = await hashPin(salt, pinInput);
    await setPin(hash, salt);
    setPinInput('');
    setShowPinForm(false);
    notifyChanged();
    onPinChanged?.();
    await refresh();
    toast('PIN lock enabled');
  };

  const removePin = async () => {
    if (!confirm('Remove PIN lock?')) return;
    await clearPin();
    setShowPinForm(false);
    onPinChanged?.();
    await refresh();
    toast('PIN removed');
  };

  const doExport = async () => {
    const data = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`debtbook-backup-${stamp}.json`, data);
    toast('Backup downloaded');
  };

  const doImport = async (file: File) => {
    if (
      !confirm(
        'Import will replace all local shop, customers, and entries. Continue?',
      )
    ) {
      return;
    }
    try {
      const data = await readJsonFile(file);
      const result = await importBackup(data);
      notifyChanged();
      await refresh();
      toast(`Imported ${result.customers} customers, ${result.entries} entries`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const doCsv = async () => {
    if (!pro) {
      toast('CSV export is a Pro feature', {
        ms: 5000,
        action: {
          label: 'Upgrade',
          onClick: () => navigate('/settings/pro'),
        },
      });
      return;
    }
    const dash = await getDashboardBalances();
    const map = new Map<string, Awaited<ReturnType<typeof listEntriesForCustomer>>>();
    for (const row of dash.customers) {
      map.set(row.customer.id, await listEntriesForCustomer(row.customer.id));
    }
    const csv = buildCsvExport(dash.customers, map);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`debtbook-export-${stamp}.csv`, csv);
    toast('CSV downloaded');
  };

  const initial = name.trim().charAt(0).toUpperCase() || 'D';

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
      <main class="main settings-main">
        <section class="settings-hero card">
          <div class="settings-avatar" aria-hidden="true">
            {initial}
          </div>
          <div class="settings-hero-text">
            <div class="settings-hero-name">{name.trim() || 'Your shop'}</div>
            <div class="settings-hero-meta">
              <span class={pro ? 'plan-pill plan-pill-pro' : 'plan-pill'}>
                {entLabel}
              </span>
              <span class="muted">{expLabel}</span>
            </div>
          </div>
        </section>

        <div class="settings-group-label">Shop</div>
        <form class="settings-group card" onSubmit={save}>
          <div class="field" style={{ marginBottom: 0 }}>
            <label for="shop">Shop name</label>
            <input
              id="shop"
              class="input"
              value={name}
              maxlength={80}
              autocomplete="organization"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <button class="btn btn-primary" type="submit" disabled={busy}>
            Save shop name
          </button>
        </form>

        <div class="settings-group-label">Plan &amp; export</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => navigate('/settings/pro')}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ★
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">DebtBook Pro</span>
              <span class="settings-row-sub">
                {pro ? 'Manage plan · CSV unlocked' : 'CSV export · hide upgrade nag'}
              </span>
            </span>
            <span class="settings-row-trail">
              {pro ? 'Pro' : 'Free'}
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <button type="button" class="settings-row" onClick={doCsv}>
            <span class="settings-row-icon" aria-hidden="true">
              ⬇
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">Export CSV</span>
              <span class="settings-row-sub">
                {pro ? 'Customers, balances & entries' : 'Pro feature'}
              </span>
            </span>
            <span class="settings-row-trail">
              {pro ? '' : 'Pro'}
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
        </div>

        <div class="settings-group-label">Security</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => {
              if (hasPin) {
                removePin();
              } else {
                setShowPinForm((v) => !v);
              }
            }}
          >
            <span class="settings-row-icon" aria-hidden="true">
              🔒
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">PIN lock</span>
              <span class="settings-row-sub">
                {hasPin
                  ? 'On · tap to remove'
                  : 'Hide totals when you leave the app'}
              </span>
            </span>
            <span class="settings-row-trail">
              <span class={hasPin ? 'status-dot on' : 'status-dot'} />
              {hasPin ? 'On' : 'Off'}
            </span>
          </button>
          {showPinForm && !hasPin && (
            <div class="settings-row-panel">
              <div class="field">
                <label for="pin">New PIN (4 digits)</label>
                <input
                  id="pin"
                  class="input"
                  inputMode="numeric"
                  maxlength={4}
                  value={pinInput}
                  placeholder="••••"
                  autocomplete="off"
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value
                      .replace(/\D/g, '')
                      .slice(0, 4);
                    setPinInput(v);
                  }}
                />
              </div>
              <div class="btn-row" style={{ marginTop: 0 }}>
                <button class="btn btn-secondary" type="button" onClick={savePin}>
                  Enable PIN
                </button>
                <button
                  class="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setShowPinForm(false);
                    setPinInput('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div class="settings-group-label">Backup</div>
        <div class="settings-group card settings-list">
          <button type="button" class="settings-row" onClick={doExport}>
            <span class="settings-row-icon" aria-hidden="true">
              💾
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">Export backup</span>
              <span class="settings-row-sub">JSON file for this phone</span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <button
            type="button"
            class="settings-row"
            onClick={() => fileRef.current?.click()}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ↩
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">Restore backup</span>
              <span class="settings-row-sub">Replaces all local data</span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            class="sr-only"
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) doImport(f);
              (e.target as HTMLInputElement).value = '';
            }}
          />
        </div>

        <div class="settings-group-label">More</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ⚙
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">Sync &amp; advanced</span>
              <span class="settings-row-sub">
                {online ? 'Online' : 'Offline'} · {pending} pending
              </span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                {showAdvanced ? '˅' : '›'}
              </span>
            </span>
          </button>
          {showAdvanced && (
            <div class="settings-row-panel">
              <p class="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                Data stays on this device. Outbox is ready for future cloud sync —
                Flush only marks the stub queue as synced.
              </p>
              <button class="btn btn-secondary" type="button" onClick={flush}>
                Flush outbox (stub)
              </button>
            </div>
          )}
        </div>

        <p class="settings-about muted">
          DebtBook · Nigeria · English · ₦
          <br />
          Offline ledger for shopkeeper book debt (udhar)
        </p>
      </main>
    </div>
  );
}
