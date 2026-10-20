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
  const get = () => {
    pending ??= load().then((c) => (cached = c));
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
