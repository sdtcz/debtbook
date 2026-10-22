/**
 * Remind helpers — WhatsApp-first for Nigeria, then SMS, then share/clipboard.
 *
 * ---------------------------------------------------------------------------
 * NEXT STEP — Africa's Talking (programmatic SMS)
 * ---------------------------------------------------------------------------
 * When a backend exists, replace or augment `remindCustomer` with an API call:
 *   POST /api/remind  { phone, message, customerId }
 * Keep this file as the single place that builds the message text.
 * ---------------------------------------------------------------------------
 */

import { t } from '../i18n';
import { appLink, withBrandFooter } from './growth';
import { formatMoney } from './money';
import { normalizeWhatsAppDigits } from './phone';
import { deviceLocale } from './dates';

export function buildRemindMessage(
  shopName: string,
  customerName: string,
  balanceKobo: number,
): string {
  const amount = formatMoney(Math.abs(balanceKobo));
  const vars = { customer: customerName, shop: shopName, amount };
  if (balanceKobo > 0) {
    return withBrandFooter(t('remind.owes', vars), 'rem');
  }
  if (balanceKobo < 0) {
    return withBrandFooter(t('remind.youOwe', vars), 'rem');
  }
  return withBrandFooter(t('remind.settled', vars), 'rem');
}

export function buildWhatsAppUri(phone: string, body: string): string | null {
  const digits = normalizeWhatsAppDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

/** Build sms: URI. Android uses ?body=, iOS often uses &body= after ; or ? */
export function buildSmsUri(phone: string | undefined, body: string): string {
  const encoded = encodeURIComponent(body);
  const digits = (phone || '').replace(/[^\d+]/g, '');
  if (digits) {
    return `sms:${digits}?body=${encoded}`;
  }
  return `sms:?body=${encoded}`;
}

export async function remindCustomer(opts: {
  shopName: string;
  customerName: string;
  phone?: string;
  balanceKobo: number;
}): Promise<'whatsapp' | 'sms' | 'share' | 'clipboard' | 'none'> {
  const message = buildRemindMessage(
    opts.shopName,
    opts.customerName,
    opts.balanceKobo,
  );

  // Prefer WhatsApp when we have a phone number (Nigeria-first)
  if (opts.phone) {
    const wa = buildWhatsAppUri(opts.phone, message);
    if (wa) {
      window.open(wa, '_blank', 'noopener,noreferrer');
      return 'whatsapp';
    }
    const uri = buildSmsUri(opts.phone, message);
    window.location.href = uri;
    return 'sms';
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text: message, title: t('remind.shareTitle') });
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

export function buildMorningDigestMessage(
  shopName: string,
  overdue: { name: string; balanceKobo: number }[],
): string {
  const lines: string[] = [];
  lines.push(t('digest.messageTitle', { shop: shopName }));
  lines.push(t('digest.messageCount', { n: overdue.length }));
  lines.push('');
  for (const row of overdue) {
    lines.push(`• ${row.name}: ${formatMoney(row.balanceKobo)}`);
  }
  lines.push('');
  lines.push(t('digest.messageFooter'));
  lines.push(appLink('dig'));
  return lines.join('\n');
}

/** Share morning chase list — WhatsApp compose (pick chat), then share/clipboard. */
export async function shareMorningDigest(opts: {
  shopName: string;
  overdue: { name: string; balanceKobo: number }[];
}): Promise<'whatsapp' | 'share' | 'clipboard' | 'none'> {
  const message = buildMorningDigestMessage(opts.shopName, opts.overdue);
  // Open WhatsApp with prefilled text; user picks self/staff chat
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  try {
    window.open(wa, '_blank', 'noopener,noreferrer');
    return 'whatsapp';
  } catch {
    /* fall through */
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text: message, title: t('digest.shareTitle') });
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

export async function copyMorningDigest(opts: {
  shopName: string;
  overdue: { name: string; balanceKobo: number }[];
}): Promise<boolean> {
  const message = buildMorningDigestMessage(opts.shopName, opts.overdue);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Entry receipt (OkCredit-style "both sides hold the record"): sent by the
 * shopkeeper over WhatsApp/SMS after recording a credit sale or payment.
 */
export function buildEntryReceiptMessage(opts: {
  shopName: string;
  customerName: string;
  type: 'credit' | 'payment';
  amountKobo: number;
  balanceKobo: number;
  note?: string;
  at?: number;
}): string {
  const amount = formatMoney(Math.abs(opts.amountKobo));
  const date = new Date(opts.at ?? Date.now()).toLocaleDateString(deviceLocale());
  const vars = { customer: opts.customerName, shop: opts.shopName, amount, date };
  const lines = [
    opts.type === 'credit' ? t('receipt.credit', vars) : t('receipt.payment', vars),
  ];
  const note = (opts.note || '').trim();
  if (note) lines.push(t('receipt.note', { note }));
  const bal = opts.balanceKobo;
  lines.push(
    bal > 0
      ? t('receipt.balanceOwed', { amount: formatMoney(bal) })
      : bal < 0
        ? t('receipt.balanceCredit', { amount: formatMoney(-bal) })
        : t('receipt.balanceSettled'),
  );
  lines.push(t('receipt.footer', { shop: opts.shopName }));
  return withBrandFooter(lines.join('\n'), 'rem');
}

/** Open WhatsApp (or SMS / share / clipboard) with a prepared message. */
export async function sendTextToCustomer(
  phone: string | undefined,
  message: string,
  title: string,
): Promise<'whatsapp' | 'sms' | 'share' | 'clipboard' | 'none'> {
  if (phone) {
    const wa = buildWhatsAppUri(phone, message);
    if (wa) {
      window.open(wa, '_blank', 'noopener,noreferrer');
      return 'whatsapp';
    }
    window.location.href = buildSmsUri(phone, message);
    return 'sms';
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text: message, title });
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
