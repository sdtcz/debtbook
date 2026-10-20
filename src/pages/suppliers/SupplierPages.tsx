/**
 * Supplier ledger screens ("I owe"). Lazy-loaded as one chunk.
 * Deliberately separate from customers: own stores, own routes, amber "I owe"
 * tone instead of the red/green "they owe me" tones.
 */
import { useEffect, useState } from 'preact/hooks';
import { BackButton } from '../../components/BackButton';
import { LoadError } from '../../components/LoadError';
import { MoneyInput } from '../../components/MoneyInput';
import { StatementPdfSheet } from '../../components/StatementPdfSheet';
import { notifyChanged } from '../../components/StatusBadge';
import { getShop } from '../../db/repo';
import {
  addSupplierEntry,
  computeSupplierBalance,
  getSupplier,
  getSupplierBalances,
  listSupplierEntries,
  restoreSupplier,
  softDeleteSupplier,
  softDeleteSupplierEntry,
  upsertSupplier,
} from '../../db/suppliers';
import { useLocale } from '../../hooks/useLocale';
import type { ToastAction } from '../../hooks/useToast';
import { formatNaira, parseNairaToKobo } from '../../lib/money';
import { guardDelete } from '../../lib/pinGuard';
import { goBack, href, navigate } from '../../lib/router';
import type { StatementRange } from '../../lib/statementPdf';
import type { ShopProfile, Supplier, SupplierBalance, SupplierEntry, SupplierEntryType } from '../../lib/types';

