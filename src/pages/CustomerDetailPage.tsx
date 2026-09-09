import { useEffect, useState } from 'preact/hooks';
import { StatusBadge, notifyChanged } from '../components/StatusBadge';
import {
  getCustomer,
  getCustomerBalance,
  getRecentEntryForUndo,
  getShop,
  softDeleteEntry,
} from '../db/repo';
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
        toast('Customer not found');
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
    if (result === 'whatsapp') toast('Opening WhatsApp…');
    else if (result === 'sms') toast('Opening SMS…');
    else if (result === 'share') toast('Shared');
    else if (result === 'clipboard') toast('Message copied');
    else toast('Could not open WhatsApp, share, or SMS');
  };

  const onStatement = async () => {
    if (!customer || !shop) return;
    const text = buildStatement(shop, customer, entries, balanceKobo);
    const result = await shareOrCopyText(text, `${customer.name} statement`);
    if (result === 'share') toast('Statement shared');
    else if (result === 'clipboard') toast('Statement copied');
    else {
      window.prompt('Copy statement:', text);
    }
  };

  const removeEntry = async (entryId: string) => {
    if (!confirm('Delete this entry?')) return;
    await softDeleteEntry(entryId);
    notifyChanged();
    toast('Entry deleted');
  };

  const undoLast = async () => {
    const recent = await getRecentEntryForUndo(id);
    if (!recent) {
      toast('Nothing to undo (only last 10 minutes)');
      return;
    }
    await softDeleteEntry(recent.id);
    notifyChanged();
    toast('Last entry undone');
  };

  if (loading || !customer) {
    return (
      <div class="app-shell">
        <header class="topbar">
          <button class="icon-btn" type="button" onClick={() => navigate('/')}>
            ←
          </button>
          <h1>Customer</h1>
        </header>
        <main class="main">
          <div class="empty">Loading…</div>
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
          aria-label="Back"
          onClick={() => navigate('/')}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customer.name}
            {overdue && <span class="overdue-badge">Overdue</span>}
          </h1>
          <div class="sub">{customer.phone || 'No phone'}</div>
        </div>
        <StatusBadge />
        <button
          class="icon-btn"
          type="button"
          aria-label="Edit"
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
              Due {fmtDue(customer.dueAt)}
              {overdue ? ' · overdue' : ''}
            </div>
          )}
          {tone === 'credit' && (
            <div class="hint" style={{ marginTop: 6 }}>
              Overpaid — shop owes this customer
            </div>
          )}
        </div>

        <div class="actions-grid">
          <button
            class="btn btn-danger"
            type="button"
            onClick={() => navigate(`/customers/${id}/entry/credit`)}
          >
            + Credit sale
          </button>
          <button
            class="btn btn-primary"
            type="button"
            style={{ background: 'var(--ok)' }}
            onClick={() => navigate(`/customers/${id}/entry/payment`)}
          >
            − Payment
          </button>
        </div>

        <div class="btn-row">
          <button class="btn btn-secondary" type="button" onClick={onRemind}>
            Remind
          </button>
          <button class="btn btn-ghost" type="button" onClick={onStatement}>
            Statement
          </button>
        </div>

        {canUndo && (
          <div class="btn-row" style={{ marginTop: 8 }}>
            <button class="btn btn-ghost" type="button" onClick={undoLast}>
              Undo last entry
            </button>
          </div>
        )}

        {customer.note && (
          <p class="muted" style={{ marginTop: 12 }}>
            Note: {customer.note}
          </p>
        )}

        <div class="section-title">History</div>
        <div class="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {entries.length === 0 ? (
            <div class="empty" style={{ padding: 20 }}>
              No entries yet. Record a credit sale or payment.
            </div>
          ) : (
            entries.map((e) => (
              <div class="entry-row" key={e.id}>
                <div class="left">
                  <div class={`type ${e.type}`}>
                    {e.type === 'credit' ? 'Credit sale' : 'Payment'}
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
                    aria-label="Delete entry"
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
