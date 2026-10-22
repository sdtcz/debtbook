/**
 * Region for wording (and the default currency): "Nigerian shops" only for users in Nigeria,
 * neutral "small shops" everywhere else.
 *
 * Order: cached /api/geo answer (country from the hosting edge, works offline once cached)
 * → device hints (Africa/Lagos time zone, an en-NG / *-NG locale) → neutral (null).
 */
import { setRegionNigeria } from '../i18n';

const KEY = 'bashibook-region'; // { c: "NG" | null, at: ms }
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

type Cached = { c: string | null; at: number };

function readCache(): Cached | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Cached | null;
    return v && typeof v.at === 'number' && (v.c === null || /^[A-Z]{2}$/.test(v.c)) ? v : null;
  } catch {
    return null;
  }
}

/** Nigeria hint from the device alone: time zone or a *-NG language tag. */
export function deviceSaysNigeria(
  timeZone = safeTimeZone(),
  languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [],
): boolean {
  if (timeZone === 'Africa/Lagos') return true;
  return languages.some((l) => /-NG$/i.test(l || ''));
}

function safeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Best known ISO country, or null (neutral). Geo answer wins over device hints. */
export function getCountry(): string | null {
  const cached = readCache();
  if (cached?.c) return cached.c;
  if (deviceSaysNigeria()) return 'NG';
  return null;
}

export function isNigeria(): boolean {
  return getCountry() === 'NG';
}

/** Apply the current region to the i18n {{shops}} placeholder. */
export function applyRegion(): void {
  setRegionNigeria(isNigeria());
}

/**
 * Ask /api/geo once a week when online; cache the answer on the phone. Never throws.
 * Pass fetcher for tests.
 */
export async function refreshRegion(fetcher: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const cached = readCache();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if ((cached && now - cached.at < MAX_AGE) || offline) {
    applyRegion();
    return getCountry();
  }
  try {
    const res = await fetcher('/api/geo', { cache: 'no-store' });
    const body = (await res.json()) as { country?: unknown };
    const c = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : null;
    if (res.ok && c) localStorage.setItem(KEY, JSON.stringify({ c, at: now }));
  } catch {
    /* offline / blocked: keep device hints */
  }
  applyRegion();
  return getCountry();
}
