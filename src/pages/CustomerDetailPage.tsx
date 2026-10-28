import { BackButton } from '../components/BackButton';
import { LoadError } from '../components/LoadError';
import { useEffect, useState } from 'preact/hooks';
import { StatusBadge, notifyChanged } from '../components/StatusBadge';
import {
  creditHeadroomKobo,
  creditLimitStatus,
  getCustomer,
  getCustomerBalance,
  getShop,
  softDeleteEntry,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { Customer, Entry, ShopProfile } from '../lib/types';
import { balanceLabel,
  balanceTone,
  formatMoney, currencySymbol } from '../lib/money';
import { hasPayMeDetails, sendPayMeRequest } from '../lib/payMe';
import { remindCustomer } from '../lib/sms';
import { buildStatement, shareOrCopyText } from '../lib/statement';
import { navigate } from '../lib/router';
import { guardDelete } from '../lib/pinGuard';
import { StatementPdfSheet } from '../components/StatementPdfSheet';
import type { StatementRange } from '../lib/statementPdf';

// PDF code is loaded on demand (kept out of the main bundle for 2G/3G users).
let pdfModules: Promise<[typeof import('../lib/statementPdf'), typeof import('../lib/pdf')]> | null = null;
function loadPdfModules() {
  pdfModules ??= Promise.all([import('../lib/statementPdf'), import('../lib/pdf')]);
  pdfModules.catch(() => {
    pdfModules = null;
  });
  return pdfModules;
}
import { isOverdue } from '../db/repo';
import type { ToastAction } from '../hooks/useToast';
import { deviceLocale } from '../lib/dates';

interface Props {
  id: string;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString(deviceLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function fmtDue(ts: number): string {
  return new Date(ts).toLocaleDateString(deviceLocale(), {
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
  const [pdfOpen, setPdfOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, bal] = await Promise.all([getShop(), getCustomer(id), getCustomerBalance(id)]);
      if (!c) {
        toast(t('customer.notFound'));
        navigate('/', { replace: true });
        return;
      }
      setShop(s || null);
      setCustomer(c);
      setEntries(bal.entries);
      setBalanceKobo(bal.balanceKobo);
      setLoadFailed(false);
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

  const onPayMe = async () => {
    if (!customer || !shop) return;
    if (!hasPayMeDetails(shop)) {
      toast(t('customer.payMeNeedSetup'), {
        ms: 5000,
        action: {
          label: t('customer.payMeGoSettings'),
          onClick: () => navigate('/pay-details'),
        },
      });
      return;
    }
    const result = await sendPayMeRequest({
      shop,
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

  const onStatementPdf = async (range: StatementRange) => {
    if (!customer || !shop) return;
    try {
      const [{ buildStatementData, buildStatementPdf, resolveRange, statementFilename }, { shareOrDownloadFile }] =
        await loadPdfModules();
      const { from, to } = resolveRange(range);
      const data = buildStatementData(entries, { from, to });
      const bytes = buildStatementPdf({ shopName: shop.name, customer, data, generatedAt: to });
      const result = await shareOrDownloadFile(
        bytes,
        statementFilename(customer.name, to),
        'application/pdf',
        t('statement.shareTitle', { name: customer.name }),
      );
      setPdfOpen(false);
      if (result === 'shared') toast(t('customer.statementPdfShared'));
      else if (result === 'downloaded') toast(t('customer.statementPdfDownloaded'));
    } catch {
      toast(t('customer.statementPdfFailed'));
    }
  };

  const removeEntry = async (entryId: string) => {
    if (!confirm(t('customer.deleteEntryConfirm'))) return;
    if (!(await guardDelete(getShop))) return;
    await softDeleteEntry(entryId);
    notifyChanged();
    toast(t('customer.entryDeleted'));
  };

  if (loading || !customer) {
    return (
      <div class="app-shell">
        <header class="topbar">
          <BackButton fallback="/" />
          <h1>{t('common.customer')}</h1>
        </header>
        <main class="main">
          {loadFailed ? <LoadError onRetry={load} /> : <div class="empty">{t('common.loading')}</div>}
        </main>
      </div>
    );
  }

  const tone = balanceTone(balanceKobo);
  const overdue = isOverdue(customer, balanceKobo);
  const limitStatus = creditLimitStatus(balanceKobo, customer.creditLimitKobo);
  const headroom = creditHeadroomKobo(balanceKobo, customer.creditLimitKobo);

  return (
    <div class="app-shell">
      <header class="topbar">
        <BackButton fallback="/" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customer.name}
            {overdue && <span class="overdue-badge">{t('common.overdue')}</span>}
            {limitStatus === 'at' && (
              <span class="limit-badge at">{t('customer.atCreditLimit')}</span>
            )}
            {limitStatus === 'near' && (
              <span class="limit-badge near">{t('customer.nearCreditLimit')}</span>
            )}
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

      <main class="main detail-soft">
        <section
          class={`balance-soft-hero ${tone}${overdue ? ' overdue' : ''}`}
          aria-label={t('customer.balanceTitle')}
        >
          <div class="balance-soft-row">
            <div class="balance-soft-avatar" aria-hidden="true">
              {currencySymbol()}
            </div>
            <div class="balance-soft-text">
              <div class="balance-soft-kicker">{t('customer.balanceTitle')}</div>
              <div class="balance-soft-amount">
                {formatMoney(Math.abs(balanceKobo))}
              </div>
              <p class="balance-soft-label">{balanceLabel(balanceKobo)}</p>
            </div>
          </div>
          {(customer.dueAt ||
            (customer.creditLimitKobo != null && customer.creditLimitKobo > 0) ||
            tone === 'credit') && (
            <div class="balance-soft-hints">
              {customer.dueAt && (
                <p class="balance-soft-hint">
                  {t('customer.due', { date: fmtDue(customer.dueAt) })}
                  {overdue ? t('customer.overdueSuffix') : ''}
                </p>
              )}
              {customer.creditLimitKobo != null && customer.creditLimitKobo > 0 && (
                <p class="balance-soft-hint">
                  {t('customer.creditLimit', {
                    amount: formatMoney(customer.creditLimitKobo),
                  })}
                  {headroom != null && headroom >= 0
                    ? ` · ${t('customer.creditHeadroom', { amount: formatMoney(headroom) })}`
                    : headroom != null
                      ? ` · ${t('customer.creditOverBy', { amount: formatMoney(-headroom) })}`
                      : ''}
                </p>
              )}
              {tone === 'credit' && (
                <p class="balance-soft-hint">{t('customer.overpaid')}</p>
              )}
            </div>
          )}
        </section>

        <div class="actions-grid">
          <button
            class="btn btn-outline entry-btn credit"
            type="button"
            onClick={() => navigate(`/customers/${id}/entry/credit`)}
          >
            {t('customer.creditSale')}
          </button>
          <button
            class="btn btn-outline entry-btn payment"
            type="button"
            onClick={() => navigate(`/customers/${id}/entry/payment`)}
          >
            {t('customer.payment')}
          </button>
        </div>

        <section
          class={`collect-soft${balanceKobo > 0 ? '' : ' collect-soft-share'}`}
          aria-label={
            balanceKobo > 0
              ? t('customer.collectKicker')
              : t('customer.collectShareKicker')
          }
        >
          <div class="collect-soft-head">
            <div class="collect-soft-crest" aria-hidden="true">
              {balanceKobo > 0 ? currencySymbol() : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 3h7l5 5v13H7z" />
                  <path d="M14 3v5h5M10 13h6M10 17h6" />
                </svg>
              )}
            </div>
            <div class="collect-soft-copy">
              <div class="collect-soft-kicker">
                {balanceKobo > 0
                  ? t('customer.collectKicker')
                  : t('customer.collectShareKicker')}
              </div>
              <div class="collect-soft-title">
                {balanceKobo > 0
                  ? t('customer.collectTitle', { amount: formatMoney(balanceKobo) })
                  : t('customer.collectShareTitle')}
              </div>
              <p class="collect-soft-hint">
                {balanceKobo > 0
                  ? t('customer.collectHint', { name: customer.name })
                  : t('customer.collectShareHint', { name: customer.name })}
              </p>
            </div>
          </div>
          {balanceKobo > 0 && (
            // One obvious next step when they owe you: the WhatsApp reminder.
            <button class="btn btn-primary remind-primary" data-act="remind" type="button" onClick={onRemind}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              </svg>
              {customer.phone
                ? t('customer.remindOnWhatsApp', { name: firstName(customer.name) })
                : t('customer.remindShare', { name: firstName(customer.name) })}
            </button>
          )}
          <div class="collect-soft-tiles two">
            {balanceKobo <= 0 && (
              <button class="collect-tile" type="button" onClick={onRemind}>
                <span class="collect-tile-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
                  </svg>
                </span>
                <span class="collect-tile-label">{t('customer.remind')}</span>
              </button>
            )}
            {balanceKobo > 0 && (
              <button class="collect-tile" type="button" onClick={onPayMe}>
                <span class="collect-tile-icon naira" aria-hidden="true">{currencySymbol()}</span>
                <span class="collect-tile-label">{t('customer.payMe')}</span>
              </button>
            )}
            <button class="collect-tile" type="button" onClick={onStatement}>
              <span class="collect-tile-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 3h7l5 5v13H7z" />
                  <path d="M14 3v5h5M10 13h6M10 17h6" />
                </svg>
              </span>
              <span class="collect-tile-label">{t('customer.statement')}</span>
            </button>
          </div>
          <button
            class="btn btn-secondary statement-pdf-btn"
            type="button"
            onClick={() => {
              void loadPdfModules().catch(() => undefined);
              setPdfOpen(true);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v5h5M12 11v7M9 15l3 3 3-3" />
            </svg>
            {t('customer.statementPdf')}
          </button>
        </section>

        {customer.note && (
          <p class="muted" style={{ marginTop: 12 }}>
            {t('customer.note', { note: customer.note })}
          </p>
        )}

        <div class="section-title">{t('customer.history')}</div>
        <div class="history-soft" aria-label={t('customer.history')}>
          {entries.length === 0 ? (
            <div class="history-soft-empty">
              <div class="history-soft-glyph" aria-hidden="true">
                {currencySymbol()}
              </div>
              <strong>{t('customer.noEntriesTitle')}</strong>
              <p>{t('customer.noEntries')}</p>
            </div>
          ) : (
            entries.map((e) => (
              <div class={`history-soft-row ${e.type}`} key={e.id}>
                <div class="history-soft-avatar" aria-hidden="true">
                  {e.type === 'credit' ? '+' : '−'}
                </div>
                <div class="history-soft-body">
                  <div class="history-soft-type">
                    {e.type === 'credit'
                      ? t('customer.creditSaleLabel')
                      : t('customer.paymentLabel')}
                  </div>
                  <div class="history-soft-when">{fmtWhen(e.occurredAt)}</div>
                  {e.note && <div class="history-soft-note">{e.note}</div>}
                </div>
                <div class="history-soft-trail">
                  <div class="history-soft-amt">
                    {e.type === 'credit' ? '+' : '−'}
                    {formatMoney(e.amountKobo)}
                  </div>
                  <button
                    type="button"
                    class="history-soft-del"
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
      {pdfOpen && (
        <StatementPdfSheet
          customerName={customer.name}
          onPick={onStatementPdf}
          onClose={() => setPdfOpen(false)}
        />
      )}
    </div>
  );
}
