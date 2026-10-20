import { useLocale } from '../hooks/useLocale';
import { goHome, navigate, type Route } from '../lib/router';

type TabId = 'home' | 'reports' | 'pay' | 'settings';

const TABS: { id: TabId; path: string; icon: string }[] = [
  { id: 'home', path: '/', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { id: 'reports', path: '/reports', icon: 'M4 20V11M10 20V5M16 20v-6M21 20H3' },
  { id: 'pay', path: '/pay-details', icon: 'M3 7h18v10H3zM7 12h.01M12 9.5v5M17 12h.01' },
  { id: 'settings', path: '/settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
];

export function activeTab(route: Route): TabId | null {
  switch (route.name) {
    case 'home':
    case 'customer':
    case 'suppliers':
    case 'supplier':
      return 'home';
    case 'pay-details':
      return 'pay';
    case 'reports':
      return 'reports';
    case 'pro':
    case 'settings':
    case 'privacy':
      return 'settings';
    default:
      return null;
  }
}

/** Routes that show the bottom tab bar (forms hide it to keep the keyboard area clear). */
export function showsTabBar(route: Route): boolean {
  return activeTab(route) !== null;
}

export function TabBar({ route }: { route: Route }) {
  const { t } = useLocale();
  const active = activeTab(route);
  const labels: Record<TabId, string> = {
    home: t('nav.home'),
    pay: t('nav.payMe'),
    reports: t('nav.reports'),
    settings: t('nav.settings'),
  };

  const go = (tab: (typeof TABS)[number]) => {
    if (tab.id === 'home') {
      goHome();
      return;
    }
    if (tab.id === active && route.name !== 'privacy' && route.name !== 'pro') {
      try {
        window.scrollTo({ top: 0 });
      } catch {
        /* ignore */
      }
      return;
    }
    // Home is the root: tabs opened from Home push (Back returns Home);
    // switching between other tabs replaces so Back still lands on Home.
    navigate(tab.path, { replace: route.name !== 'home' && route.name !== 'customer' });
  };

  return (
    <nav class="tabbar" aria-label={t('nav.label')}>
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            class={on ? 'tabbar-btn on' : 'tabbar-btn'}
            aria-current={on ? 'page' : undefined}
            onClick={() => go(tab)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d={tab.icon} />
            </svg>
            <span>{labels[tab.id]}</span>
          </button>
        );
      })}
    </nav>
  );
}
