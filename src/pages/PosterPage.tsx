import { useEffect, useState } from 'preact/hooks';
import { BackButton } from '../components/BackButton';
import { QrCode } from '../components/QrCode';
import { getShop } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { buildPosterUrl, hasPayMeDetails } from '../lib/payMe';
import { navigate } from '../lib/router';
import type { ShopProfile } from '../lib/types';

/** Printable A4 "Scan to pay me" counter poster (window.print + print CSS). */
export function PosterPage() {
  const { t } = useLocale();
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getShop()
      .then((s) => setShop(s || null))
      .finally(() => setReady(true));
  }, []);

  const ok = hasPayMeDetails(shop);
  const url = shop && ok ? buildPosterUrl(shop) : '';
  const bank = (shop?.payBankName || '').trim();
  const acct = (shop?.payAccountNumber || '').trim();
  const acctName = (shop?.payAccountName || '').trim();

  return (
    <div class="app-shell poster-page">
      <header class="topbar no-print">
        <BackButton fallback="/pay-details" />
        <h1>{t('poster.title')}</h1>
      </header>
      <main class="main">
        {!ready ? (
          <div class="empty">{t('common.loading')}</div>
        ) : !shop || !ok ? (
          <div class="empty-state card poster-empty" role="status">
            <strong>{t('poster.needDetailsTitle')}</strong>
            <p>{t('poster.needDetailsBody')}</p>
            <button type="button" class="btn btn-primary" onClick={() => navigate('/pay-details', { replace: true })}>
              {t('poster.needDetailsBtn')}
            </button>
          </div>
        ) : (
          <>
            <div class="poster-actions no-print">
              <button type="button" class="btn btn-primary poster-print-btn" onClick={() => window.print()}>
                {t('poster.print')}
              </button>
              <p class="muted poster-print-hint">{t('poster.printHint')}</p>
            </div>
            <div class="poster-preview">
              <article class="poster-sheet" aria-label={t('poster.title')}>
                <div class="poster-band" aria-hidden="true" />
                <p class="poster-shop">{shop.name}</p>
                <h2 class="poster-headline">{t('poster.headline')}</h2>
                <p class="poster-sub">{t('poster.sub')}</p>
                <div class="poster-qr-wrap">
                  <QrCode class="poster-qr" value={url} size={320} ecl="Q" label={t('poster.qrLabel', { shop: shop.name })} />
                </div>
                {(bank || acct || acctName) && (
                  <div class="poster-bank">
                    <span class="poster-bank-label">{t('poster.orTransfer')}</span>
                    {bank && <strong>{bank}</strong>}
                    {acct && <strong class="poster-acct">{acct}</strong>}
                    {acctName && <span>{acctName}</span>}
                  </div>
                )}
                <p class="poster-balance">{t('poster.balanceLine')}</p>
                <p class="poster-foot">{t('growth.footer')}</p>
              </article>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
