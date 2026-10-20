export type PayMeRoute = {
  name: 'payme';
  shop: string;
  amountKobo: number;
  bank: string;
  acct: string;
  /** Account name */
  accountName: string;
  link: string;
  customer: string;
};

export type Route =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'customer-new' }
  | { name: 'customer'; id: string }
  | { name: 'customer-edit'; id: string }
  | { name: 'entry-new'; id: string; type?: 'credit' | 'payment' }
  | { name: 'settings' }
  | { name: 'pro' }
  | { name: 'pay-details' }
  | { name: 'poster' }
  | { name: 'privacy' }
  | { name: 'reports' }
  | PayMeRoute;

function parsePayMeFromQuery(queryPart: string | undefined): PayMeRoute {
  const q = new URLSearchParams(queryPart || '');
  const amountRaw = q.get('amountKobo') || q.get('amount') || '0';
  const amountKobo = Number.parseInt(amountRaw, 10);
  return {
    name: 'payme',
    shop: q.get('shop') || '',
    amountKobo: Number.isFinite(amountKobo) ? amountKobo : 0,
    bank: q.get('bank') || '',
    acct: q.get('acct') || '',
    accountName: q.get('name') || '',
    link: q.get('link') || '',
    customer: q.get('customer') || '',
  };
}

/** True when hash path is /payme (public customer payment page). */
export function isPayMeHash(hash = typeof location !== 'undefined' ? location.hash : ''): boolean {
  const raw = (hash || '#/').replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  const parts = path.split('/').filter(Boolean);
  return parts[0] === 'payme';
}

export function parseHash(): Route {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || '/';
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'payme') return parsePayMeFromQuery(queryPart);
  if (parts[0] === 'setup') return { name: 'setup' };
  if (parts[0] === 'pay-details' && parts[1] === 'poster') return { name: 'poster' };
  if (parts[0] === 'pay-details') return { name: 'pay-details' };
  if (parts[0] === 'privacy') return { name: 'privacy' };
  if (parts[0] === 'reports') return { name: 'reports' };
  if (parts[0] === 'settings' && parts[1] === 'pro') return { name: 'pro' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'pro') return { name: 'pro' };
  if (parts[0] === 'customers' && parts[1] === 'new') return { name: 'customer-new' };
  if (parts[0] === 'customers' && parts[1] && parts[2] === 'edit') {
    return { name: 'customer-edit', id: parts[1] };
  }
  if (parts[0] === 'customers' && parts[1] && parts[2] === 'entry') {
    const type =
      parts[3] === 'payment' ? 'payment' : parts[3] === 'credit' ? 'credit' : undefined;
    return { name: 'entry-new', id: parts[1], type };
  }
  if (parts[0] === 'customers' && parts[1]) {
    return { name: 'customer', id: parts[1] };
  }
  return { name: 'home' };
}

/* ── History-aware navigation ─────────────────────────────────────────────
 * We keep a depth counter in history.state so the in-app Back button can call
 * history.back() (matching the Android hardware / browser back button) when
 * there is in-app history, and fall back to a sensible parent route when the
 * page was opened directly (deep link, PWA cold start).
 */

type NavState = { bbDepth?: number } | null;

function currentDepth(): number {
  try {
    const st = history.state as NavState;
    return st && typeof st.bbDepth === 'number' ? st.bbDepth : 0;
  } catch {
    return 0;
  }
}

function toHash(to: string): string {
  return to.startsWith('#') ? to : `#${to}`;
}

function fireHashChange(): void {
  try {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch {
    window.dispatchEvent(new Event('hashchange'));
  }
}

/**
 * Go to an in-app route. `replace` swaps the current history entry instead of
 * pushing (use after a form save so Back does not reopen the form).
 */
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = toHash(to);
  if (location.hash === hash && !opts.replace) return;
  try {
    const depth = currentDepth();
    if (opts.replace) {
      history.replaceState({ bbDepth: depth }, '', hash);
    } else {
      history.pushState({ bbDepth: depth + 1 }, '', hash);
    }
    fireHashChange();
  } catch {
    location.hash = hash;
  }
}

/** True when Back can stay inside the app (there is an in-app entry behind us). */
export function canGoBack(): boolean {
  return currentDepth() > 0;
}

/** In-app Back: history.back() when possible, otherwise replace with `fallback`. */
export function goBack(fallback = '/') {
  if (canGoBack()) {
    history.back();
    return;
  }
  navigate(fallback, { replace: true });
}

/** Jump to Home, unwinding in-app history so Android Back then exits cleanly. */
export function goHome() {
  const depth = currentDepth();
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const onHome = raw === '/' || raw === '';
  if (onHome) {
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
    return;
  }
  if (depth > 0) {
    const after = () => {
      window.removeEventListener('popstate', after);
      const now = (location.hash || '#/').replace(/^#/, '') || '/';
      if (now !== '/' && now !== '') navigate('/', { replace: true });
    };
    window.addEventListener('popstate', after);
    history.go(-depth);
    return;
  }
  navigate('/', { replace: true });
}

export function href(to: string): string {
  return toHash(to);
}

/** Parent route used when Back has no in-app history (deep links / cold start). */
export function parentRoute(route: Route): string {
  switch (route.name) {
    case 'customer-edit':
    case 'entry-new':
      return `/customers/${route.id}`;
    case 'pro':
    case 'pay-details':
    case 'privacy':
      return '/settings';
    default:
      return '/';
  }
}
