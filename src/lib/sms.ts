/**
 * SMS / remind helpers
 *
 * MVP: opens the device SMS app via `sms:` URI with a prefilled body,
 * falling back to Web Share API when available.
 *
 * ---------------------------------------------------------------------------
 * NEXT STEP — Africa's Talking (programmatic SMS)
 * ---------------------------------------------------------------------------
 * When a backend exists, replace or augment `remindCustomer` with an API call:
 *
 *   POST /api/remind  { phone, message, customerId }
 *
 * Africa's Talking (https://africastalking.com) — Nigeria + many African markets:
 *   - Use their SMS API from a server (never put API keys in the PWA).
 *   - Queue the send in the sync outbox if offline; flush when online.
 *   - Keep this file as the single place that builds the message text so
 *     both the local `sms:` path and the AT path stay consistent.
 *
 * Interface note for later:
 *   export interface SmsProvider {
 *     send(to: string, body: string): Promise<{ ok: boolean; id?: string }>;
 *   }
 *   // AfricasTalkingSmsProvider implements SmsProvider on the server.
 * ---------------------------------------------------------------------------
 */

import { formatNaira } from './money';

export function buildRemindMessage(
  shopName: string,
  customerName: string,
  balanceKobo: number,
): string {
  const amount = formatNaira(Math.abs(balanceKobo));
  if (balanceKobo > 0) {
    return `Hello ${customerName}, this is a reminder from ${shopName}. Your outstanding balance is ${amount}. Please settle when you can. Thank you.`;
  }
  if (balanceKobo < 0) {
    return `Hello ${customerName}, this is ${shopName}. We owe you ${amount}. Please collect at your convenience. Thank you.`;
  }
  return `Hello ${customerName}, this is ${shopName}. Your account is settled. Thank you for your business.`;
}

/** Build sms: URI. Android uses ?body=, iOS often uses &body= after ; or ? */
export function buildSmsUri(phone: string | undefined, body: string): string {
  const encoded = encodeURIComponent(body);
  const digits = (phone || '').replace(/[^\d+]/g, '');
  if (digits) {
    // Common Android form; works on many devices
    return `sms:${digits}?body=${encoded}`;
  }
  return `sms:?body=${encoded}`;
}

export async function remindCustomer(opts: {
  shopName: string;
  customerName: string;
  phone?: string;
  balanceKobo: number;
}): Promise<'sms' | 'share' | 'clipboard' | 'none'> {
  const message = buildRemindMessage(
    opts.shopName,
    opts.customerName,
    opts.balanceKobo,
  );

  // Prefer native SMS compose when we have a phone number
  if (opts.phone) {
    const uri = buildSmsUri(opts.phone, message);
    window.location.href = uri;
    return 'sms';
  }

  // Web Share fallback
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text: message, title: 'Debt reminder' });
      return 'share';
    } catch {
      // user cancelled or share failed — try clipboard
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
