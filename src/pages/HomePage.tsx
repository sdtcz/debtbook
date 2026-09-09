import { useEffect, useState } from 'preact/hooks';
import { StatusBadge } from '../components/StatusBadge';
import {
  getDashboardBalances,
  getShop,
  isOverdue,
  searchCustomers,
} from '../db/repo';
import { isPro } from '../lib/entitlement';
import type { CustomerBalance, ShopProfile } from '../lib/types';
import { balanceLabel, balanceTone, formatNaira } from '../lib/money';
import { href, navigate } from '../lib/router';

interface Props {
  locked?: boolean;
}

export function HomePage({ locked }: Props) {
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const s = await getShop();
      setShop(s || null);
      const dash = await getDashboardBalances();
      setRows(dash.customers);
      setTotal(dash.totalOutstandingKobo);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener('debtbook:changed', onChange);
    return () => window.removeEventListener('debtbook:changed', onChange);
  }, []);

  const filtered = searchCustomers(rows, query);
  const pro = isPro(shop);

  return (
    <div class="app-shell">
      <header class="topbar">
        <div style={{ flex: 1 }}>
          <h1>
            DebtBook{' '}
            {pro && <span class="pro-badge">Pro</span>}
          </h1>
          <div class="sub">{shop?.name || 'My shop'}</div>
        </div>
        <StatusBadge />
        <button
          class="icon-btn"
          type="button"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          ⚙
        </button>
      </header>

      <main class={`main ${locked ? 'locked-blur' : ''}`}>
        <div class="card total">
          <div class="label">Total outstanding (customers owe you)</div>
          <div class="amount">{locked ? '••••••' : formatNaira(total)}</div>
        </div>

        {!pro && !locked && (
          <div class="upgrade-nag">
            <strong>DebtBook Pro</strong>
            CSV export &amp; more — ₦1,500/mo.{' '}
            <a href={href('/settings/pro')}>See Pro</a>
          </div>
        )}

        <div class="search-wrap">
          <label class="sr-only" for="search">
            Search customers
          </label>
          <input
            id="search"
            class="input"
            type="search"
            placeholder="Search name or phone…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="section-title">
          Customers {filtered.length ? `(${filtered.length})` : ''} — overdue
          first, then highest debt
        </div>

        {loading ? (
          <div class="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div class="empty">
            <strong>{query ? 'No matches' : 'No customers yet'}</strong>
            {query
              ? 'Try another name or phone.'
              : 'Tap + Customer to add someone who buys on credit.'}
          </div>
        ) : (
          <div class="list">
            {filtered.map((row) => {
              const tone = balanceTone(row.balanceKobo);
              const overdue = isOverdue(row.customer, row.balanceKobo);
              return (
                <div class="list-item-wrap" key={row.customer.id}>
                  <a
                    class="list-item"
                    href={href(`/customers/${row.customer.id}`)}
                  >
                    <div class="meta">
                      <div class="name">
                        {row.customer.name}
                        {overdue && (
                          <span class="overdue-badge">Overdue</span>
                        )}
                      </div>
                      <div class="hint">
                        {row.customer.phone || 'No phone'} ·{' '}
                        {balanceLabel(row.balanceKobo)}
                      </div>
                    </div>
                    <div class={`amount-pill ${tone}`}>
                      {locked
                        ? '••••'
                        : formatNaira(Math.abs(row.balanceKobo))}
                    </div>
                  </a>
                  {!locked && (
                    <div class="quick-actions">
                      <button
                        type="button"
                        class="qa-credit"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(
                            `/customers/${row.customer.id}/entry/credit`,
                          );
                        }}
                      >
                        + Credit
                      </button>
                      <button
                        type="button"
                        class="qa-pay"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(
                            `/customers/${row.customer.id}/entry/payment`,
                          );
                        }}
                      >
                        − Payment
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/customers/${row.customer.id}`);
                        }}
                      >
                        Open
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {!locked && (
        <button
          class="fab"
          type="button"
          aria-label="Add customer"
          onClick={() => navigate('/customers/new')}
        >
          + <span class="label">Customer</span>
        </button>
      )}
    </div>
  );
}
