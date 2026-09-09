import { useEffect, useState } from 'preact/hooks';
import { MoneyInput } from '../components/MoneyInput';
import { notifyChanged } from '../components/StatusBadge';
import { addEntry, getCustomer, softDeleteEntry } from '../db/repo';
import type { EntryType } from '../lib/types';
import { parseNairaToKobo } from '../lib/money';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  customerId: string;
  initialType?: EntryType;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

export function EntryFormPage({ customerId, initialType, toast }: Props) {
  const [type, setType] = useState<EntryType>(initialType || 'credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCustomer(customerId).then((c) => {
      if (!c) {
        toast('Customer not found');
        navigate('/');
        return;
      }
      setCustomerName(c.name);
    });
  }, [customerId]);

  useEffect(() => {
    if (initialType) setType(initialType);
  }, [initialType]);

  const submit = async (e: Event) => {
    e.preventDefault();
    const kobo = parseNairaToKobo(amount);
    if (kobo === null || kobo <= 0) {
      setError('Enter a valid amount greater than zero');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = await addEntry({
        customerId,
        type,
        amountKobo: kobo,
        note: note || undefined,
      });
      notifyChanged();
      const label = type === 'credit' ? 'Credit sale recorded' : 'Payment recorded';
      toast(label, {
        ms: 10000,
        action: {
          label: 'Undo',
          onClick: async () => {
            await softDeleteEntry(entry.id);
            notifyChanged();
            toast('Entry undone');
          },
        },
      });
      navigate(`/customers/${customerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
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
          onClick={() => navigate(`/customers/${customerId}`)}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1>{type === 'credit' ? 'Credit sale' : 'Payment'}</h1>
          <div class="sub">{customerName}</div>
        </div>
      </header>
      <main class="main">
        <form class="card" onSubmit={submit}>
          <div class="seg" role="group" aria-label="Entry type">
            <button
              type="button"
              class={type === 'credit' ? 'active credit' : ''}
              onClick={() => setType('credit')}
            >
              Credit sale
            </button>
            <button
              type="button"
              class={type === 'payment' ? 'active payment' : ''}
              onClick={() => setType('payment')}
            >
              Payment
            </button>
          </div>

          <MoneyInput
            id="amount"
            label="Amount"
            value={amount}
            onInput={setAmount}
            autoFocus
          />

          <div class="field">
            <label for="enote">Note (optional)</label>
            <input
              id="enote"
              class="input"
              value={note}
              maxlength={120}
              placeholder="e.g. 2 bags of rice"
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>
          )}

          <button
            class={`btn ${type === 'credit' ? 'btn-danger' : 'btn-primary'}`}
            type="submit"
            disabled={busy}
            style={type === 'payment' ? { background: 'var(--ok)' } : undefined}
          >
            {busy
              ? 'Saving…'
              : type === 'credit'
                ? 'Save credit sale'
                : 'Save payment'}
          </button>
        </form>
      </main>
    </div>
  );
}
