/**
 * Pay-me links — shop payment details + WhatsApp/share request for customer debts.
 * No Paystack charge API; shopkeeper records payment manually after transfer.
 *
 * Amount in URLs uses **kobo** (`amountKobo` query int) for precision.
 */

import { t } from '../i18n';
import { formatNaira } from './money';
import { buildWhatsAppUri } from './sms';
import type { ShopProfile } from './types';

export type PayMeShopFields = Pick<
  ShopProfile,
  'name' | 'payBankName' | 'payAccountNumber' | 'payAccountName' | 'payLinkUrl'
>;

/** True when the shop has an account number or a payment-link URL. */
export function hasPayMeDetails(
  shop: Pick<ShopProfile, 'payAccountNumber' | 'payLinkUrl'> | null | undefined,
): boolean {
  if (!shop) return false;
  const acct = (shop.payAccountNumber || '').trim();
  const link = (shop.payLinkUrl || '').trim();
  return Boolean(acct || link);
}

export function buildPayMeMessage(opts: {
  shop: PayMeShopFields;
  customerName: string;
  balanceKobo: number;
  /** Public hash-route URL for the Pay-me page (preferred when available). */
  pageUrl?: string;
}): string {
  const amount = formatNaira(Math.abs(opts.balanceKobo));
  const lines: string[] = [];
  lines.push(
    t('payme.messageIntro', {
      customer: opts.customerName,
      shop: opts.shop.name,
      amount,
    }),
  );

  const bank = (opts.shop.payBankName || '').trim();
  const acct = (opts.shop.payAccountNumber || '').trim();
  const acctName = (opts.shop.payAccountName || '').trim();
  if (bank || acct || acctName) {
    lines.push('');
    lines.push(t('payme.messageBankHeader'));
    if (bank) lines.push(t('payme.messageBank', { bank }));
    if (acct) lines.push(t('payme.messageAcct', { acct }));
    if (acctName) lines.push(t('payme.messageAcctName', { name: acctName }));
  }

  const payLink = (opts.shop.payLinkUrl || '').trim();
  const pageUrl = (opts.pageUrl || '').trim();
  if (pageUrl || payLink) {
    lines.push('');
    if (pageUrl) {
      lines.push(t('payme.messagePageUrl', { url: pageUrl }));
    } else if (payLink) {
      lines.push(t('payme.messagePayLink', { url: payLink }));
    }
  }

  lines.push('');
  lines.push(t('payme.messageAsk'));
  return lines.join('\n');
}

/**
 * Build `#/payme?...` URL. Amount is **kobo** (`amountKobo`) for precision.
 * Params are encoded via URLSearchParams / encodeURIComponent.
 */
export function buildPayMePageUrl(opts: {
  origin: string;
  shop: PayMeShopFields;
  amountKobo: number;
  customerName?: string;
}): string {
  const q = new URLSearchParams();
  q.set('shop', opts.shop.name);
  q.set('amountKobo', String(Math.round(opts.amountKobo)));
  const bank = (opts.shop.payBankName || '').trim();
  const acct = (opts.shop.payAccountNumber || '').trim();
  const acctName = (opts.shop.payAccountName || '').trim();
  const link = (opts.shop.payLinkUrl || '').trim();
  const customer = (opts.customerName || '').trim();
  if (bank) q.set('bank', bank);
  if (acct) q.set('acct', acct);
  if (acctName) q.set('name', acctName);
  if (link) q.set('link', link);
  if (customer) q.set('customer', customer);
  const origin = opts.origin.replace(/\/$/, '');
  // URLSearchParams encodes; keep explicit encode for documentation parity
  return `${origin}/#/payme?${q.toString()}`;
}

export type PayMeSendResult = 'whatsapp' | 'sms' | 'share' | 'clipboard' | 'none';

/** WhatsApp-first send (like remindCustomer); includes payme page URL when origin known. */
export async function sendPayMeRequest(opts: {
  shop: PayMeShopFields;
  customerName: string;
  phone?: string;
  balanceKobo: number;
  /** Defaults to window.location.origin when in browser */
  origin?: string;
}): Promise<PayMeSendResult> {
  let pageUrl: string | undefined;
  const origin =
    opts.origin ||
    (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (origin) {
    pageUrl = buildPayMePageUrl({
      origin,
      shop: opts.shop,
      amountKobo: opts.balanceKobo,
      customerName: opts.customerName,
    });
  }

  const message = buildPayMeMessage({
    shop: opts.shop,
    customerName: opts.customerName,
    balanceKobo: opts.balanceKobo,
    pageUrl,
  });

  if (opts.phone) {
    const wa = buildWhatsAppUri(opts.phone, message);
    if (wa) {
      window.open(wa, '_blank', 'noopener,noreferrer');
      return 'whatsapp';
    }
    const encoded = encodeURIComponent(message);
    const digits = opts.phone.replace(/[^\d+]/g, '');
    window.location.href = digits
      ? `sms:${digits}?body=${encoded}`
      : `sms:?body=${encoded}`;
    return 'sms';
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text: message, title: t('payme.shareTitle') });
      return 'share';
    } catch {
      /* cancelled */
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(message);
      return 'clipboard';
    } catch {
      /* ignore */
    }
  }

  return 'none';
}

/** Parse payme hash query into display fields (no server). */
export function parsePayMeQuery(search: string): {
  shop: string;
  amountKobo: number;
  bank: string;
  acct: string;
  name: string;
  link: string;
  customer: string;
} {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const amountRaw = q.get('amountKobo') || q.get('amount') || '0';
  const amountKobo = Number.parseInt(amountRaw, 10);
  return {
    shop: q.get('shop') || '',
    amountKobo: Number.isFinite(amountKobo) ? amountKobo : 0,
    bank: q.get('bank') || '',
    acct: q.get('acct') || '',
    name: q.get('name') || '',
    link: q.get('link') || '',
    customer: q.get('customer') || '',
  };
}
