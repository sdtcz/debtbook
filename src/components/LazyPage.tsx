import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';
import { LoadError } from './LoadError';

/**
 * Code-split a page without preact/compat. The chunk is fetched on first
 * render (and precached by the service worker, so it also works offline).
 */
export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> & { preload: () => void } {
  let cached: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  // Flaky 2G: retry twice by itself (1.5 s, then 4 s) before showing the "Try again" screen.
  const loadWithRetry = (left = 2, wait = 1500): Promise<ComponentType<P>> =>
    load().catch((e) =>
      left > 0 ? new Promise<void>((r) => setTimeout(r, wait)).then(() => loadWithRetry(left - 1, wait * 2.7)) : Promise.reject(e),
    );
  const get = () => {
    pending ??= loadWithRetry().then((c) => (cached = c));
    pending.catch(() => {
      pending = null;
    });
    return pending;
  };
  function LazyPage(props: P) {
    const { t } = useLocale();
    const [C, setC] = useState<ComponentType<P> | null>(() => cached);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (C) return;
      let alive = true;
      get()
        .then((c) => alive && setC(() => c))
        .catch(() => alive && setFailed(true));
      return () => {
        alive = false;
      };
    }, [attempt]);
    if (C) return <C {...props} />;
    return (
      <div class="app-shell">
        <main class="main">
          {failed ? (
            <LoadError
              onRetry={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            />
          ) : (
            <div class="empty" aria-busy="true">
              {t('common.loading')}
            </div>
          )}
        </main>
      </div>
    );
  }
  return Object.assign(LazyPage, { preload: () => void get().catch(() => undefined) });
}
