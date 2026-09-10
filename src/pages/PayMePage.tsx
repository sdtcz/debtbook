import { useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';
import { formatNaira } from '../lib/money';
import type { PayMeRoute } from '../lib/router';

interface Props {
  route: PayMeRoute;
  toast?: (msg: string) => void;
}

export function PayMePage({ route, toast }: Props) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const amount = Math.max(0, route.amountKobo);
  const shopName = route.shop.trim() || t('payme.shopFallback');
  const hasBank = Boolean(route.bank || route.acct || route.accountName);
  const hasLink = Boolean(route.link.trim());

  const copyAcct = async () => {
    if (!route.acct) return;
    try {
      await navigator.clipboard.writeText(route.acct);
      setCopied(true);
      toast?.(t('payme.copiedAcct'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.(t('payme.copyFailed'));
    }
  };

  const openLink = () => {
    const url = route.link.trim();
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div class="payme-screen">
      <div class="payme-card">
        <div class="payme-brand">BashiBook</div>
        <h1 class="payme-title">{t('payme.pageTitle')}</h1>
        <p class="payme-shop">{shopName}</p>

        <div class="payme-amount-block">
          <div class="payme-amount-label">{t('payme.amountDue')}</div>
          <div class="payme-amount">{formatNaira(amount)}</div>
          {route.customer.trim() ? (
            <div class="payme-customer">
              {t('payme.forCustomer', { name: route.customer.trim() })}
            </div>
          ) : null}
        </div>

        {hasBank ? (
          <div class="payme-bank card">
            {route.bank ? (
              <div class="payme-bank-row">
                <span class="muted">{t('payme.bank')}</span>
                <strong>{route.bank}</strong>
              </div>
            ) : null}
            {route.acct ? (
              <div class="payme-bank-row">
                <span class="muted">{t('payme.accountNumber')}</span>
                <strong class="payme-acct">{route.acct}</strong>
              </div>
            ) : null}
            {route.accountName ? (
              <div class="payme-bank-row">
                <span class="muted">{t('payme.accountName')}</span>
                <strong>{route.accountName}</strong>
              </div>
            ) : null}
            {route.acct ? (
              <button
                type="button"
                class="btn btn-primary payme-copy-btn"
                onClick={copyAcct}
              >
                {copied ? t('payme.copied') : t('payme.copyAccount')}
              </button>
            ) : null}
          </div>
        ) : null}

        {hasLink ? (
          <button type="button" class="btn btn-secondary payme-link-btn" onClick={openLink}>
            {t('payme.openPaymentLink')}
          </button>
        ) : null}

        {!hasBank && !hasLink ? (
          <p class="muted payme-empty">{t('payme.noDetails')}</p>
        ) : null}

        <p class="payme-note muted">{t('payme.manualNote')}</p>
      </div>
    </div>
  );
}
