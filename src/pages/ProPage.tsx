import { useEffect, useState } from 'preact/hooks';
import { notifyChanged } from '../components/StatusBadge';
import { getShop, setEntitlement } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { demoProEntitlement, getEntitlement, isPro } from '../lib/entitlement';
import type { ShopProfile } from '../lib/types';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

export function ProPage({ toast }: Props) {
  const { t } = useLocale();
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setShop((await getShop()) || null);
  };

  useEffect(() => {
    refresh();
  }, []);

  const activateDemo = async () => {
    setBusy(true);
    try {
      await setEntitlement(demoProEntitlement(30));
      notifyChanged();
      await refresh();
      toast(t('pro.activated'));
    } finally {
      setBusy(false);
    }
  };

  const tryCheckout = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(
          (body as { message?: string }).message ||
            t('pro.checkoutNotConfigured'),
        );
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast(t('pro.noCheckoutUrl'));
      }
    } catch {
      toast(t('pro.checkoutUnavailable'));
    } finally {
      setBusy(false);
    }
  };

  const ent = getEntitlement(shop);
  const pro = isPro(shop);

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
        <h1>{t('pro.title')}</h1>
        {pro && <span class="pro-badge">{t('common.pro')}</span>}
      </header>
      <main class="main settings-main">
        <section class="card">
          <div class="settings-group-label" style={{ marginTop: 0 }}>
            {t('pro.nigeriaPricing')}
          </div>
          <p class="pro-hero-price">{t('pro.perMonth')}</p>
          <p class="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            {t('pro.orYear')}
          </p>

          {pro ? (
            <div class="pro-status">
              <span aria-hidden="true">✓</span>
              <span>
                {t('pro.youreOnPro')}
                {ent.exp
                  ? t('pro.until', {
                      date: new Date(ent.exp).toLocaleDateString('en-NG'),
                    })
                  : ''}
                {ent.source ? ` · ${ent.source}` : ''}
              </span>
            </div>
          ) : null}

          <div class="settings-group-label">{t('pro.included')}</div>
          <ul class="benefits">
            <li>{t('pro.benefitCloud')}</li>
            <li>{t('pro.benefitCsv')}</li>
            <li>{t('pro.benefitBadge')}</li>
            <li>{t('pro.benefitNoNag')}</li>
            <li>{t('pro.benefitFree')}</li>
          </ul>

          {!pro && (
            <>
              <button
                class="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={activateDemo}
              >
                {t('pro.tryFree')}
              </button>
              <div class="btn-row">
                <button
                  class="btn btn-secondary"
                  type="button"
                  disabled={busy}
                  onClick={tryCheckout}
                >
                  {t('pro.paystack')}
                </button>
              </div>
              <p class="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
                {t('pro.demoNote')}
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
