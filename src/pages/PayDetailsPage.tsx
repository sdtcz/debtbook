import { currencySymbol } from '../lib/money';
import { isNigeriaShop } from '../lib/phone';
import { BackButton } from '../components/BackButton';
import { useEffect, useState } from 'preact/hooks';
import { notifyChanged, StatusBadge } from '../components/StatusBadge';
import { getShop, setShopPayMe } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

export function PayDetailsPage({ toast }: Props) {
  const { t } = useLocale();
  const ng = isNigeriaShop();
  const [payBankName, setPayBankName] = useState('');
  const [payAccountNumber, setPayAccountNumber] = useState('');
  const [payAccountName, setPayAccountName] = useState('');
  const [payLinkUrl, setPayLinkUrl] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    const s = await getShop();
    if (s) {
      setPayBankName(s.payBankName || '');
      setPayAccountNumber(s.payAccountNumber || '');
      setPayAccountName(s.payAccountName || '');
      const link = s.payLinkUrl || '';
      setPayLinkUrl(link);
      // Soft: expand More options when a link is already saved
      if (link.trim()) setMoreOpen(true);
    }
    setReady(true);
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      await setShopPayMe({
        payBankName,
        payAccountNumber,
        payAccountName,
        payLinkUrl,
      });
      notifyChanged();
      toast(t('settings.payMeSaved'));
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('settings.payMeSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const previewBank = payBankName.trim();
  const previewAcct = payAccountNumber.trim();
  const previewName = payAccountName.trim();
  const showPreview = Boolean(previewBank || previewAcct || previewName);

  return (
    <div class="app-shell">
      <header class="topbar">
        <BackButton fallback="/settings" />
        <h1>{t('payDetails.title')}</h1>
        <StatusBadge />
      </header>
      <main class="main settings-main pay-details-soft">
        <section class="pay-crest-hero" aria-labelledby="pay-crest-title">
          <div class="pay-crest" aria-hidden="true">{currencySymbol()}</div>
          <div class="pay-crest-kicker">{t('payDetails.kicker')}</div>
          <h2 id="pay-crest-title">{t('payDetails.heroTitle')}</h2>
          <p class="pay-crest-hint">{t('payDetails.heroHint')}</p>
        </section>

        <form class="card pay-soft-form" onSubmit={save}>
          <div class="field">
            <label for="pay-bank">{t('settings.payBankName')}</label>
            <input
              id="pay-bank"
              class="input"
              value={payBankName}
              maxlength={80}
              placeholder={t(ng ? 'settings.payBankPlaceholder' : 'settings.payBankPlaceholderAny')}
              autocomplete="off"
              disabled={!ready}
              onInput={(e) => setPayBankName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for="pay-acct">{t('settings.payAccountNumber')}</label>
            <input
              id="pay-acct"
              class="input"
              value={payAccountNumber}
              maxlength={20}
              inputMode="numeric"
              placeholder={t(ng ? 'settings.payAccountPlaceholder' : 'settings.payAccountPlaceholderAny')}
              autocomplete="off"
              disabled={!ready}
              onInput={(e) =>
                setPayAccountNumber((e.target as HTMLInputElement).value)
              }
            />
          </div>
          <div class="field">
            <label for="pay-name">{t('settings.payAccountName')}</label>
            <input
              id="pay-name"
              class="input"
              value={payAccountName}
              maxlength={80}
              placeholder={t('settings.payAccountNamePlaceholder')}
              autocomplete="off"
              disabled={!ready}
              onInput={(e) =>
                setPayAccountName((e.target as HTMLInputElement).value)
              }
            />
          </div>

          <button
            type="button"
            class="more-options-toggle"
            aria-expanded={moreOpen}
            aria-controls="pay-more-options"
            disabled={!ready}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span aria-hidden="true">{moreOpen ? '▾' : '▸'}</span>{' '}
            {t('payDetails.moreOptions')}
          </button>
          {moreOpen && (
            <div
              id="pay-more-options"
              class="more-options-panel"
              role="region"
              aria-label={t('payDetails.moreOptions')}
            >
              <div class="field" style={{ marginBottom: 8 }}>
                <label for="pay-link">{t('settings.payLinkUrl')}</label>
                <input
                  id="pay-link"
                  class="input"
                  value={payLinkUrl}
                  maxlength={200}
                  type="url"
                  placeholder={t(ng ? 'settings.payLinkPlaceholder' : 'settings.payLinkPlaceholderAny')}
                  autocomplete="off"
                  disabled={!ready}
                  onInput={(e) =>
                    setPayLinkUrl((e.target as HTMLInputElement).value)
                  }
                />
              </div>
            </div>
          )}

          {showPreview && (
            <div class="pay-soft-preview" aria-live="polite">
              <div class="pay-soft-preview-label">
                {t('payDetails.previewLabel')}
              </div>
              {previewBank && (
                <div class="pay-soft-preview-line">
                  <strong>{previewBank}</strong>
                </div>
              )}
              {previewAcct && (
                <div class="pay-soft-preview-line">{previewAcct}</div>
              )}
              {previewName && (
                <div class="pay-soft-preview-line">{previewName}</div>
              )}
              <div class="pay-soft-preview-hint">{t('payDetails.previewHint')}</div>
            </div>
          )}

          <button
            class="btn btn-primary pay-soft-save"
            type="submit"
            disabled={busy || !ready}
          >
            {busy ? t('common.saving') : t('settings.payMeSave')}
          </button>
        </form>

        <section class="card poster-entry" aria-labelledby="poster-entry-title">
          <div class="poster-entry-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
            </svg>
          </div>
          <div class="poster-entry-copy">
            <h2 id="poster-entry-title">{t('poster.cardTitle')}</h2>
            <p>{t('poster.cardBody')}</p>
          </div>
          <button
            type="button"
            class="btn btn-secondary poster-entry-btn"
            disabled={!ready}
            onClick={() => navigate('/pay-details/poster')}
          >
            {t('poster.cardBtn')}
          </button>
        </section>
      </main>
    </div>
  );
}
