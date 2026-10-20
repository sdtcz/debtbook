import { useEffect, useMemo, useState } from 'preact/hooks';
import { BackButton } from '../components/BackButton';
import { getShop, listAllEntries, listCustomers } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n';
import { formatNaira } from '../lib/money';
import { buildReport, type ReportPeriod } from '../lib/reports';
import { href } from '../lib/router';
import { shareOrCopyText } from '../lib/statement';
import type { Customer, Entry } from '../lib/types';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  locked?: boolean;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

const PERIODS: { id: ReportPeriod; key: MessageKey }[] = [
  { id: 'today', key: 'reports.today' },
  { id: 'week', key: 'reports.week' },
  { id: 'month', key: 'reports.month' },
  { id: 'all', key: 'reports.all' },
];

export function ReportsPage({ locked, toast }: Props) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [c, e, s] = await Promise.all([listCustomers(), listAllEntries(), getShop()]);
      if (!alive) return;
      setCustomers(c);
      setEntries(e);
      setShopName(s?.name || '');
      setLoading(false);
    };
    void load();
    window.addEventListener('debtbook:changed', load);
    return () => {
      alive = false;
      window.removeEventListener('debtbook:changed', load);
    };
  }, []);

  const report = useMemo(
    () => buildReport(customers, entries, period),
    [customers, entries, period],
  );
  const money = (k: number) => (locked ? '••••' : formatNaira(k));
  const periodLabel = t(PERIODS.find((p) => p.id === period)!.key);

  const share = async () => {
    const lines = [
      t('reports.messageTitle', { shop: shopName || 'BashiBook', period: periodLabel }),
      t('reports.messageCredit', { amount: formatNaira(report.creditGivenKobo) }),
      t('reports.messageCollected', { amount: formatNaira(report.collectedKobo) }),
      t('reports.messageOutstanding', { amount: formatNaira(report.outstandingKobo) }),
      '— BashiBook',
    ];
    const r = await shareOrCopyText(lines.join('\n'), t('reports.title'));
    if (r === 'share') toast(t('reports.shared'));
    else if (r === 'clipboard') toast(t('reports.copied'));
    else toast(t('reports.shareFailed'));
  };

  return (
    <div class="app-shell">
      <header class="topbar">
        <BackButton fallback="/" />
        <h1>{t('reports.title')}</h1>
      </header>
      <main class="main settings-main reports-main">
        <div class="chip-row" role="radiogroup" aria-label={t('reports.periodLabel')}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={period === p.id}
              class={period === p.id ? 'chip on' : 'chip'}
              onClick={() => setPeriod(p.id)}
            >
              {t(p.key)}
            </button>
          ))}
        </div>

        {loading ? (
          <div class="empty">{t('common.loading')}</div>
        ) : customers.length === 0 ? (
          <div class="empty">
            <strong>{t('reports.title')}</strong>
            <p>{t('reports.empty')}</p>
          </div>
        ) : (
          <>
            <div class="report-grid">
              <div class="card report-tile debt">
                <div class="report-label">{t('reports.creditGiven')}</div>
                <div class="report-amount">{money(report.creditGivenKobo)}</div>
                <div class="report-hint">{t('reports.entries', { n: report.creditCount })}</div>
              </div>
              <div class="card report-tile ok">
                <div class="report-label">{t('reports.collected')}</div>
                <div class="report-amount">{money(report.collectedKobo)}</div>
                <div class="report-hint">{t('reports.payers', { n: report.payingCustomers })}</div>
              </div>
            </div>

            <div class="card report-wide">
              <div class="report-label">{t('reports.outstanding')}</div>
              <div class="report-amount">{money(report.outstandingKobo)}</div>
              <div class="report-label" style={{ marginTop: 10 }}>
                {t('reports.collectionRate')}
              </div>
              {report.collectionRatePct === null ? (
                <div class="report-hint">{t('reports.noCredit')}</div>
              ) : (
                <div class="report-bar" aria-label={`${report.collectionRatePct}%`}>
                  <span style={{ width: `${report.collectionRatePct}%` }} />
                  <em>{report.collectionRatePct}%</em>
                </div>
              )}
            </div>

            <div class="settings-group-label">{t('reports.topDebtors')}</div>
            <div class="card settings-list">
              {report.topDebtors.length === 0 ? (
                <div class="empty" style={{ padding: 16 }}>
                  {t('reports.nobodyOwes')}
                </div>
              ) : (
                report.topDebtors.map((d) => (
                  <a
                    key={d.customer.id}
                    class="settings-row report-debtor"
                    href={href(`/customers/${d.customer.id}`)}
                  >
                    <span class="settings-row-body">
                      <span class="settings-row-title">{d.customer.name}</span>
                      <span class="settings-row-sub">{d.customer.phone || t('common.noPhone')}</span>
                    </span>
                    <span class="settings-row-trail">
                      {money(d.balanceKobo)}
                      <span class="chev" aria-hidden="true">
                        ›
                      </span>
                    </span>
                  </a>
                ))
              )}
            </div>

            {!locked && (
              <button class="btn btn-secondary" type="button" onClick={share} style={{ marginTop: 14 }}>
                {t('reports.share')}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
