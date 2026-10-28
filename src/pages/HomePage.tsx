import { downloadJson, exportBackup } from '../lib/backup';
import { guardExport } from '../lib/pinGuard';
import { LoadError } from '../components/LoadError';
import { getSupplierBalances } from '../db/suppliers';
import {
  dismissBackupNudge,
  dismissInviteCard,
  inviteCardDismissed,
  openInviteWhatsApp,
  rememberBackupExported,
  shouldShowBackupNudge,
} from '../lib/growth';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ChaseAllSheet as ChaseAllSheetType } from '../components/ChaseAllSheet';
import { StatusBadge } from '../components/StatusBadge';
import {
  creditLimitStatus,
  daysOverdue,
  daysSince,
  daysUntilDue,
  getDashboardBalances,
  getOverdueDigest,
  getShop,
  isOverdue,
  listAllEntries,
  searchCustomers,
} from '../db/repo';
import { rankTodaysChase, weeklyCollected, type WeeklyCollected } from '../lib/chase';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n';
import {
  markPromptedToday,
  resolveChasePrefs,
  shouldShowDailyChasePrompt,
  tryNotifyChaseOverdue,
} from '../lib/chaseReminders';
import { isPro } from '../lib/entitlement';
import { trialStatus } from '../lib/trial';
import type { CustomerBalance, ShopProfile } from '../lib/types';
import { balanceTone, formatMoney, currencySymbol } from '../lib/money';
import { href, navigate } from '../lib/router';
import { remindCustomer, shareMorningDigest } from '../lib/sms';
import type { ToastAction } from '../hooks/useToast';
import { deviceLocale } from '../lib/dates';
import { weekCardDue } from '../lib/weekPrefs';
import type { WeekCard as WeekCardType } from '../components/WeekCard';

interface Props {
  locked?: boolean;
  toast?: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

type FilterChip = 'all' | 'overdue' | 'owes';

const PRO_HINT_KEY = 'debtbook:pro-hint-dismissed'; // KEEP: avoid re-showing dismissed Pro hint

function fmtShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(deviceLocale(), {
    day: 'numeric',
    month: 'short',
  });
}


function nameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // First grapheme-ish for Latin/NG names; fall back to first code unit
  return trimmed.charAt(0).toUpperCase();
}

/** Row line A: debt age / due date, overdue, settled or paid extra (no amounts, safe when locked). */
export function rowAgeLine(
  row: CustomerBalance,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  now = Date.now(),
): { text: string; overdue: boolean } {
  const od = daysOverdue(row.customer, row.balanceKobo, now);
  if (od != null) return { text: od === 1 ? t('home.dayOverdue') : t('home.daysOverdue', { n: od }), overdue: true };
  if (row.entryCount === 0) return { text: t('home.noEntriesYet'), overdue: false };
  if (row.balanceKobo < 0) {
    return {
      text: t('home.paidExtra', { name: row.customer.name, date: row.lastPaymentAt ? fmtShortDate(row.lastPaymentAt) : '' }),
      overdue: false,
    };
  }
  if (row.balanceKobo === 0) {
    return {
      text: row.lastPaymentAt ? t('home.settledLastPaid', { date: fmtShortDate(row.lastPaymentAt) }) : t('home.settled'),
      overdue: false,
    };
  }
  const days = row.oldestUnpaidAt != null ? daysSince(row.oldestUnpaidAt, now) : 0;
  let text =
    days === 0
      ? t('home.ageToday')
      : days === 1
        ? t('home.ageDay')
        : days < 60
          ? t('home.ageDays', { n: days })
          : t('home.ageMonths', { n: Math.floor(days / 30) });
  const until = daysUntilDue(row.customer, row.balanceKobo, now, Infinity);
  if (until != null) text += ` · ${until === 0 ? t('home.dueToday') : t('home.dueInDays', { n: until })}`;
  return { text, overdue: false };
}

