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
  const [pro, setPro] = useState(false);
  const [entLabel, setEntLabel] = useState('Free');
  const fileRef = useRef<HTMLInputElement>(null);
  const online = useOnline();

  const refresh = async () => {
    const s = await getShop();
    if (s) {
      setName(s.name);
      setHasPin(Boolean(s.pinHash && s.pinSalt));
      setPro(isPro(s));
      const e = getEntitlement(s);
      setEntLabel(
        e.plan === 'pro'
          ? `Pro${e.source ? ` (${e.source})` : ''}`
          : 'Free',
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
    notifyChanged();
    onPinChanged?.();
    await refresh();
    toast('PIN lock enabled');
  };

  const removePin = async () => {
    if (!confirm('Remove PIN lock?')) return;
    await clearPin();
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
        {pro && <span class="pro-badge">Pro</span>}
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
            DebtBook Pro
          </div>
          <p class="muted" style={{ marginTop: 0 }}>
            Plan: <strong>{entLabel}</strong>
          </p>
          <button
            class="btn btn-secondary"
            type="button"
            onClick={() => navigate('/settings/pro')}
          >
            Open Pro page
          </button>
          <div class="btn-row">
            <button class="btn btn-ghost" type="button" onClick={doCsv}>
              Export CSV {pro ? '' : '(Pro)'}
            </button>
          </div>
        </div>

        <div class="card">
          <div class="section-title" style={{ marginTop: 0 }}>
            PIN lock
          </div>
          <p class="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Optional 4-digit PIN. When you leave the app and come back, totals
            stay hidden until unlocked.
          </p>
          {hasPin ? (
            <button class="btn btn-danger" type="button" onClick={removePin}>
              Remove PIN
            </button>
          ) : (
            <>
              <div class="field">
                <label for="pin">New PIN (4 digits)</label>
                <input
                  id="pin"
                  class="input"
                  inputMode="numeric"
                  maxlength={4}
                  value={pinInput}
                  placeholder="••••"
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
                    setPinInput(v);
                  }}
                />
              </div>
              <button class="btn btn-secondary" type="button" onClick={savePin}>
                Enable PIN
              </button>
            </>
          )}
        </div>

        <div class="card">
          <div class="section-title" style={{ marginTop: 0 }}>
            Local backup
          </div>
          <p class="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Free: download or restore a JSON backup of shop, customers, and
            entries on this device.
          </p>
          <button class="btn btn-secondary" type="button" onClick={doExport}>
            Export JSON
          </button>
          <div class="btn-row">
            <button
              class="btn btn-ghost"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              Import JSON
            </button>
          </div>
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
            DebtBook v2 — Nigeria · English · ₦ Naira
            <br />
            Offline-first PWA for shopkeeper book debt (udhar).
            <br />
            Free: ledger, WhatsApp remind, statement, backup, PIN.
            <br />
            Pro: CSV export.
          </p>
        </div>
      </main>
    </div>
  );
}
