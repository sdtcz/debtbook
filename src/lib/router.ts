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
  if (parts[0] === 'pay-details') return { name: 'pay-details' };
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

export function navigate(to: string) {
  location.hash = to.startsWith('#') ? to : `#${to}`;
}

export function href(to: string): string {
  return to.startsWith('#') ? to : `#${to}`;
}
