/**
 * Growth loops (privacy-first, offline):
 *  - brand footer on customer-facing messages (toggle, default on)
 *  - tagged links (?app=1&src=…&ref=…) built from PUBLIC_APP_URL
 *  - first-touch attribution stored on this device only (no PII, never uploaded)
 *  - "Invite a trader" message with a random device ref code (not the shop name)
 */
import { PUBLIC_APP_URL } from '../config';
import { t } from '../i18n';

export type LinkSource =
  | 'rem' // reminders / receipts / statements
  | 'payme' // Pay-me page CTA
  | 'inv' // invite a trader
  | 'dig' // morning digest
  | 'poster'
  | 'status'
  | 'paid'; // "tell a shop" after a customer pays in full

const FOOTER_KEY = 'bashibook-brand-footer';
const ATTR_KEY = 'bashibook-attribution';
const REF_KEY = 'bashibook-ref-code';
const TAG_RE = /^[a-z0-9-]{1,32}$/; // fits "kippa-" + a 20-char source from the SEO page

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function sanitizeTag(v: string | null | undefined): string | null {
  const s = (v || '').trim().toLowerCase();
  return TAG_RE.test(s) ? s : null;
}

/** App link that always opens the app (not the desktop showcase), with tags. */
export function appLink(src: LinkSource, ref?: string | null): string {
  const q = new URLSearchParams();
  q.set('app', '1');
  q.set('src', src);
  const r = sanitizeTag(ref);
  if (r) q.set('ref', r);
  return `${PUBLIC_APP_URL}/?${q.toString()}`;
}

/* ── Brand footer ─────────────────────────────────────────────────────── */

export function brandFooterEnabled(): boolean {
  return ls()?.getItem(FOOTER_KEY) !== '0';
}

