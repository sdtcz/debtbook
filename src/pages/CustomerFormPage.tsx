import { useEffect, useState } from 'preact/hooks';
import { notifyChanged } from '../components/StatusBadge';
import { getCustomer, softDeleteCustomer, upsertCustomer } from '../db/repo';
import { navigate } from '../lib/router';

interface Props {
  id?: string;
  toast: (msg: string) => void;
}

export function CustomerFormPage({ id, toast }: Props) {
  const editing = Boolean(id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
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
      const c = await upsertCustomer({
        id,
        name,
        phone: phone || undefined,
        note: note || undefined,
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
    if (!confirm('Remove this customer? Their entries stay in the ledger history but the customer will be hidden.')) {
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
            <div class="hint">Used for SMS reminders</div>
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
