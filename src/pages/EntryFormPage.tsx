import { BackButton } from '../components/BackButton';
import { useEffect, useRef, useState } from 'preact/hooks';
import { MoneyInput } from '../components/MoneyInput';
import { notifyChanged } from '../components/StatusBadge';
import {
  addEntry,
  getCustomer,
  getCustomerBalance,
  getShop,
  isOverdue,
  softDeleteEntry,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { Customer, Entry, EntryType } from '../lib/types';
import { buildEntryReceiptMessage, sendTextToCustomer } from '../lib/sms';
import { balanceLabel,
  balanceTone,
  formatMoney,
  parseAmount, currencySymbol } from '../lib/money';
import { goBack, navigate } from '../lib/router';
import {
  markPaidInviteShown,
  markPaidInviteSkipped,
  openPaidInviteWhatsApp,
  shouldShowPaidInvite,
} from '../lib/growth';
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
  /** After a credit sale: "Send receipt to {customer}" is the default next step. */
  const [receiptStep, setReceiptStep] = useState<{ entry: Entry; balanceKobo: number; shopName: string } | null>(null);
  // "Tell a shop" step: a payment just cleared this customer's balance.
  const [paidStep, setPaidStep] = useState<Entry | null>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);

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
    const kobo = parseAmount(amount);
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
              limit: formatMoney(customer.creditLimitKobo),
              wouldBe: formatMoney(wouldBe),
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
      if (type === 'credit') {
        const [bal, shop] = await Promise.all([getCustomerBalance(customerId), getShop()]);
        setReceiptStep({ entry, balanceKobo: bal.balanceKobo, shopName: shop?.name || '' });
        return;
      }
      const after = await getCustomerBalance(customerId);
      if (shouldShowPaidInvite({ beforeKobo: balanceKobo, afterKobo: after.balanceKobo })) {
        markPaidInviteShown();
        setPaidStep(entry);
        return;
      }
      finish(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('entry.couldNotSave'));
    } finally {
      setBusy(false);
    }
  };

  /** Leave the form with the usual "recorded · Undo" toast. */
  const finish = (entry: Entry, opener?: string) => {
    const label =
      entry.type === 'credit' ? t('entry.creditRecorded') : t('entry.paymentRecorded');
    toast(opener ? `${label} · ${opener}` : label, {
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
  };

  useEffect(() => {
    if (!receiptStep) return;
    sendRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(receiptStep.entry);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [receiptStep]);

  useEffect(() => {
    if (!paidStep) return;
    shareRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipPaidInvite();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paidStep]);

  const skipPaidInvite = () => {
    if (!paidStep) return;
    markPaidInviteSkipped();
    finish(paidStep);
  };

  const sharePaidInvite = () => {
    if (!paidStep) return;
    openPaidInviteWhatsApp();
    finish(paidStep, t('customer.openingWhatsApp'));
  };

  const sendReceipt = async () => {
    if (!receiptStep || !customer) return;
    const { entry, balanceKobo: bal, shopName } = receiptStep;
    const message = buildEntryReceiptMessage({
      shopName,
      customerName: customer.name,
      type: entry.type,
      amountKobo: entry.amountKobo,
      balanceKobo: bal,
      note: entry.note,
      at: entry.occurredAt,
    });
    const result = await sendTextToCustomer(customer.phone, message, t('receipt.shareTitle'));
    finish(
      entry,
      result === 'whatsapp'
        ? t('customer.openingWhatsApp')
        : result === 'sms'
          ? t('customer.openingSms')
          : result === 'clipboard'
            ? t('customer.messageCopied')
            : undefined,
    );
  };

  const typedKobo = parseAmount(amount);
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
              {currencySymbol()}
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
                <div class={`entry-tally-amount ${balanceTone(balanceKobo)}${customer && isOverdue(customer, balanceKobo) ? ' overdue' : ''}`}>
                  {formatMoney(Math.abs(balanceKobo))}
                </div>
                <div class="entry-tally-sub">{balanceLabel(balanceKobo)}</div>
              </div>
              <div class="entry-tally-arrow" aria-hidden="true">
                →
              </div>
              <div class="entry-tally-cell after" aria-live="polite">
                <div class="entry-tally-label">{t('entry.tallyAfter')}</div>
                <div class={`entry-tally-amount ${balanceTone(afterKobo)}${customer && isOverdue(customer, afterKobo) ? ' overdue' : ''}`}>
                  {formatMoney(Math.abs(afterKobo))}
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
      {paidStep && customer && (
        <div class="chase-sheet-overlay receipt-step-overlay" role="dialog" aria-modal="true" aria-labelledby="paid-step-title">
          <div class="chase-sheet receipt-step paid-step">
            <div class="receipt-step-check" aria-hidden="true">
              ✓
            </div>
            <h2 id="paid-step-title" class="receipt-step-title">
              {t('entry.paidStepTitle', { name: customer.name })}
            </h2>
            <p class="receipt-step-why">{t('entry.paidStepWhy')}</p>
            <button ref={shareRef} class="btn btn-whatsapp receipt-step-send" type="button" onClick={sharePaidInvite}>
              <span>{t('entry.paidStepShare')}</span>
            </button>
            <button class="btn btn-ghost receipt-step-skip" type="button" onClick={skipPaidInvite}>
              {t('entry.paidStepSkip')}
            </button>
          </div>
        </div>
      )}
      {receiptStep && customer && (
        <div class="chase-sheet-overlay receipt-step-overlay" role="dialog" aria-modal="true" aria-labelledby="receipt-step-title">
          <div class="chase-sheet receipt-step">
            <div class="receipt-step-check" aria-hidden="true">
              ✓
            </div>
            <h2 id="receipt-step-title" class="receipt-step-title">
              {t('entry.receiptStepTitle', { amount: formatMoney(receiptStep.entry.amountKobo), name: customer.name })}
            </h2>
            <p class="receipt-step-why">{t('entry.receiptStepWhy')}</p>
            <button ref={sendRef} class="btn btn-whatsapp receipt-step-send" type="button" onClick={sendReceipt}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" />
              </svg>
              <span>{t('entry.receiptSend', { name: customer.name })}</span>
            </button>
            <p class="receipt-step-via">
              {customer.phone ? t('entry.receiptVia', { phone: customer.phone }) : t('entry.receiptNoPhone')}
            </p>
            <button class="btn btn-ghost receipt-step-skip" type="button" onClick={() => finish(receiptStep.entry)}>
              {t('entry.receiptSkip')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
