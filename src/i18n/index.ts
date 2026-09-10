import { en, type MessageKey } from './locales/en';
import { ha } from './locales/ha';
import { yo } from './locales/yo';

export type Locale = 'en' | 'ha' | 'yo';
export type { MessageKey };

const STORAGE_KEY = 'debtbook-locale'; // KEEP: avoid resetting user locale preference

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en: en as Record<MessageKey, string>,
  ha,
  yo,
};

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
  const changed = next !== current;
  current = next;
  if (!fromStorage) writeStored(current);
  applyDocumentLang(current);
  if (changed) {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }
  return current;
}

export function getLocale(): Locale {
  return current;
}

export function localeNativeName(locale: Locale = current): string {
  return catalogs[locale][`locale.name.${locale}` as MessageKey] || locale;
}

type Vars = Record<string, string | number>;

export function t(key: MessageKey, vars?: Vars, locale?: Locale): string {
  const loc = locale || current;
  let s = catalogs[loc][key] ?? catalogs.en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return s;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale)) return;
  const changed = locale !== current;
  current = locale;
  writeStored(locale);
  applyDocumentLang(current);
  if (changed) {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* ignore subscriber errors */
      }
    }
  }
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Hydrate from localStorage ASAP (shop sync happens later via initLocale)
initLocale();
