import { useEffect, useState } from 'preact/hooks';
import { StatusBadge } from '../components/StatusBadge';
import {
  getDashboardBalances,
  getShop,
  searchCustomers,
} from '../db/repo';
import type { CustomerBalance, ShopProfile } from '../lib/types';
import { balanceLabel, balanceTone, formatNaira } from '../lib/money';
import { href, navigate } from '../lib/router';

export function HomePage() {
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

  return (
    <div class="app-shell">
      <header class="topbar">
        <div style={{ flex: 1 }}>
          <h1>DebtBook</h1>
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

      <main class="main">
        <div class="card total">
          <div class="label">Total outstanding (customers owe you)</div>
          <div class="amount">{formatNaira(total)}</div>
        </div>

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
          Customers {filtered.length ? `(${filtered.length})` : ''} — highest debt first
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
              return (
                <a
                  class="list-item"
                  key={row.customer.id}
                  href={href(`/customers/${row.customer.id}`)}
                >
                  <div class="meta">
                    <div class="name">{row.customer.name}</div>
                    <div class="hint">
                      {row.customer.phone || 'No phone'} · {balanceLabel(row.balanceKobo)}
                    </div>
                  </div>
                  <div class={`amount-pill ${tone}`}>
                    {formatNaira(Math.abs(row.balanceKobo))}
                    {tone === 'credit' ? ' ▾' : tone === 'debt' ? '' : ''}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>

      <button
        class="fab"
        type="button"
        aria-label="Add customer"
        onClick={() => navigate('/customers/new')}
      >
        + <span class="label">Customer</span>
      </button>
    </div>
  );
}
