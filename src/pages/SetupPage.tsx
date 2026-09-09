import { useState } from 'preact/hooks';
import { saveShop } from '../db/repo';
import { notifyChanged } from '../components/StatusBadge';
import { navigate } from '../lib/router';

interface Props {
  onDone: () => void;
}

export function SetupPage({ onDone }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter your shop name');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveShop(trimmed);
      notifyChanged();
      onDone();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="setup-screen">
      <h1>DebtBook</h1>
      <p>
        Your offline credit ledger for book debt (udhar). Data stays on this
        phone — works without internet.
      </p>
      <form onSubmit={submit}>
        <div class="field">
          <label for="shop-name">Shop name</label>
          <input
            id="shop-name"
            class="input"
            placeholder="e.g. Mama Ngozi Provision"
            value={name}
            autofocus
            maxlength={80}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          {error && (
            <div class="hint" style={{ color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </div>
        <button class="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Start keeping books'}
        </button>
      </form>
    </div>
  );
}
