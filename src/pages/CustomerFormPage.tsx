import { useEffect, useState } from 'preact/hooks';
import { notifyChanged } from '../components/StatusBadge';
import { getCustomer, softDeleteCustomer, upsertCustomer } from '../db/repo';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  id?: string;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

function toDateInput(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateInput(v: string): number | null {
  if (!v.trim()) return null;
  const d = new Date(v + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

export function CustomerFormPage({ id, toast }: Props) {
  const editing = Boolean(id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getCustomer(id).then((c) => {
      if (!c) {
        toast('Customer not found');
        navigate('/');
        return;
      }
      setName(c.name);
      setPhone(c.phone || '');
      setNote(c.note || '');
      setDueDate(toDateInput(c.dueAt));
    });
  }, [id]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dueAt = fromDateInput(dueDate);
      const c = await upsertCustomer({
        id,
        name,
        phone: phone || undefined,
        note: note || undefined,
        dueAt: dueAt === null ? null : dueAt,
      });
      notifyChanged();
      toast(editing ? 'Customer updated' : 'Customer added');
      navigate(`/customers/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    if (
      !confirm(
        'Remove this customer? Their entries stay in the ledger history but the customer will be hidden.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await softDeleteCustomer(id);
      notifyChanged();
      toast('Customer removed');
      navigate('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="app-shell">
      <header class="topbar">
        <button
          class="icon-btn"
          type="button"
          aria-label="Back"
          onClick={() => (id ? navigate(`/customers/${id}`) : navigate('/'))}
        >
          ←
        </button>
        <h1>{editing ? 'Edit customer' : 'New customer'}</h1>
      </header>
      <main class="main">
        <form class="card" onSubmit={submit}>
          <div class="field">
            <label for="cname">Name *</label>
            <input
              id="cname"
              class="input"
              value={name}
              autofocus
              maxlength={80}
              placeholder="Customer name"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for="cphone">Phone (optional)</label>
            <input
              id="cphone"
              class="input"
              type="tel"
              inputMode="tel"
              value={phone}
              placeholder="e.g. 0803 123 4567"
              onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
            />
            <div class="hint">Used for WhatsApp / SMS reminders</div>
          </div>
          <div class="field">
            <label for="cdue">Due date (optional)</label>
            <input
              id="cdue"
              class="input"
              type="date"
              value={dueDate}
              onInput={(e) => setDueDate((e.target as HTMLInputElement).value)}
            />
            <div class="hint">
              Shows an Overdue badge on Home when balance &gt; 0 and past due
            </div>
          </div>
          <div class="field">
            <label for="cnote">Note (optional)</label>
            <textarea
              id="cnote"
              class="textarea"
              value={note}
              maxlength={200}
              placeholder="e.g. Buys rice weekly"
              onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            />
          </div>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>
          )}
          <button class="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
          </button>
          {editing && (
            <div class="btn-row">
              <button
                class="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={remove}
              >
                Remove
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
