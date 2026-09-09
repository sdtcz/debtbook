export type Route =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'customer-new' }
  | { name: 'customer'; id: string }
  | { name: 'customer-edit'; id: string }
  | { name: 'entry-new'; id: string; type?: 'credit' | 'payment' }
  | { name: 'settings' };

export function parseHash(): Route {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'setup') return { name: 'setup' };
  if (parts[0] === 'settings') return { name: 'settings' };
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
