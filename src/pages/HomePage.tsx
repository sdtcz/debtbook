import { useEffect, useMemo, useState } from 'preact/hooks';
import { StatusBadge } from '../components/StatusBadge';
import {
  getDashboardBalances,
  getShop,
  isOverdue,
  searchCustomers,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { isPro } from '../lib/entitlement';
import type { CustomerBalance, ShopProfile } from '../lib/types';
import { balanceLabel, balanceTone, formatNaira } from '../lib/money';
import { href, navigate } from '../lib/router';

interface Props {
  locked?: boolean;
}

type FilterChip = 'all' | 'overdue' | 'owes';

const PRO_HINT_KEY = 'debtbook:pro-hint-dismissed'; // KEEP: avoid re-showing dismissed Pro hint

export function HomePage({ locked }: Props) {
  const { t } = useLocale();
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

  const filterTitle = (() => {
    const n = filtered.length ? ` (${filtered.length})` : '';
    if (filter === 'overdue') return `${t('home.sectionOverdue')}${n}`;
    if (filter === 'owes') return `${t('home.sectionOwes')}${n}`;
    return `${t('home.sectionCustomers')}${n}`;
  })();

  const heroMeta = (() => {
    const parts: string[] = [];
    if (overdueCount > 0) parts.push(t('home.metaOverdue', { n: overdueCount }));
    parts.push(
      rows.length === 1
        ? t('home.metaCustomer', { n: rows.length })
        : t('home.metaCustomers', { n: rows.length }),
    );
    if (owesCount > 0) parts.push(t('home.metaOweYou', { n: owesCount }));
    return parts.join(' · ');
  })();

  return (
    <div class="app-shell">
      <header class="topbar">
        <div style={{ flex: 1 }}>
          <h1>
            BashiBook{' '}
            {pro && <span class="pro-badge">{t('common.pro')}</span>}
          </h1>
          <div class="sub">{shop?.name || t('home.myShop')}</div>
        </div>
        <StatusBadge />
        <button
          class="icon-btn"
          type="button"
          aria-label={t('home.settings')}
          onClick={() => navigate('/settings')}
        >
          ⚙
        </button>
      </header>

      <main class={`main ${locked ? 'locked-blur' : ''}`}>
        {loading ? (
          <div class="home-skeleton" aria-busy="true" aria-live="polite">
            <div class="card total skel-total">
              <div class="skel-line" />
              <div class="skel-amount" />
            </div>
            <div class="skel skel-search" />
            <div class="skel skel-section" />
            <div class="skel skel-row" />
            <div class="skel skel-row" />
            <div class="skel skel-row" />
            <span class="sr-only">{t('common.loading')}</span>
          </div>
        ) : (
          <>
        <div class="card total">
          <div class="label">{t('home.totalOutstanding')}</div>
          <div class="amount">{locked ? '••••••' : formatNaira(total)}</div>
          {!locked && hasCustomers && (
            <div class="total-meta">{heroMeta}</div>
          )}
        </div>

        {!pro && !locked && !proHintDismissed && (
          <div class="pro-hint">
            <a href={href('/settings/pro')}>{t('home.proHint')}</a>
            <button
              type="button"
              class="pro-hint-dismiss"
              aria-label={t('common.dismiss')}
              onClick={dismissProHint}
            >
              ×
            </button>
          </div>
        )}

        <div class="search-wrap">
          <label class="sr-only" for="search">
            {t('home.searchLabel')}
          </label>
          <input
            id="search"
            class="input"
            type="search"
            placeholder={t('home.searchPlaceholder')}
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </div>

        {hasCustomers && (
          <div class="chip-row home-filters" role="group" aria-label={t('home.filterCustomers')}>
            <button
              type="button"
              class={filter === 'all' ? 'chip on' : 'chip'}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              {t('home.filterAll')}
            </button>
            <button
              type="button"
              class={filter === 'overdue' ? 'chip on' : 'chip'}
              aria-pressed={filter === 'overdue'}
              onClick={() => setFilter('overdue')}
            >
              {t('home.filterOverdue')}
              {overdueCount ? ` (${overdueCount})` : ''}
            </button>
            <button
              type="button"
              class={filter === 'owes' ? 'chip on' : 'chip'}
              aria-pressed={filter === 'owes'}
              onClick={() => setFilter('owes')}
            >
              {t('home.filterOwes')}
              {owesCount ? ` (${owesCount})` : ''}
            </button>
          </div>
        )}

        <div class="section-title">{filterTitle}</div>

        {!hasCustomers ? (
          <div class="empty empty-first-run">
            <strong>{t('home.emptyFirstTitle')}</strong>
            <p class="empty-tip">{t('home.emptyFirstTip')}</p>
            {!locked && (
              <button
                class="btn btn-primary"
                type="button"
                onClick={() => navigate('/customers/new')}
              >
                {t('home.addFirstCustomer')}
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div class="empty">
            <strong>{t('home.noMatches')}</strong>
            {query
              ? t('home.tryAnother')
              : filter === 'overdue'
                ? t('home.nobodyOverdue')
                : filter === 'owes'
                  ? t('home.nobodyOwes')
                  : t('home.nothingHere')}
            {filterActive && (
              <div class="empty-actions">
                <button
                  type="button"
                  class="chip"
                  onClick={clearFilters}
                >
                  {t('home.clearFilters')}
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
                          <span class="overdue-badge">{t('common.overdue')}</span>
                        )}
                      </div>
                      <div class="hint">
                        {row.customer.phone || t('common.noPhone')} ·{' '}
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
                        {t('home.credit')}
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
                        {t('home.payment')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </main>

      {!locked && !loading && hasCustomers && (
        <button
          class="fab"
          type="button"
          aria-label={t('home.addCustomer')}
          onClick={() => navigate('/customers/new')}
        >
          + <span class="label">{t('home.fabCustomer')}</span>
        </button>
      )}
    </div>
  );
}
