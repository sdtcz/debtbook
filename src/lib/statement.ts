import { t } from '../i18n';
import type { Customer, Entry, ShopProfile } from './types';
import { formatNaira } from './money';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Plain-text customer statement for share/copy */
export function buildStatement(
  shop: ShopProfile,
  customer: Customer,
  entries: Entry[],
  balanceKobo: number,
): string {
  const lines: string[] = [];
  lines.push(shop.name.toUpperCase());
  lines.push(t('statement.title'));
  lines.push('─'.repeat(28));
  lines.push(t('statement.customer', { name: customer.name }));
  if (customer.phone) lines.push(t('statement.phone', { phone: customer.phone }));
  lines.push(t('statement.date', { date: fmtDate(Date.now()) }));
  lines.push('');
  lines.push(t('statement.transactions'));
  lines.push('─'.repeat(28));

  const sorted = [...entries]
    .filter((e) => !e.deletedAt)
    .sort((a, b) => a.occurredAt - b.occurredAt);

  if (sorted.length === 0) {
    lines.push(t('statement.noTransactions'));
  } else {
    for (const e of sorted) {
      const sign = e.type === 'credit' ? '+' : '−';
      const label =
        e.type === 'credit' ? t('statement.credit') : t('statement.payment');
      lines.push(`${fmtDate(e.occurredAt)}`);
      lines.push(`  ${label}  ${sign}${formatNaira(e.amountKobo)}`);
      if (e.note) lines.push(t('statement.note', { note: e.note }));
    }
  }

  lines.push('─'.repeat(28));
  const abs = formatNaira(Math.abs(balanceKobo));
  if (balanceKobo > 0) {
    lines.push(t('statement.balanceOwed', { amount: abs }));
  } else if (balanceKobo < 0) {
    lines.push(t('statement.shopOwes', { amount: abs }));
  } else {
    lines.push(t('statement.balanceSettled'));
  }
  lines.push('');
  lines.push(t('statement.generated'));
  return lines.join('\n');
}

export async function shareOrCopyText(text: string, title: string): Promise<'share' | 'clipboard' | 'none'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text, title });
      return 'share';
    } catch {
      /* cancelled */
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      /* ignore */
    }
  }
  return 'none';
}
