import { en, type MessageKey } from './locales/en';

export type Locale = 'en' | 'ha' | 'yo';
export type { MessageKey };

const STORAGE_KEY = 'debtbook-locale'; // KEEP: avoid resetting user locale preference

type Catalog = Record<MessageKey, string>;

// English ships in the main bundle; Hausa/Yoruba are separate chunks fetched
// only when chosen (the service worker precaches them, so they work offline).
const catalogs: Partial<Record<Locale, Catalog>> = { en: en as Catalog };
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Catalog>> = {
  ha: () => import('./locales/ha').then((m) => m.ha),
  yo: () => import('./locales/yo').then((m) => m.yo),
};
const loading = new Map<Locale, Promise<void>>();

/** Make sure a locale's strings are loaded (resolves immediately for en / cached). */
export function loadLocale(locale: Locale): Promise<void> {
  if (catalogs[locale]) return Promise.resolve();
  let p = loading.get(locale);
  if (!p) {
    p = loaders[locale as Exclude<Locale, 'en'>]()
      .then((c) => {
        catalogs[locale] = c;
      })
      .finally(() => loading.delete(locale));
    loading.set(locale, p);
  }
  return p;
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

/** Switch once strings are ready; stays on the current language if the chunk fails to load. */
let wanted: Locale = 'en';
function switchTo(locale: Locale): Promise<void> {
  wanted = locale;
  const apply = () => {
    if (wanted !== locale) return; // a newer choice won the race
    const changed = locale !== current;
    current = locale;
    applyDocumentLang(current);
    if (changed) notify();
  };
  if (catalogs[locale]) {
    apply();
    return Promise.resolve();
  }
  return loadLocale(locale).then(apply, () => undefined);
}

export const LOCALE_OPTIONS: { id: Locale; nativeName: string }[] = [
  { id: 'en', nativeName: 'English' },
  { id: 'ha', nativeName: 'Hausa' },
  { id: 'yo', nativeName: 'Yorùbá' },
];

let current: Locale = 'en';
const listeners = new Set<() => void>();

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'ha' || v === 'yo';
}

function readStored(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore quota / private mode */
  }
}


function applyDocumentLang(locale: Locale): void {
  try {
    // Prefer en-NG so native date inputs lean toward dd/mm for Nigeria
    const lang = locale === 'en' ? 'en-NG' : locale === 'ha' ? 'ha-NG' : 'yo-NG';
    document.documentElement.lang = lang;
  } catch {
    /* ignore SSR / non-DOM */
  }
}

/** Call once at startup (and after shop load) to hydrate from storage / shop. */
export function initLocale(shopLocale?: string | null): Locale {
  const fromShop = isLocale(shopLocale) ? shopLocale : null;
  const fromStorage = readStored();
  // Prefer explicit localStorage; fall back to shop profile; default en
  const next = fromStorage || fromShop || 'en';
  if (!fromStorage) writeStored(next);
  void switchTo(next);
  return next;
}

/** Resolves when the stored language's strings are ready (await before first render). */
export function localeReady(): Promise<void> {
  const want = readStored() || current;
  return switchTo(want);
}

export function getLocale(): Locale {
  return current;
}

export function localeNativeName(locale: Locale = current): string {
  return (
    catalogs[locale]?.[`locale.name.${locale}` as MessageKey] ||
    LOCALE_OPTIONS.find((o) => o.id === locale)?.nativeName ||
    locale
  );
}

type Vars = Record<string, string | number>;

export function t(key: MessageKey, vars?: Vars, locale?: Locale): string {
  const loc = locale || current;
  let s = catalogs[loc]?.[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return s;
}

export function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return Promise.resolve();
  writeStored(locale);
  return switchTo(locale);
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Hydrate from localStorage ASAP (shop sync happens later via initLocale)
initLocale();
