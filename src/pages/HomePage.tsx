import { useEffect, useMemo, useState } from 'preact/hooks';
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

type FilterChip = 'all' | 'overdue' | 'owes';

const PRO_HINT_KEY = 'debtbook:pro-hint-dismissed';

function filterTitle(filter: FilterChip, count: number): string {
  const n = count ? ` (${count})` : '';
  if (filter === 'overdue') return `Overdue${n}`;
  if (filter === 'owes') return `Owes you${n}`;
  return `Customers${n}`;
}

export function HomePage({ locked }: Props) {
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');
  const [loading, setLoading] = useState(true);
  const [proHintDismissed, setProHintDismissed] = useState(() => {
    try {
      return localStorage.getItem(PRO_HINT_KEY) === '1';
    } catch {
      return false;
    }
  });

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

  const overdueCount = useMemo(
    () => rows.filter((r) => isOverdue(r.customer, r.balanceKobo)).length,
    [rows],
  );
  const owesCount = useMemo(
    () => rows.filter((r) => r.balanceKobo > 0).length,
    [rows],
  );

  const filteredByChip = useMemo(() => {
    if (filter === 'overdue') {
      return rows.filter((r) => isOverdue(r.customer, r.balanceKobo));
    }
    if (filter === 'owes') {
      return rows.filter((r) => r.balanceKobo > 0);
    }
    return rows;
  }, [rows, filter]);

  const filtered = searchCustomers(filteredByChip, query);
  const pro = isPro(shop);
  const hasCustomers = rows.length > 0;
  const filterActive = filter !== 'all' || Boolean(query.trim());

  const dismissProHint = () => {
    setProHintDismissed(true);
    try {
      localStorage.setItem(PRO_HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const clearFilters = () => {
    setFilter('all');
    setQuery('');
  };

  const heroMeta = (() => {
    const parts: string[] = [];
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    parts.push(`${rows.length} customer${rows.length === 1 ? '' : 's'}`);
    if (owesCount > 0) parts.push(`${owesCount} owe you`);
    return parts.join(' · ');
  })();

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
          {!locked && hasCustomers && (
            <div class="total-meta">{heroMeta}</div>
          )}
        </div>

        {!pro && !locked && !proHintDismissed && (
          <div class="pro-hint">
            <a href={href('/settings/pro')}>Pro: CSV export &amp; backup — ₦1,500/mo</a>
            <button
              type="button"
              class="pro-hint-dismiss"
              aria-label="Dismiss"
              onClick={dismissProHint}
            >
              ×
            </button>
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

        {hasCustomers && (
          <div class="chip-row home-filters" role="group" aria-label="Filter customers">
            <button
              type="button"
              class={filter === 'all' ? 'chip on' : 'chip'}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              class={filter === 'overdue' ? 'chip on' : 'chip'}
              aria-pressed={filter === 'overdue'}
              onClick={() => setFilter('overdue')}
            >
              Overdue{overdueCount ? ` (${overdueCount})` : ''}
            </button>
            <button
              type="button"
              class={filter === 'owes' ? 'chip on' : 'chip'}
              aria-pressed={filter === 'owes'}
              onClick={() => setFilter('owes')}
            >
              Owes you{owesCount ? ` (${owesCount})` : ''}
            </button>
          </div>
        )}

        <div class="section-title">{filterTitle(filter, filtered.length)}</div>

        {loading ? (
          <div class="empty">Loading…</div>
        ) : !hasCustomers ? (
          <div class="empty empty-first-run">
            <strong>Add your first customer</strong>
            <p class="empty-tip">
              DebtBook is for credit / udhar customers — people who buy now and
              pay later.
            </p>
            {!locked && (
              <button
                class="btn btn-primary"
                type="button"
                onClick={() => navigate('/customers/new')}
              >
                Add first customer
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div class="empty">
            <strong>No matches</strong>
            {query
              ? 'Try another name or phone.'
              : filter === 'overdue'
                ? 'Nobody is overdue right now.'
                : filter === 'owes'
                  ? 'Nobody owes you right now.'
                  : 'Nothing here.'}
            {filterActive && (
              <div class="empty-actions">
                <button
                  type="button"
                  class="chip"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            )}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {!locked && hasCustomers && (
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
