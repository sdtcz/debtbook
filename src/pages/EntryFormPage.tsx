import { BackButton } from '../components/BackButton';
import { useEffect, useState } from 'preact/hooks';
import { MoneyInput } from '../components/MoneyInput';
import { notifyChanged } from '../components/StatusBadge';
import {
  addEntry,
  getCustomer,
  getCustomerBalance,
  softDeleteEntry,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { Customer, EntryType } from '../lib/types';
import {
  balanceLabel,
  balanceTone,
  formatNaira,
  parseNairaToKobo,
} from '../lib/money';
import { goBack, navigate } from '../lib/router';
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
  const [customer, setCustomer] = useState<Customer | null>(null);
  // Soft Tally crest: current balance (null until loaded)
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCustomer(customerId).then((c) => {
      if (!c) {
        toast(t('customer.notFound'));
        navigate('/', { replace: true });
        return;
      }
      setCustomerName(c.name);
      setCustomer(c);
    });
    getCustomerBalance(customerId)
      .then((b) => setBalanceKobo(b.balanceKobo))
      .catch(() => setBalanceKobo(null));
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
      if (type === 'credit' && customer?.creditLimitKobo) {
        const bal = await getCustomerBalance(customerId);
        const wouldBe = bal.balanceKobo + kobo;
        if (wouldBe > customer.creditLimitKobo) {
          const ok = confirm(
            t('entry.creditLimitWarn', {
              limit: formatNaira(customer.creditLimitKobo),
              wouldBe: formatNaira(wouldBe),
            }),
          );
          if (!ok) {
            setBusy(false);
            return;
          }
        }
      }
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
      goBack(`/customers/${customerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('entry.couldNotSave'));
    } finally {
      setBusy(false);
    }
  };

  const typedKobo = parseNairaToKobo(amount);
  const deltaKobo =
    typedKobo !== null && typedKobo > 0
      ? type === 'credit'
        ? typedKobo
        : -typedKobo
      : 0;
  const afterKobo = balanceKobo === null ? null : balanceKobo + deltaKobo;

  return (
    <div class="app-shell">
      <header class="topbar">
        <BackButton fallback={`/customers/${customerId}`} />
        <div style={{ flex: 1 }}>
          <h1>
            {type === 'credit' ? t('entry.creditSale') : t('entry.payment')}
          </h1>
          <div class="sub">{customerName}</div>
        </div>
      </header>
      <main class="main entry-soft">
        <section
          class={`entry-soft-hero ${type === 'credit' ? 'credit' : 'payment'}`}
          aria-label={
            type === 'credit' ? t('entry.creditSale') : t('entry.payment')
          }
        >
          <div class="entry-soft-hero-row">
            <div class="entry-soft-avatar" aria-hidden="true">
              ₦
            </div>
            <div class="entry-soft-hero-text">
              <div class="entry-soft-kicker">{t('entry.kicker')}</div>
              <div class="entry-soft-hero-name">
                {type === 'credit' ? t('entry.creditSale') : t('entry.payment')}
              </div>
              <p class="entry-soft-hero-tip">
                {type === 'credit' ? t('entry.creditTip') : t('entry.paymentTip')}
              </p>
            </div>
          </div>
          {balanceKobo !== null && afterKobo !== null && (
            <div class="entry-tally" role="group" aria-label={t('entry.tallyAria')}>
              <div class="entry-tally-cell">
                <div class="entry-tally-label">{t('entry.tallyNow')}</div>
                <div class={`entry-tally-amount ${balanceTone(balanceKobo)}`}>
                  {formatNaira(Math.abs(balanceKobo))}
                </div>
                <div class="entry-tally-sub">{balanceLabel(balanceKobo)}</div>
              </div>
              <div class="entry-tally-arrow" aria-hidden="true">
                →
              </div>
              <div class="entry-tally-cell after" aria-live="polite">
                <div class="entry-tally-label">{t('entry.tallyAfter')}</div>
                <div class={`entry-tally-amount ${balanceTone(afterKobo)}`}>
                  {formatNaira(Math.abs(afterKobo))}
                </div>
                <div class="entry-tally-sub">{balanceLabel(afterKobo)}</div>
              </div>
            </div>
          )}
        </section>
        <form class="card entry-soft-form" onSubmit={submit}>
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
            class={`btn entry-soft-save ${type === 'credit' ? 'btn-danger' : 'btn-ok'}`}
            type="submit"
            disabled={busy}
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
