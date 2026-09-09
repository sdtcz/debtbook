/** In-app feedback helpers — WhatsApp draft + clipboard, offline-friendly. */

export const FEEDBACK_TOPICS = [
  { id: 'slow', label: 'App feels slow' },
  { id: 'find-customer', label: 'Hard to find a customer' },
  { id: 'remind', label: 'Remind is awkward' },
  { id: 'backup', label: 'Backup is confusing' },
  { id: 'other', label: 'Something else' },
] as const;

export type FeedbackTopicId = (typeof FEEDBACK_TOPICS)[number]['id'];

export const FEEDBACK_SENT_KEY = 'debtbook-feedback-sent';

export function labelForTopic(id: FeedbackTopicId): string {
  return FEEDBACK_TOPICS.find((t) => t.id === id)?.label ?? id;
}

export function buildFeedbackMessage(opts: {
  topicIds: FeedbackTopicId[];
  note?: string;
  shopName?: string;
  plan?: 'Free' | 'Pro' | string;
  customerCount?: number;
  appVersion?: string;
}): string {
  const topics =
    opts.topicIds.length > 0
      ? opts.topicIds.map(labelForTopic).join(', ')
      : '(none selected)';
  const lines: string[] = [
    'DebtBook feedback',
    `Topics: ${topics}`,
  ];
  const note = opts.note?.trim();
  if (note) lines.push(`Note: ${note}`);
  const shop = opts.shopName?.trim();
  if (shop) lines.push(`Shop: ${shop}`);
  if (opts.plan) lines.push(`Plan: ${opts.plan}`);
  if (
    typeof opts.customerCount === 'number' &&
    Number.isFinite(opts.customerCount) &&
    opts.customerCount >= 0
  ) {
    lines.push(`Customers: ~${Math.round(opts.customerCount)}`);
  }
  lines.push(`App: ${opts.appVersion || 'DebtBook'}`);
  return lines.join('\n');
}

/** Opens WhatsApp with a prefilled draft; user picks the recipient (no fixed number). */
export function openFeedbackWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function copyFeedback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  // Fallback for older WebViews / non-secure contexts
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function rememberFeedbackSent(at = Date.now()): void {
  try {
    localStorage.setItem(FEEDBACK_SENT_KEY, String(at));
  } catch {
    /* ignore quota / private mode */
  }
}
