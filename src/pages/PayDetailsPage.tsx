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
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    const s = await getShop();
    if (s) {
      setPayBankName(s.payBankName || '');
      setPayAccountNumber(s.payAccountNumber || '');
      setPayAccountName(s.payAccountName || '');
      setPayLinkUrl(s.payLinkUrl || '');
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
      <main class="main settings-main">
        <section class="settings-hero card">
          <div class="settings-avatar" aria-hidden="true">
            ₦
          </div>
          <div class="settings-hero-text">
            <div class="settings-hero-name">{t('payDetails.title')}</div>
            <div class="settings-hero-meta">
              <span class="muted">{t('settings.payMeHelp')}</span>
            </div>
          </div>
        </section>

        <div class="settings-group-label">{t('settings.payMe')}</div>
        <form class="settings-group card" onSubmit={save}>
          <p class="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            {t('settings.payMeHelp')}
          </p>
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
              onInput={(e) => setPayLinkUrl((e.target as HTMLInputElement).value)}
            />
          </div>
          <button class="btn btn-primary" type="submit" disabled={busy || !ready}>
            {busy ? t('common.saving') : t('settings.payMeSave')}
          </button>
        </form>
      </main>
    </div>
  );
}
