import { useEffect, useState } from 'preact/hooks';
import { MoneyInput } from '../components/MoneyInput';
import { notifyChanged } from '../components/StatusBadge';
import { addEntry, getCustomer, softDeleteEntry } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
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
  const { t } = useLocale();
  const [type, setType] = useState<EntryType>(initialType || 'credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCustomer(customerId).then((c) => {
      if (!c) {
        toast(t('customer.notFound'));
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
      setError(t('entry.validAmount'));
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
      const label =
        type === 'credit' ? t('entry.creditRecorded') : t('entry.paymentRecorded');
      toast(label, {
        ms: 10000,
        action: {
          label: t('common.undo'),
          onClick: async () => {
            await softDeleteEntry(entry.id);
            notifyChanged();
            toast(t('entry.undone'));
          },
        },
      });
      navigate(`/customers/${customerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('entry.couldNotSave'));
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
          aria-label={t('common.back')}
          onClick={() => navigate(`/customers/${customerId}`)}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1>
            {type === 'credit' ? t('entry.creditSale') : t('entry.payment')}
          </h1>
          <div class="sub">{customerName}</div>
        </div>
      </header>
      <main class="main">
        <form class="card" onSubmit={submit}>
          <div class="seg" role="group" aria-label={t('entry.type')}>
            <button
              type="button"
              class={type === 'credit' ? 'active credit' : ''}
              onClick={() => setType('credit')}
            >
              {t('entry.creditSale')}
            </button>
            <button
              type="button"
              class={type === 'payment' ? 'active payment' : ''}
              onClick={() => setType('payment')}
            >
              {t('entry.payment')}
            </button>
          </div>

          <MoneyInput
            id="amount"
            label={t('entry.amount')}
            value={amount}
            onInput={setAmount}
            autoFocus
          />

          <div class="field">
            <label for="enote">{t('entry.note')}</label>
            <input
              id="enote"
              class="input"
              value={note}
              maxlength={120}
              placeholder={t('entry.notePlaceholder')}
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
              ? t('common.saving')
              : type === 'credit'
                ? t('entry.saveCredit')
                : t('entry.savePayment')}
          </button>
        </form>
      </main>
    </div>
  );
}
