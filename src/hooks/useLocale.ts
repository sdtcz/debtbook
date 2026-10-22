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
  // Bumped on every i18n change (language or region wording) so pages re-render.
  const [rev, setRev] = useState(0);

  useEffect(
    () =>
      subscribeLocale(() => {
        setLocaleState(getLocale());
        setRev((n) => n + 1);
      }),
    [],
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleCore(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => tCore(key, vars),
    // re-bind when locale changes so callers that close over t still refresh
    [locale, rev],
  );

  return { locale, setLocale, t };
}
