import { useEffect, useState } from 'preact/hooks';
import { notifyChanged, StatusBadge } from '../components/StatusBadge';
import { getShop, setShopPayMe } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { ToastAction } from '../hooks/useToast';
import { navigate } from '../lib/router';

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

export function PayDetailsPage({ toast }: Props) {
  const { t } = useLocale();
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
        <button
          class="icon-btn"
          type="button"
          aria-label={t('common.back')}
          onClick={() => navigate('/settings')}
        >
          ←
        </button>
        <h1>{t('payDetails.title')}</h1>
        <StatusBadge />
      </header>
      <main class="main settings-main pay-details-soft">
        <section class="pay-soft-hero" aria-label={t('payDetails.title')}>
          <div class="pay-soft-hero-row">
            <div class="pay-soft-avatar" aria-hidden="true">
              ₦
            </div>
            <div class="pay-soft-hero-text">
              <div class="pay-soft-hero-name">{t('payDetails.title')}</div>
              <p class="pay-soft-hero-tip">{t('settings.payMeHelp')}</p>
            </div>
          </div>
        </section>

        <form class="card pay-soft-form" onSubmit={save}>
          <div class="field">
            <label for="pay-bank">{t('settings.payBankName')}</label>
            <input
              id="pay-bank"
              class="input"
              value={payBankName}
              maxlength={80}
              placeholder={t('settings.payBankPlaceholder')}
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
              placeholder={t('settings.payAccountPlaceholder')}
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
                  placeholder={t('settings.payLinkPlaceholder')}
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
      </main>
    </div>
  );
}