type Toast = (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initial(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

function useBalanceLabel() {
  const { t } = useLocale();
  return (kobo: number, name?: string) =>
    kobo > 0
      ? name
        ? t('supplier.youOweName', { name })
        : t('supplier.youOwe')
      : kobo < 0
        ? t('supplier.overpaid')
        : t('supplier.settled');
}

/* ── List ─────────────────────────────────────────────────────────────── */

export function SuppliersPage() {
  const { t } = useLocale();
  const label = useBalanceLabel();
  const [rows, setRows] = useState<SupplierBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const load = async () => {
    try {
      const r = await getSupplierBalances();
      setRows(r.suppliers);
      setTotal(r.totalIOweKobo);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener('debtbook:changed', on);
    return () => window.removeEventListener('debtbook:changed', on);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => r.supplier.name.toLowerCase().includes(q) || (r.supplier.phone || '').includes(q))
    : rows;

  return (
    <div class="app-shell supplier-screen">
      <header class="topbar">
        <BackButton fallback="/" />
        <h1>{t('supplier.title')}</h1>
      </header>
      <main class="main">
        <section class={`iowe-hero${total > 0 ? ' owing' : ''}`} aria-labelledby="iowe-total-label">
          <div class="iowe-hero-kicker" id="iowe-total-label">
            {t('supplier.totalIOwe')}
          </div>
          <div class="iowe-hero-amount">{formatNaira(total)}</div>
          <p class="iowe-hero-hint">{t('supplier.heroHint')}</p>
        </section>

        {loading ? (
          <div class="empty">{t('common.loading')}</div>
        ) : failed ? (
          <LoadError onRetry={load} />
        ) : rows.length === 0 ? (
          <div class="empty supplier-empty">
            <div class="supplier-empty-glyph" aria-hidden="true">
              📦
            </div>
            <strong>{t('supplier.emptyTitle')}</strong>
            <p>{t('supplier.emptyBody')}</p>
            <button type="button" class="btn btn-primary" onClick={() => navigate('/suppliers/new')}>
              {t('supplier.addFirst')}
            </button>
          </div>
        ) : (
          <>
            {rows.length > 4 && (
              <div class="field" style={{ marginTop: 12 }}>
                <label for="supplier-search" class="sr-only">
                  {t('supplier.search')}
                </label>
                <input
                  id="supplier-search"
                  class="input"
                  type="search"
                  placeholder={t('supplier.search')}
                  value={query}
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                />
              </div>
            )}
            <div class="section-title">{t('supplier.listTitle')}</div>
            {shown.length === 0 ? (
              <div class="empty">{t('home.noMatches')}</div>
            ) : (
              <ul class="supplier-list">
                {shown.map((r) => (
                  <li key={r.supplier.id}>
                    <a class="supplier-row" href={href(`/suppliers/${r.supplier.id}`)}>
                      <span class="supplier-avatar" aria-hidden="true">
                        {initial(r.supplier.name)}
                      </span>
                      <span class="supplier-row-body">
                        <span class="supplier-row-name">{r.supplier.name}</span>
                        <span class="supplier-row-sub">
                          {r.supplier.phone || t('common.noPhone')} · {label(r.balanceKobo)}
                        </span>
                      </span>
                      <span class={`supplier-pill${r.balanceKobo > 0 ? ' owing' : ''}`}>
                        {formatNaira(Math.abs(r.balanceKobo))}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" class="btn btn-primary supplier-add-btn" onClick={() => navigate('/suppliers/new')}>
              + {t('supplier.add')}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

/* ── Add / edit ──────────────────────────────────────────────────────── */

export function SupplierFormPage({ id, toast }: { id?: string; toast: Toast }) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(id);

  useEffect(() => {
    if (!id) return;
    getSupplier(id).then((s) => {
      if (!s) {
        toast(t('supplier.notFound'));
        navigate('/suppliers', { replace: true });
        return;
      }
      setName(s.name);
      setPhone(s.phone || '');
      setNote(s.note || '');
    });
  }, [id]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('supplier.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await upsertSupplier({ id, name, phone, note });
      notifyChanged();
      toast(editing ? t('supplier.saved') : t('supplier.added', { name: s.name }));
      navigate(`/suppliers/${s.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supplier.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    if (!confirm(t('supplier.removeConfirm', { name }))) return;
    if (!(await guardDelete(getShop))) return;
    setBusy(true);
    try {
      await softDeleteSupplier(id);
      notifyChanged();
      toast(t('supplier.removed'), {
        ms: 6000,
        action: {
          label: t('common.undo'),
          onClick: async () => {
            await restoreSupplier(id);
            notifyChanged();
          },
        },
      });
      navigate('/suppliers', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="app-shell supplier-screen">
      <header class="topbar">
        <BackButton fallback={id ? `/suppliers/${id}` : '/suppliers'} />
        <h1>{editing ? t('supplier.editTitle') : t('supplier.newTitle')}</h1>
      </header>
      <main class="main">
        <form class="card supplier-form" onSubmit={submit} noValidate>
          {!editing && <p class="supplier-form-tip">{t('supplier.formTip')}</p>}
          <div class="field">
            <label for="supplier-name">{t('supplier.name')}</label>
            <input
              id="supplier-name"
              class="input"
              value={name}
              maxlength={80}
              required
              autoFocus={!editing}
              autocomplete="organization"
              placeholder={t('supplier.namePlaceholder')}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'supplier-form-error' : undefined}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for="supplier-phone">{t('supplier.phone')}</label>
            <input
              id="supplier-phone"
              class="input"
              type="tel"
              inputMode="tel"
              value={phone}
              maxlength={20}
              placeholder="0803 123 4567"
              onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for="supplier-note">{t('supplier.note')}</label>
            <input
              id="supplier-note"
              class="input"
              value={note}
              maxlength={120}
              placeholder={t('supplier.notePlaceholder')}
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            />
          </div>
          {error && (
            <p id="supplier-form-error" class="form-error" role="alert">
              {error}
            </p>
          )}
          <button class="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t('common.saving') : editing ? t('common.save') : t('supplier.add')}
          </button>
          {editing && (
            <button class="btn btn-ghost supplier-remove" type="button" disabled={busy} onClick={remove}>
              {t('supplier.remove')}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}

/* ── Detail ──────────────────────────────────────────────────────────── */

let pdfModules: Promise<[typeof import('../../lib/statementPdf'), typeof import('../../lib/pdf')]> | null = null;
function loadPdf() {
  pdfModules ??= Promise.all([import('../../lib/statementPdf'), import('../../lib/pdf')]);
  pdfModules.catch(() => {
    pdfModules = null;
  });
  return pdfModules;
}

export function SupplierDetailPage({ id, toast }: { id: string; toast: Toast }) {
  const { t } = useLocale();
  const label = useBalanceLabel();
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [entries, setEntries] = useState<SupplierEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  const load = async () => {
    try {
      const [s, sup, es] = await Promise.all([getShop(), getSupplier(id), listSupplierEntries(id)]);
      if (!sup) {
        toast(t('supplier.notFound'));
        navigate('/suppliers', { replace: true });
        return;
      }
      setShop(s || null);
      setSupplier(sup);
      setEntries(es);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener('debtbook:changed', on);
    return () => window.removeEventListener('debtbook:changed', on);
  }, [id]);

  if (loading || !supplier) {
    return (
      <div class="app-shell supplier-screen">
        <header class="topbar">
          <BackButton fallback="/suppliers" />
          <h1>{t('supplier.one')}</h1>
        </header>
        <main class="main">
          {failed ? <LoadError onRetry={load} /> : <div class="empty">{t('common.loading')}</div>}
        </main>
      </div>
    );
  }

  const { balanceKobo } = computeSupplierBalance(entries);

  const removeEntry = async (entryId: string) => {
    if (!confirm(t('customer.deleteEntryConfirm'))) return;
    if (!(await guardDelete(getShop))) return;
    await softDeleteSupplierEntry(entryId);
    notifyChanged();
    toast(t('customer.entryDeleted'));
  };

  const onPdf = async (range: StatementRange) => {
    try {
      const [{ buildStatementData, buildStatementPdf, resolveRange, statementFilename }, { shareOrDownloadFile }] =
        await loadPdf();
      const { from, to } = resolveRange(range);
      const data = buildStatementData(entries, { from, to });
      const bytes = buildStatementPdf({
        shopName: shop?.name || 'BashiBook',
        customer: supplier,
        data,
        generatedAt: to,
        kind: 'supplier',
      });
      const result = await shareOrDownloadFile(
        bytes,
        statementFilename(`supplier-${supplier.name}`, to),
        'application/pdf',
        t('supplier.pdfShareTitle', { name: supplier.name }),
      );
      setPdfOpen(false);
      if (result === 'shared') toast(t('customer.statementPdfShared'));
      else if (result === 'downloaded') toast(t('customer.statementPdfDownloaded'));
    } catch {
      toast(t('customer.statementPdfFailed'));
    }
  };

  return (
    <div class="app-shell supplier-screen">
      <header class="topbar">
        <BackButton fallback="/suppliers" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplier.name}</h1>
          <div class="sub">
            {t('supplier.one')} · {supplier.phone || t('common.noPhone')}
          </div>
        </div>
        <button class="icon-btn" type="button" aria-label={t('supplier.editTitle')} onClick={() => navigate(`/suppliers/${id}/edit`)}>
          ✎
        </button>
      </header>
      <main class="main">
        <section class={`iowe-hero${balanceKobo > 0 ? ' owing' : ''}`} aria-labelledby="iowe-bal-label">
          <div class="iowe-hero-kicker" id="iowe-bal-label">
            {t('supplier.balanceTitle')}
          </div>
          <div class="iowe-hero-amount">{formatNaira(Math.abs(balanceKobo))}</div>
          <p class="iowe-hero-hint">{label(balanceKobo, supplier.name)}</p>
        </section>

        <div class="actions-grid">
          <button class="btn btn-iowe" type="button" onClick={() => navigate(`/suppliers/${id}/entry/purchase`)}>
            + {t('supplier.purchase')}
          </button>
          <button class="btn btn-ok" type="button" onClick={() => navigate(`/suppliers/${id}/entry/payment`)}>
            − {t('supplier.payment')}
          </button>
        </div>
        <button
          class="btn btn-secondary statement-pdf-btn"
          type="button"
          onClick={() => {
            void loadPdf().catch(() => undefined);
            setPdfOpen(true);
          }}
        >
          {t('customer.statementPdf')}
        </button>
        {supplier.note && (
          <p class="muted" style={{ marginTop: 12 }}>
            {t('customer.note', { note: supplier.note })}
          </p>
        )}

        <div class="section-title">{t('customer.history')}</div>
        {entries.length === 0 ? (
          <div class="empty supplier-empty">
            <strong>{t('supplier.noEntriesTitle')}</strong>
            <p>{t('supplier.noEntries')}</p>
          </div>
        ) : (
          <ul class="supplier-history">
            {entries.map((e) => (
              <li class={`supplier-hist-row ${e.type}`} key={e.id}>
                <span class="supplier-hist-sign" aria-hidden="true">
                  {e.type === 'purchase' ? '+' : '−'}
                </span>
                <span class="supplier-hist-body">
                  <span class="supplier-hist-type">
                    {e.type === 'purchase' ? t('supplier.purchaseLabel') : t('supplier.paymentLabel')}
                  </span>
                  <span class="supplier-hist-when">{fmtWhen(e.occurredAt)}</span>
                  {e.note && <span class="supplier-hist-note">{e.note}</span>}
                </span>
                <span class="supplier-hist-amt">
                  {e.type === 'purchase' ? '+' : '−'}
                  {formatNaira(e.amountKobo)}
                </span>
                <button
                  type="button"
                  class="history-soft-del"
                  aria-label={t('customer.deleteEntry')}
                  onClick={() => removeEntry(e.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {pdfOpen && (
        <StatementPdfSheet customerName={supplier.name} onPick={onPdf} onClose={() => setPdfOpen(false)} />
      )}
    </div>
  );
}

/* ── New entry ───────────────────────────────────────────────────────── */

export function SupplierEntryPage({
  supplierId,
  initialType,
  toast,
}: {
  supplierId: string;
  initialType?: SupplierEntryType;
  toast: Toast;
}) {
  const { t } = useLocale();
  const label = useBalanceLabel();
  const [type, setType] = useState<SupplierEntryType>(initialType || 'purchase');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSupplier(supplierId), listSupplierEntries(supplierId)])
      .then(([s, es]) => {
        if (!s) {
          toast(t('supplier.notFound'));
          navigate('/suppliers', { replace: true });
          return;
        }
        setSupplier(s);
        setBalanceKobo(computeSupplierBalance(es).balanceKobo);
      })
      .catch(() => setBalanceKobo(null));
  }, [supplierId]);
  useEffect(() => {
    if (initialType) setType(initialType);
  }, [initialType]);

  const kobo = parseNairaToKobo(amount);
  const after = balanceKobo === null || !kobo || kobo <= 0 ? null : balanceKobo + (type === 'purchase' ? kobo : -kobo);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (kobo === null || kobo <= 0) {
      setError(t('supplier.amountInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addSupplierEntry({ supplierId, type, amountKobo: kobo, note });
      notifyChanged();
      toast(type === 'purchase' ? t('supplier.purchaseSaved') : t('supplier.paymentSaved'));
      goBack(`/suppliers/${supplierId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supplier.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const title = type === 'purchase' ? t('supplier.purchase') : t('supplier.payment');
  return (
    <div class="app-shell supplier-screen">
      <header class="topbar">
        <BackButton fallback={`/suppliers/${supplierId}`} />
        <div style={{ flex: 1 }}>
          <h1>{title}</h1>
          <div class="sub">{supplier?.name || ''}</div>
        </div>
      </header>
      <main class="main">
        {balanceKobo !== null && (
          <section class={`iowe-hero compact${balanceKobo > 0 ? ' owing' : ''}`} aria-live="polite">
            <div class="iowe-hero-kicker">{t('entry.tallyNow')}</div>
            <div class="iowe-hero-amount">{formatNaira(Math.abs(balanceKobo))}</div>
            <p class="iowe-hero-hint">{label(balanceKobo)}</p>
            {after !== null && (
              <p class="iowe-hero-after">
                {t('entry.tallyAfter')}: <strong>{formatNaira(Math.abs(after))}</strong> · {label(after)}
              </p>
            )}
          </section>
        )}
        <form class="card supplier-form" onSubmit={submit} noValidate>
          <div class="seg" role="group" aria-label={t('entry.type')}>
            <button
              type="button"
              aria-pressed={type === 'purchase'}
              class={type === 'purchase' ? 'active iowe' : ''}
              onClick={() => setType('purchase')}
            >
              {t('supplier.purchase')}
            </button>
            <button
              type="button"
              aria-pressed={type === 'payment'}
              class={type === 'payment' ? 'active payment' : ''}
              onClick={() => setType('payment')}
            >
              {t('supplier.payment')}
            </button>
          </div>
          <p class="supplier-form-tip">{type === 'purchase' ? t('supplier.purchaseTip') : t('supplier.paymentTip')}</p>
          <MoneyInput id="amount" label={t('entry.amount')} value={amount} onInput={setAmount} autoFocus />
          <div class="field">
            <label for="enote">{t('entry.note')}</label>
            <input
              id="enote"
              class="input"
              value={note}
              maxlength={120}
              placeholder={t('supplier.entryNotePlaceholder')}
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            />
          </div>
          {error && (
            <p class="form-error" role="alert">
              {error}
            </p>
          )}
          <button class={`btn ${type === 'purchase' ? 'btn-iowe' : 'btn-ok'}`} type="submit" disabled={busy}>
            {busy ? t('common.saving') : type === 'purchase' ? t('supplier.savePurchase') : t('supplier.savePayment')}
          </button>
        </form>
      </main>
    </div>
  );
}
