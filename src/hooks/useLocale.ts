import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  getLocale,
  setLocale as setLocaleCore,
  subscribeLocale,
  t as tCore,
  type Locale,
  type MessageKey,
} from '../i18n';

type Vars = Record<string, string | number>;

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  useEffect(() => subscribeLocale(() => setLocaleState(getLocale())), []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleCore(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => tCore(key, vars),
    // re-bind when locale changes so callers that close over t still refresh
    [locale],
  );

  return { locale, setLocale, t };
}
