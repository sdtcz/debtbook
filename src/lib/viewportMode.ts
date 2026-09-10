/** Desktop landing vs phone app mode for BashiBook. */

const FORCE_KEY = 'force-app';

export function isForcedApp(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    if (localStorage.getItem(FORCE_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Narrow phone / tablet portrait, or coarse pointer on a relatively narrow screen. */
export function isPhoneLikeViewport(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  if (window.matchMedia('(max-width: 640px)').matches) return true;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  return coarse && narrow;
}

export function shouldShowApp(): boolean {
  return isForcedApp() || isPhoneLikeViewport();
}

export function setForceApp(on: boolean): void {
  try {
    if (on) localStorage.setItem(FORCE_KEY, '1');
    else localStorage.removeItem(FORCE_KEY);
  } catch {
    /* ignore */
  }
}

/** Same-origin URL that always loads the real app (for iframe + deep links). */
export function appEmbedUrl(): string {
  const u = new URL(window.location.href);
  u.searchParams.set('app', '1');
  // Keep hash so deep links still work when forcing app on desktop.
  return u.pathname + u.search + (u.hash || '#/');
}
