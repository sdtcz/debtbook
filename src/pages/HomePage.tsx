import { useEffect, useMemo, useState } from 'preact/hooks';
import { ChaseAllSheet } from '../components/ChaseAllSheet';
import { StatusBadge } from '../components/StatusBadge';
import {
  creditLimitStatus,
  daysOverdue,
  daysUntilDue,
  getDashboardBalances,
  getOverdueDigest,
  getShop,
  isOverdue,
  searchCustomers,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n';
import {
  markPromptedToday,
  resolveChasePrefs,
  shouldShowDailyChasePrompt,
  tryNotifyChaseOverdue,
} from '../lib/chaseReminders';
import { isPro } from '../lib/entitlement';
import type { CustomerBalance, ShopProfile } from '../lib/types';
import { balanceLabel, balanceTone, formatNaira } from '../lib/money';
import { href, navigate } from '../lib/router';
import { copyMorningDigest, shareMorningDigest } from '../lib/sms';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  locked?: boolean;
  toast?: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

type FilterChip = 'all' | 'overdue' | 'owes';

const PRO_HINT_KEY = 'debtbook:pro-hint-dismissed'; // KEEP: avoid re-showing dismissed Pro hint

function fmtShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  });
}

function rowStatusLine(
  row: CustomerBalance,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string | null {
  const parts: string[] = [];
  const overdueDays = daysOverdue(row.customer, row.balanceKobo);
  if (overdueDays != null) {
    parts.push(
      overdueDays === 1
        ? t('home.dayOverdue')
        : t('home.daysOverdue', { n: overdueDays }),
    );
  } else {
    const until = daysUntilDue(row.customer, row.balanceKobo);
    if (until != null) {
      parts.push(
        until === 0 ? t('home.dueToday') : t('home.dueInDays', { n: until }),
      );
    }
  }
  if (row.lastPaymentAt) {
    parts.push(t('home.lastPaid', { date: fmtShortDate(row.lastPaymentAt) }));
  }
  return parts.length ? parts.join(' · ') : null;
}

export function HomePage({ locked, toast }: Props) {
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
  const [flash, setFlash] = useState<string | null>(null);
  const [chasePrompt, setChasePrompt] = useState(false);
  const [chaseSheetOpen, setChaseSheetOpen] = useState(false);

  const notify = (msg: string) => {
    if (toast) toast(msg);
    else {
      setFlash(msg);
      window.setTimeout(() => setFlash(null), 2500);
    }
  };

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

  const digest = useMemo(() => getOverdueDigest(rows), [rows]);
  const chasePrefs = useMemo(() => resolveChasePrefs(shop), [shop]);

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

  /** Daily chase prompt on open / focus */
  useEffect(() => {
    if (loading || locked) return;

    const maybePrompt = () => {
      if (document.visibilityState === 'hidden') return;
      const prefs = resolveChasePrefs(shop);
      const count = rows.filter((r) => isOverdue(r.customer, r.balanceKobo)).length;
      if (
        !shouldShowDailyChasePrompt({
          enabled: prefs.enabled,
          overdueCount: count,
          locked,
        })
      ) {
        return;
      }
      markPromptedToday();
      setChasePrompt(true);
      tryNotifyChaseOverdue(count);
    };

    maybePrompt();
    const onVis = () => {
      if (document.visibilityState === 'visible') maybePrompt();
    };
    const onFocus = () => maybePrompt();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [loading, locked, shop, rows]);

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

  const openOverdue = () => {
    setFilter('overdue');
    setQuery('');
  };

  const openChaseSheet = () => {
    setChasePrompt(false);
    setChaseSheetOpen(true);
  };

  const dismissChasePrompt = () => {
    setChasePrompt(false);
    markPromptedToday();
  };

  const shareDigest = async () => {
    if (!shop || digest.count === 0) return;
    const result = await shareMorningDigest({
      shopName: shop.name,
      overdue: digest.all.map((r) => ({
        name: r.customer.name,
        balanceKobo: r.balanceKobo,
      })),
    });
    if (result === 'whatsapp') notify(t('home.digestShared'));
    else if (result === 'share') notify(t('home.digestShared'));
    else if (result === 'clipboard') notify(t('home.digestCopied'));
    else notify(t('home.digestShareFailed'));
  };

  const copyDigest = async () => {
    if (!shop || digest.count === 0) return;
    const ok = await copyMorningDigest({
      shopName: shop.name,
      overdue: digest.all.map((r) => ({
        name: r.customer.name,
        balanceKobo: r.balanceKobo,
      })),
    });
    notify(ok ? t('home.digestCopied') : t('home.digestShareFailed'));
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

        {!locked && chasePrompt && digest.count > 0 && (
          <div class="card chase-prompt" role="status">
            <div class="chase-prompt-text">
              <div class="chase-prompt-title">{t('home.chasePromptTitle')}</div>
              <div class="chase-prompt-body">
                {t('home.chasePromptBody', {
                  n: digest.count,
                  time: chasePrefs.time,
                })}
              </div>
            </div>
            <div class="chase-prompt-actions">
              <button
                type="button"
                class="btn btn-primary"
                onClick={openChaseSheet}
              >
                {t('home.chasePromptGo')}
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                onClick={dismissChasePrompt}
              >
                {t('home.chasePromptDismiss')}
              </button>
            </div>
          </div>
        )}

        {!locked && digest.count > 0 && (
          <div class={`card digest-card${chasePrompt ? ' digest-card-emphasize' : ''}`}>
            <button
              type="button"
              class="digest-main"
              onClick={openOverdue}
            >
              <div class="digest-title">{t('home.digestTitle')}</div>
              <div class="digest-meta">
                {t('home.digestMeta', {
                  n: digest.count,
                  amount: locked
                    ? '••••'
                    : formatNaira(digest.totalOverdueKobo),
                })}
              </div>
              <div class="digest-top">
                {t('home.digestTop', {
                  names: digest.top.map((r) => r.customer.name).join(', '),
                })}
              </div>
              <div class="digest-open">{t('home.digestOpen')} →</div>
            </button>
            <div class="digest-actions">
              <button
                type="button"
                class="btn btn-primary digest-btn"
                onClick={openChaseSheet}
              >
                {t('home.chaseAll')}
              </button>
              <button
                type="button"
                class="btn btn-secondary digest-btn"
                onClick={shareDigest}
              >
                {t('home.digestWhatsApp')}
              </button>
              <button
                type="button"
                class="btn btn-ghost digest-btn"
                onClick={copyDigest}
              >
                {t('home.digestCopy')}
              </button>
            </div>
          </div>
        )}

        {flash && (
          <div class="digest-flash" role="status">
            {flash}
          </div>
        )}

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

        {!locked && filter === 'overdue' && overdueCount > 0 && (
          <div class="chase-filter-bar">
            <button
              type="button"
              class="btn btn-primary"
              onClick={openChaseSheet}
            >
              {t('home.chaseAll')}
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
              const limit = creditLimitStatus(
                row.balanceKobo,
                row.customer.creditLimitKobo,
              );
              const status = rowStatusLine(row, t);
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
                        {limit === 'at' && (
                          <span class="limit-badge at">{t('home.atLimit')}</span>
                        )}
                        {limit === 'near' && (
                          <span class="limit-badge near">{t('home.nearLimit')}</span>
                        )}
                      </div>
                      <div class="hint">
                        {row.customer.phone || t('common.noPhone')} ·{' '}
                        {balanceLabel(row.balanceKobo)}
                      </div>
                      {status && <div class="hint row-status">{status}</div>}
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

      {chaseSheetOpen && shop && (
        <ChaseAllSheet
          shopName={shop.name}
          overdue={digest.all}
          onClose={() => setChaseSheetOpen(false)}
          onToast={notify}
        />
      )}
    </div>
  );
}
