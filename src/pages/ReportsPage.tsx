import { useEffect, useMemo, useState } from 'preact/hooks';
import { LoadError } from '../components/LoadError';
import { BackButton } from '../components/BackButton';
import { getShop, listAllEntries, listCustomers } from '../db/repo';
import { listAllSupplierEntries, listSuppliers } from '../db/suppliers';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n';
import { formatNaira } from '../lib/money';
import { buildReport, buildSupplierReport, type ReportPeriod } from '../lib/reports';
import { href } from '../lib/router';
import { shareOrCopyText } from '../lib/statement';
import type { Customer, Entry, Supplier, SupplierEntry } from '../lib/types';
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierEntries, setSupplierEntries] = useState<SupplierEntry[]>([]);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let c, e, s, sp, se;
      try {
        [c, e, s, sp, se] = await Promise.all([
          listCustomers(),
          listAllEntries(),
          getShop(),
          listSuppliers(),
          listAllSupplierEntries(),
        ]);
      } catch {
        if (alive) {
          setLoadFailed(true);
          setLoading(false);
        }
        return;
      }
      if (!alive) return;
      setLoadFailed(false);
      setCustomers(c);
      setEntries(e);
      setSuppliers(sp);
      setSupplierEntries(se);
      setShopName(s?.name || '');
      setLoading(false);
    };
    void load();
    window.addEventListener('debtbook:changed', load);
    return () => {
      alive = false;
      window.removeEventListener('debtbook:changed', load);
    };
  }, [reloadKey]);

  const report = useMemo(
    () => buildReport(customers, entries, period),
    [customers, entries, period],
  );
  const supReport = useMemo(
    () => buildSupplierReport(suppliers, supplierEntries, period),
    [suppliers, supplierEntries, period],
  );
  const money = (k: number) => (locked ? '••••' : formatNaira(k));
  const periodLabel = t(PERIODS.find((p) => p.id === period)!.key);

  const share = async () => {
    const lines = [
      t('reports.messageTitle', { shop: shopName || 'BashiBook', period: periodLabel }),
      t('reports.messageCredit', { amount: formatNaira(report.creditGivenKobo) }),
      t('reports.messageCollected', { amount: formatNaira(report.collectedKobo) }),
      t('reports.messageOutstanding', { amount: formatNaira(report.outstandingKobo) }),
      ...(suppliers.length
        ? [t('reports.messageIOwe', { amount: formatNaira(supReport.iOweKobo) })]
        : []),
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
        ) : loadFailed ? (
          <LoadError
            onRetry={() => {
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : customers.length === 0 && suppliers.length === 0 ? (
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

            <div class="settings-group-label">{t('reports.suppliersTitle')}</div>
            <section class="card report-wide report-iowe" aria-label={t('reports.suppliersTitle')}>
              {suppliers.length === 0 ? (
                <div class="report-hint">
                  {t('reports.noSuppliers')}{' '}
                  <a href={href('/suppliers')}>{t('reports.openSuppliers')}</a>
                </div>
              ) : (
                <>
                  <div class="report-label">{t('reports.iOweSuppliers')}</div>
                  <div class="report-amount iowe">{money(supReport.iOweKobo)}</div>
                  <div class="report-grid report-iowe-grid">
                    <div>
                      <div class="report-label">{t('reports.purchasedOnCredit')}</div>
                      <div class="report-sub-amount">{money(supReport.purchasedKobo)}</div>
                      <div class="report-hint">{t('reports.entries', { n: supReport.purchaseCount })}</div>
                    </div>
                    <div>
                      <div class="report-label">{t('reports.paidSuppliers')}</div>
                      <div class="report-sub-amount">{money(supReport.paidKobo)}</div>
                      <div class="report-hint">{t('reports.entries', { n: supReport.paymentCount })}</div>
                    </div>
                  </div>
                  {supReport.topCreditors.length > 0 && (
                    <div class="settings-list report-creditors">
                      {supReport.topCreditors.map((d) => (
                        <a key={d.supplier.id} class="settings-row report-debtor" href={href(`/suppliers/${d.supplier.id}`)}>
                          <span class="settings-row-body">
                            <span class="settings-row-title">{d.supplier.name}</span>
                            <span class="settings-row-sub">{t('supplier.youOwe')}</span>
                          </span>
                          <span class="settings-row-trail">
                            {money(d.balanceKobo)}
                            <span class="chev" aria-hidden="true">
                              ›
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

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