export function HomePage({ locked, toast }: Props) {
  const { t } = useLocale();
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [iOwe, setIOwe] = useState<{ total: number; count: number } | null>(null);
  const [proHintDismissed, setProHintDismissed] = useState(() => {
    try {
      return localStorage.getItem(PRO_HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [flash, setFlash] = useState<string | null>(null);
  const [chasePrompt, setChasePrompt] = useState(false);
  const [chasedIds, setChasedIds] = useState<Set<string>>(() => new Set());
  const [week, setWeek] = useState<WeeklyCollected | null>(null);
  const [chaseSheetOpen, setChaseSheetOpen] = useState(false);
  // Code-split: the chase-all sheet loads on first open (keeps Home's first load small on 2G).
  const [ChaseAllSheet, setChaseAllSheet] = useState<typeof ChaseAllSheetType | null>(null);
  const [inviteHidden, setInviteHidden] = useState(() => inviteCardDismissed());
  const [nudgeHidden, setNudgeHidden] = useState(false);
  // Spec 4: Sunday "your week" card. Its code (and the picture code) loads only on Sundays.
  const [WeekCard, setWeekCard] = useState<typeof WeekCardType | null>(null);
  const weekDue = !locked && total + rows.length > 0 && weekCardDue();
  useEffect(() => {
    if (!weekDue || WeekCard) return;
    import('../components/WeekCard')
      .then((m) => setWeekCard(() => m.WeekCard))
      .catch(() => {});
  }, [weekDue, WeekCard]);

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
      listAllEntries()
        .then((all) => setWeek(weeklyCollected(all, new Set(dash.customers.map((r) => r.customer.id)))))
        .catch(() => setWeek(null));
      setLoadFailed(false);
      // Supplier side ("I owe") — never mixed into the customer total above.
      getSupplierBalances()
        .then((r) => setIOwe({ total: r.totalIOweKobo, count: r.suppliers.length }))
        .catch(() => setIOwe(null));
    } catch {
      setLoadFailed(true);
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
  const todays = useMemo(() => rankTodaysChase(rows), [rows]);

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
  const trial = trialStatus(shop);
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
    if (!ChaseAllSheet) {
      import('../components/ChaseAllSheet')
        .then((m) => setChaseAllSheet(() => m.ChaseAllSheet))
        .catch(() => {
          setChaseSheetOpen(false);
          notify(t('common.loadFailedTitle'));
        });
    }
  };

  const chaseOne = async (row: CustomerBalance) => {
    if (!shop) return;
    const result = await remindCustomer({
      shopName: shop.name,
      customerName: row.customer.name,
      phone: row.customer.phone,
      balanceKobo: row.balanceKobo,
    });
    if (result === 'whatsapp') notify(t('customer.openingWhatsApp'));
    else if (result === 'sms') notify(t('customer.openingSms'));
    else if (result === 'share') notify(t('customer.shared'));
    else if (result === 'clipboard') notify(t('customer.messageCopied'));
    else notify(t('customer.couldNotRemind'));
    if (result !== 'none') setChasedIds((prev) => new Set(prev).add(row.customer.id));
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


  const filterTitle = (() => {
    const n = filtered.length ? ` (${filtered.length})` : '';
    if (filter === 'overdue') return `${t('home.sectionOverdue')}${n}`;
    if (filter === 'owes') return `${t('home.sectionOwes')}${n}`;
    return `${t('home.sectionCustomers')}${n}${filtered.length > 1 ? ` · ${t('home.oldestFirst')}` : ''}`;
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
    let oldest: CustomerBalance | null = null;
    for (const r of rows) {
      if (r.balanceKobo > 0 && r.oldestUnpaidAt != null && (!oldest || r.oldestUnpaidAt < oldest.oldestUnpaidAt!)) oldest = r;
    }
    if (oldest) {
      const n = daysSince(oldest.oldestUnpaidAt!);
      if (n > 0) parts.push(t(n === 1 ? 'home.metaOldestOne' : 'home.metaOldest', { name: oldest.customer.name, n }));
    }
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
            <section class="total-soft-hero zero skel-total-soft" aria-hidden="true">
              <div class="total-soft-row">
                <div class="total-soft-avatar skel-soft-avatar" />
                <div class="total-soft-text">
                  <div class="skel-line skel-soft-kicker" />
                  <div class="skel-amount skel-soft-amount" />
                </div>
              </div>
            </section>
            <div class="skel skel-search" />
            <div class="skel skel-section" />
            <div class="skel skel-row" />
            <div class="skel skel-row" />
            <div class="skel skel-row" />
            <span class="sr-only">{t('common.loading')}</span>
          </div>
        ) : (
          <>
        <section
          class={`total-soft-hero ${total > 0 ? 'debt' : 'zero'}`}
          aria-label={t('home.totalOutstanding')}
        >
          <div class="total-soft-row">
            <div class="total-soft-avatar" aria-hidden="true">
              {currencySymbol()}
            </div>
            <div class="total-soft-text">
              <div class="total-soft-kicker">{t('home.totalOutstanding')}</div>
              <div class="total-soft-amount">
                {locked ? '••••••' : formatMoney(total)}
              </div>
              {!locked && hasCustomers && (
                <p class="total-soft-meta">{heroMeta}</p>
              )}
            </div>
          </div>
        </section>

        {weekDue && WeekCard && <WeekCard onHide={() => setWeekCard(null)} toast={notify} />}

        <div class="home-stats">
        {iOwe && (hasCustomers || iOwe.count > 0 || iOwe.total > 0) && (
          <a class={`iowe-home-card${iOwe.total > 0 ? ' owing' : ''}`} href={href('/suppliers')}>
            <span class="iowe-home-icon" aria-hidden="true">
              📦
            </span>
            <span class="iowe-home-body">
              <span class="iowe-home-kicker">{t('home.iOweSuppliers')}</span>
              <span class="iowe-home-sub">
                {iOwe.count === 0
                  ? t('home.iOweSuppliersEmpty')
                  : t('home.iOweSuppliersCount', { n: iOwe.count })}
              </span>
            </span>
            <span class="iowe-home-amount">{locked ? '••••' : formatMoney(iOwe.total)}</span>
            <span class="chev" aria-hidden="true">
              ›
            </span>
          </a>
        )}
        {!locked && hasCustomers && week && (
          <a class="week-collected" href={href('/reports')}>
            <span class="week-collected-icon" aria-hidden="true">
              {currencySymbol()}
            </span>
            <span class="week-collected-body">
              <span class="week-collected-kicker">{t('home.weekCollectedLabel')}</span>
              <span class="week-collected-title">{formatMoney(week.collectedKobo)}</span>
              <span class="week-collected-sub">
                {week.paymentCount === 0
                  ? t('home.weekCollectedNone')
                  : week.paymentCount === 1
                  ? t('home.weekCollectedOne')
                  : t('home.weekCollectedSub', { n: week.paymentCount, c: week.customerCount })}
                {week.lastWeekKobo > 0 ? ` · ${t('home.weekCollectedLast', { amount: formatMoney(week.lastWeekKobo) })}` : ''}
              </span>
            </span>
            <span class="chev" aria-hidden="true">
              ›
            </span>
          </a>
        )}
        </div>

        {flash && (
          <div class="digest-flash" role="status">
            {flash}
          </div>
        )}

        {!locked && trial.state === 'active' && (
          <a class="pro-trial-chip" href={href('/settings/pro')}>
            <span aria-hidden="true">⏳</span>
            <span class="pro-trial-chip-text">
              {trial.daysLeft === 1 ? t('pro.trialOneDayLeft') : t('pro.trialDaysLeft', { n: trial.daysLeft })}
            </span>
            <span class="pro-trial-chip-cta">{t('home.trialUpgrade')}</span>
          </a>
        )}

        {!pro && !locked && trial.state === 'ended' && (
          <a class="pro-hint-soft pro-trial-ended-home" href={href('/settings/pro')}>
            <span class="pro-hint-crest" aria-hidden="true">
              ★
            </span>
            <span class="pro-hint-soft-body">
              <span class="pro-hint-soft-title">{t('pro.trialEndedTitle')}</span>
              <span class="pro-hint-soft-sub">{t('home.trialEndedSub')}</span>
            </span>
            <span class="chev" aria-hidden="true">
              ›
            </span>
          </a>
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

        {loadFailed && !hasCustomers ? (
          <LoadError onRetry={load} />
        ) : !hasCustomers ? (
          <div class="empty empty-first-run">
            <div class="empty-ledger-glyph" aria-hidden="true">
              {currencySymbol()}
            </div>
            <strong>{t('home.emptyFirstTitle')}</strong>
            <p class="empty-tip">{t('home.emptyFirstTip')}</p>
            <p class="empty-hint">{t('home.emptyFirstHint')}</p>
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
          <div class="match-soft-empty">
            <div class="match-soft-glyph" aria-hidden="true">
              {currencySymbol()}
            </div>
            <strong>{t('home.noMatches')}</strong>
            <p>
              {query
                ? t('home.tryAnother')
                : filter === 'overdue'
                  ? t('home.nobodyOverdue')
                  : filter === 'owes'
                    ? t('home.nobodyOwes')
                    : t('home.nothingHere')}
            </p>
            {filterActive && (
              <div class="empty-actions">
                <button
                  type="button"
                  class="chip match-soft-chip"
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
              const age = rowAgeLine(row, t);
              const part =
                !locked && row.balanceKobo > 0 && (row.cyclePaidKobo ?? 0) > 0 && (row.cycleCreditKobo ?? 0) > 0
                  ? { paid: row.cyclePaidKobo!, total: row.cycleCreditKobo! }
                  : null;
              return (
                <div
                  class={`list-item-wrap soft-list-row ${tone}${overdue ? ' overdue' : ''}`}
                  key={row.customer.id}
                >
                  <a
                    class="list-item soft-list-link"
                    href={href(`/customers/${row.customer.id}`)}
                  >
                    <div class="soft-list-avatar" aria-hidden="true">
                      {nameInitial(row.customer.name)}
                    </div>
                    <div class="meta soft-list-meta">
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
                      <div class={`hint soft-list-hint${age.overdue ? ' row-od' : ''}`}>{age.text}</div>
                      {part && (
                        <>
                          <div class="hint soft-list-hint">
                            {t('home.paidOf', { paid: formatMoney(part.paid), total: formatMoney(part.total) })}
                          </div>
                          <div class="row-bar" aria-hidden="true">
                            <i style={{ width: `${Math.min(100, Math.round((part.paid / part.total) * 100))}%` }} />
                          </div>
                        </>
                      )}
                    </div>
                    <div class={`amount-pill soft-list-pill ${tone}${overdue ? ' overdue' : ''}`}>
                      {locked
                        ? '••••'
                        : formatMoney(Math.abs(row.balanceKobo))}
                    </div>
                  </a>
                  {!locked && (
                    <div class="quick-actions soft-list-qa">
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

        {/* Below the list so the first customer rows stay above the fold (QA P1). */}
        {!locked && todays.length > 0 && (
          <section
            class={`card chase-today${chasePrompt ? ' digest-card-emphasize' : ''}`}
            aria-labelledby="chase-today-title"
          >
            <div class="chase-today-head">
              <h2 id="chase-today-title" class="chase-today-title">
                {t('home.chaseTodayTitle', { n: todays.length })}
              </h2>
              <p class="chase-today-sub">{t('home.chaseTodaySub')}</p>
            </div>
            <button type="button" class="chase-today-overdue" onClick={openOverdue}>
              {t('home.digestMeta', { n: digest.count, amount: formatMoney(digest.totalOverdueKobo) })}
              <span aria-hidden="true"> · {t('home.digestOpen')} →</span>
            </button>
            <ol class="chase-today-list">
              {todays.map((it, i) => {
                const done = chasedIds.has(it.row.customer.id);
                return (
                  <li key={it.row.customer.id} class={`chase-today-row${done ? ' done' : ''}`}>
                    <span class="chase-today-rank" aria-hidden="true">
                      {i + 1}
                    </span>
                    <a class="chase-today-body" href={href(`/customers/${it.row.customer.id}`)}>
                      <span class="chase-today-name">{it.row.customer.name}</span>
                      <span class="chase-today-meta">
                        {formatMoney(it.row.balanceKobo)} ·{' '}
                        {it.daysOverdue === 1
                          ? t('home.chaseTodayLateOne')
                          : t('home.chaseTodayLate', { n: it.daysOverdue })}
                      </span>
                    </a>
                    <button
                      type="button"
                      class={`btn chase-today-wa${done ? ' done' : ''}`}
                      aria-label={t('home.chaseTodayWaAria', { name: it.row.customer.name })}
                      onClick={() => chaseOne(it.row)}
                    >
                      {done ? `✓ ${t('home.chaseTodaySent')}` : it.row.customer.phone ? 'WhatsApp' : t('home.chaseTodayShare')}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div class="chase-today-actions">
              <button type="button" class="btn btn-secondary" onClick={openChaseSheet}>
                {t('home.chaseAll')}
              </button>
              <button type="button" class="btn btn-ghost" onClick={shareDigest}>
                {t('home.digestWhatsApp')}
              </button>
              {chasePrompt && (
                <button type="button" class="btn btn-ghost" onClick={dismissChasePrompt}>
                  {t('home.chasePromptDismiss')}
                </button>
              )}
            </div>
          </section>
        )}

        {!locked &&
          !nudgeHidden &&
          shouldShowBackupNudge({
            customerCount: rows.length,
            cloudBackupAt: shop?.lastCloudBackupAt,
          }) && (
            <div class="growth-card nudge" role="status">
              <div class="growth-card-body">
                <strong>{t('growth.backupNudgeTitle')}</strong>
                <span>{t('growth.backupNudgeBody')}</span>
              </div>
              <div class="growth-card-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick={async () => {
                    if (!(await guardExport(getShop))) return;
                    const data = await exportBackup();
                    const stamp = new Date().toISOString().slice(0, 10);
                    downloadJson(`bashibook-backup-${stamp}.json`, data);
                    rememberBackupExported();
                    setNudgeHidden(true);
                    notify(t('settings.backupDownloaded'));
                  }}
                >
                  {t('growth.backupNudgeBtn')}
                </button>
                <button
                  type="button"
                  class="pro-hint-dismiss"
                  aria-label={t('common.dismiss')}
                  onClick={() => {
                    dismissBackupNudge();
                    setNudgeHidden(true);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

        {!locked && !inviteHidden && rows.length >= 3 && (
          <div class="growth-card invite">
            <div class="growth-card-body">
              <strong>{t('growth.inviteCardTitle')}</strong>
              <span>{t('growth.inviteCardBody')}</span>
            </div>
            <div class="growth-card-actions">
              <button type="button" class="btn btn-secondary" onClick={openInviteWhatsApp}>
                {t('growth.inviteCta')}
              </button>
              <button
                type="button"
                class="pro-hint-dismiss"
                aria-label={t('common.dismiss')}
                onClick={() => {
                  dismissInviteCard();
                  setInviteHidden(true);
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {!pro && !locked && hasCustomers && !proHintDismissed && trial.state !== 'ended' && (
          <div class="pro-hint-soft pro-hint-below">
            <a
              class="pro-hint-soft-link"
              href={href('/settings/pro')}
            >
              <span class="pro-hint-crest" aria-hidden="true">
                ★
              </span>
              <span class="pro-hint-soft-body">
                <span class="pro-hint-soft-title">{t('home.proHintTitle')}</span>
                <span class="pro-hint-soft-sub">{t('home.proHintSub')}</span>
              </span>
            </a>
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
          </>
        )}
      </main>

      {chaseSheetOpen && shop && ChaseAllSheet && (
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
