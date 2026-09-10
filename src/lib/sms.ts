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
import { formatNaira } from './money';

export function buildRemindMessage(
  shopName: string,
  customerName: string,
  balanceKobo: number,
): string {
  const amount = formatNaira(Math.abs(balanceKobo));
  const vars = { customer: customerName, shop: shopName, amount };
  if (balanceKobo > 0) {
    return t('remind.owes', vars);
  }
  if (balanceKobo < 0) {
    return t('remind.youOwe', vars);
  }
  return t('remind.settled', vars);
}

/**
 * Normalize Nigeria phone to digits for wa.me:
 * strip non-digits; leading 0 → 234…; leave 234… as-is.
 */
export function normalizeNgWhatsAppDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = '234' + digits.slice(1);
  }
  if (digits.startsWith('234') && digits.length >= 12) return digits;
  // Already international without + or local without leading 0
  if (digits.length >= 10) return digits;
  return null;
}

export function buildWhatsAppUri(phone: string, body: string): string | null {
  const digits = normalizeNgWhatsAppDigits(phone);
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
    lines.push(`• ${row.name}: ${formatNaira(row.balanceKobo)}`);
  }
  lines.push('');
  lines.push(t('digest.messageFooter'));
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