export function setBrandFooterEnabled(on: boolean): void {
  try {
    ls()?.setItem(FOOTER_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** One short, factual line after a blank line: "Recorded in BashiBook · free credit book for shops <link>". */
export function brandFooterLines(src: LinkSource = 'rem'): string[] {
  if (!brandFooterEnabled()) return [];
  return ['', `${t('growth.footer')} ${appLink(src)}`];
}

/** Host-only footer for PDFs (no tracking query), e.g. "bashibook.app". */
export function brandFooterHost(): string {
  return brandFooterEnabled() ? PUBLIC_APP_URL.replace(/^https?:\/\//, '') : '';
}

export function withBrandFooter(message: string, src: LinkSource = 'rem'): string {
  const lines = brandFooterLines(src);
  return lines.length ? `${message}\n${lines.join('\n')}` : message;
}

/* ── Attribution (P7) ─────────────────────────────────────────────────── */

export interface Attribution {
  src?: string;
  ref?: string;
  at: number;
}

/** Read src/ref from the URL query on first open; keep the first touch only. */
export function captureAttribution(href = typeof location !== 'undefined' ? location.href : ''): Attribution | null {
  const store = ls();
  if (!store || !href) return null;
  let src: string | null = null;
  let ref: string | null = null;
  try {
    // Only the query string: the hash's ?ref= is reserved for Stripe checkout
    // verification (#/pro?ref=cs_…) and must never be read as attribution.
    const u = new URL(href);
    src = sanitizeTag(u.searchParams.get('src'));
    ref = sanitizeTag(u.searchParams.get('ref'));
  } catch {
    return getAttribution();
  }
  const existing = getAttribution();
  if (existing || (!src && !ref)) return existing;
  const rec: Attribution = { at: Date.now(), ...(src ? { src } : {}), ...(ref ? { ref } : {}) };
  try {
    store.setItem(ATTR_KEY, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
  return rec;
}

export function getAttribution(): Attribution | null {
  try {
    const raw = ls()?.getItem(ATTR_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Attribution;
    return v && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Short "src/ref" label for feedback messages (no PII). */
export function attributionLabel(): string {
  const a = getAttribution();
  if (!a) return '';
  return [a.src, a.ref].filter(Boolean).join('/');
}

/* ── Invite a trader (P3) ─────────────────────────────────────────────── */

/** Random per-device referral code like "bb-k3f9q2" (no shop name / phone). */
export function myRefCode(): string {
  const store = ls();
  const existing = sanitizeTag(store?.getItem(REF_KEY));
  if (existing) return existing;
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(6);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const code = `bb-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
  try {
    store?.setItem(REF_KEY, code);
  } catch {
    /* ignore */
  }
  return code;
}

export function buildInviteMessage(ref = myRefCode(), src: LinkSource = 'inv'): string {
  return `${t('growth.inviteMessage')}\n${appLink(src, ref)}`;
}

export function openInviteWhatsApp(): void {
  const url = `https://wa.me/?text=${encodeURIComponent(buildInviteMessage())}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ── "Tell a shop" after a customer pays in full ──────────────────────── */

const PAID_INVITE_KEY = 'bashibook-paid-invite';
/** Ask at most once per 14 days; stop for good after one share or two "Not now". */
export const PAID_INVITE_GAP_MS = 14 * 24 * 60 * 60 * 1000;
export const PAID_INVITE_MAX_SKIPS = 2;

interface PaidInviteState {
  shownAt?: number;
  skips?: number;
  shared?: boolean;
}

function readPaidInvite(): PaidInviteState {
  try {
    const v = JSON.parse(ls()?.getItem(PAID_INVITE_KEY) || '{}') as PaidInviteState;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writePaidInvite(v: PaidInviteState): void {
  try {
    ls()?.setItem(PAID_INVITE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/**
 * Happy moment = a payment that takes a customer from owing (> 0) to settled (<= 0).
 * Only then, and only if the shop hasn't shared from here, skipped twice, or seen it in 14 days.
 */
export function shouldShowPaidInvite(opts: { beforeKobo: number | null; afterKobo: number; now?: number }): boolean {
  if (opts.beforeKobo == null || !(opts.beforeKobo > 0) || opts.afterKobo > 0) return false;
  if (!ls()) return false;
  const st = readPaidInvite();
  if (st.shared || (st.skips || 0) >= PAID_INVITE_MAX_SKIPS) return false;
  const now = opts.now ?? Date.now();
  return !(st.shownAt && now - st.shownAt < PAID_INVITE_GAP_MS);
}

export function markPaidInviteShown(now = Date.now()): void {
  writePaidInvite({ ...readPaidInvite(), shownAt: now });
}

export function markPaidInviteSkipped(): void {
  const st = readPaidInvite();
  writePaidInvite({ ...st, skips: (st.skips || 0) + 1 });
}

/** Opens WhatsApp with the usual invite, tagged src=paid so this loop can be counted on its own. */
export function openPaidInviteWhatsApp(): void {
  writePaidInvite({ ...readPaidInvite(), shared: true });
  const url = `https://wa.me/?text=${encodeURIComponent(buildInviteMessage(myRefCode(), 'paid'))}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ── Backup nudge (P10) ───────────────────────────────────────────────── */

const LAST_BACKUP_KEY = 'bashibook-last-backup-at';
const NUDGE_DISMISS_KEY = 'bashibook-backup-nudge-dismissed-at';
const DAY = 24 * 60 * 60 * 1000;

export function rememberBackupExported(at = Date.now()): void {
  try {
    ls()?.setItem(LAST_BACKUP_KEY, String(at));
  } catch {
    /* ignore */
  }
}

export function dismissBackupNudge(at = Date.now()): void {
  try {
    ls()?.setItem(NUDGE_DISMISS_KEY, String(at));
  } catch {
    /* ignore */
  }
}

/** Show after 10+ customers when no backup file (or cloud backup) in the last 30 days. */
export function shouldShowBackupNudge(opts: {
  customerCount: number;
  cloudBackupAt?: number;
  now?: number;
}): boolean {
  const now = opts.now ?? Date.now();
  if (opts.customerCount < 10) return false;
  const store = ls();
  const last = Math.max(Number(store?.getItem(LAST_BACKUP_KEY) || 0), opts.cloudBackupAt || 0);
  if (last && now - last < 30 * DAY) return false;
  const dismissed = Number(store?.getItem(NUDGE_DISMISS_KEY) || 0);
  if (dismissed && now - dismissed < 7 * DAY) return false;
  return true;
}

const INVITE_DISMISS_KEY = 'bashibook-invite-card-dismissed';
export function inviteCardDismissed(): boolean {
  return ls()?.getItem(INVITE_DISMISS_KEY) === '1';
}
export function dismissInviteCard(): void {
  try {
    ls()?.setItem(INVITE_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}
