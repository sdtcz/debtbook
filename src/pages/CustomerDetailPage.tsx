import { useEffect, useState } from 'preact/hooks';
import { StatusBadge, notifyChanged } from '../components/StatusBadge';
import {
  getCustomer,
  getCustomerBalance,
  getRecentEntryForUndo,
  getShop,
  softDeleteEntry,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { Customer, Entry, ShopProfile } from '../lib/types';
import {
  balanceLabel,
  balanceTone,
  formatNaira,
} from '../lib/money';
import { remindCustomer } from '../lib/sms';
import { buildStatement, shareOrCopyText } from '../lib/statement';
import { navigate } from '../lib/router';
import { isOverdue } from '../db/repo';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  id: string;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDue(ts: number): string {
  return new Date(ts).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function CustomerDetailPage({ id, toast }: Props) {
  const { t } = useLocale();
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [balanceKobo, setBalanceKobo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [canUndo, setCanUndo] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, bal, recent] = await Promise.all([
        getShop(),
        getCustomer(id),
        getCustomerBalance(id),
        getRecentEntryForUndo(id),
      ]);
      if (!c) {
        toast(t('customer.notFound'));
        navigate('/');
        return;
      }
      setShop(s || null);
      setCustomer(c);
      setEntries(bal.entries);
      setBalanceKobo(bal.balanceKobo);
      setCanUndo(Boolean(recent));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener('debtbook:changed', onChange);
    return () => window.removeEventListener('debtbook:changed', onChange);
  }, [id]);

  const onRemind = async () => {
    if (!customer || !shop) return;
    const result = await remindCustomer({
      shopName: shop.name,
      customerName: customer.name,
      phone: customer.phone,
      balanceKobo,
    });
    if (result === 'whatsapp') toast(t('customer.openingWhatsApp'));
    else if (result === 'sms') toast(t('customer.openingSms'));
    else if (result === 'share') toast(t('customer.shared'));
    else if (result === 'clipboard') toast(t('customer.messageCopied'));
    else toast(t('customer.couldNotRemind'));
  };

  const onStatement = async () => {
    if (!customer || !shop) return;
    const text = buildStatement(shop, customer, entries, balanceKobo);
    const result = await shareOrCopyText(
      text,
      t('statement.shareTitle', { name: customer.name }),
    );
    if (result === 'share') toast(t('customer.statementShared'));
    else if (result === 'clipboard') toast(t('customer.statementCopied'));
    else {
      window.prompt('Copy statement:', text);
    }
  };

  const removeEntry = async (entryId: string) => {
    if (!confirm(t('customer.deleteEntryConfirm'))) return;
    await softDeleteEntry(entryId);
    notifyChanged();
    toast(t('customer.entryDeleted'));
  };

  const undoLast = async () => {
    const recent = await getRecentEntryForUndo(id);
    if (!recent) {
      toast(t('customer.nothingToUndo'));
      return;
    }
    await softDeleteEntry(recent.id);
    notifyChanged();
    toast(t('customer.lastUndone'));
  };

  if (loading || !customer) {
    return (
      <div class="app-shell">
        <header class="topbar">
          <button class="icon-btn" type="button" onClick={() => navigate('/')}>
            ←
          </button>
          <h1>{t('common.customer')}</h1>
        </header>
        <main class="main">
          <div class="empty">{t('common.loading')}</div>
        </main>
      </div>
    );
  }

  const tone = balanceTone(balanceKobo);
  const overdue = isOverdue(customer, balanceKobo);

  return (
    <div class="app-shell">
      <header class="topbar">
        <button
          class="icon-btn"
          type="button"
          aria-label={t('common.back')}
          onClick={() => navigate('/')}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customer.name}
            {overdue && <span class="overdue-badge">{t('common.overdue')}</span>}
          </h1>
          <div class="sub">{customer.phone || t('common.noPhone')}</div>
        </div>
        <StatusBadge />
        <button
          class="icon-btn"
          type="button"
          aria-label={t('customer.edit')}
          onClick={() => navigate(`/customers/${id}/edit`)}
        >
          ✎
        </button>
      </header>

      <main class="main">
        <div class={`card balance-hero ${tone}`}>
          <div class={`amount`}>{formatNaira(Math.abs(balanceKobo))}</div>
          <div class="label">{balanceLabel(balanceKobo)}</div>
          {customer.dueAt && (
            <div class="hint" style={{ marginTop: 6 }}>
              {t('customer.due', { date: fmtDue(customer.dueAt) })}
              {overdue ? t('customer.overdueSuffix') : ''}
            </div>
          )}
          {tone === 'credit' && (
            <div class="hint" style={{ marginTop: 6 }}>
              {t('customer.overpaid')}
            </div>
          )}
        </div>

        <div class="actions-grid">
          <button
            class="btn btn-danger"
            type="button"
            onClick={() => navigate(`/customers/${id}/entry/credit`)}
          >
            {t('customer.creditSale')}
          </button>
          <button
            class="btn btn-primary"
            type="button"
            style={{ background: 'var(--ok)' }}
            onClick={() => navigate(`/customers/${id}/entry/payment`)}
          >
            {t('customer.payment')}
          </button>
        </div>

        <div class="btn-row">
          <button class="btn btn-secondary" type="button" onClick={onRemind}>
            {t('customer.remind')}
          </button>
          <button class="btn btn-ghost" type="button" onClick={onStatement}>
            {t('customer.statement')}
          </button>
        </div>

        {canUndo && (
          <div class="btn-row" style={{ marginTop: 8 }}>
            <button class="btn btn-ghost" type="button" onClick={undoLast}>
              {t('customer.undoLast')}
            </button>
          </div>
        )}

        {customer.note && (
          <p class="muted" style={{ marginTop: 12 }}>
            {t('customer.note', { note: customer.note })}
          </p>
        )}

        <div class="section-title">{t('customer.history')}</div>
        <div class="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {entries.length === 0 ? (
            <div class="empty" style={{ padding: 20 }}>
              {t('customer.noEntries')}
            </div>
          ) : (
            entries.map((e) => (
              <div class="entry-row" key={e.id}>
                <div class="left">
                  <div class={`type ${e.type}`}>
                    {e.type === 'credit'
                      ? t('customer.creditSaleLabel')
                      : t('customer.paymentLabel')}
                  </div>
                  <div class="when">{fmtWhen(e.occurredAt)}</div>
                  {e.note && <div class="note">{e.note}</div>}
                </div>
                <div>
                  <div class={`amt ${e.type}`}>
                    {e.type === 'credit' ? '+' : '−'}
                    {formatNaira(e.amountKobo)}
                  </div>
                  <button
                    type="button"
                    class="icon-btn"
                    style={{ color: 'var(--muted)', minHeight: 36, minWidth: 36 }}
                    aria-label={t('customer.deleteEntry')}
                    onClick={() => removeEntry(e.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
