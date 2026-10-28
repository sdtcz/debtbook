import { render } from 'preact';
import { App } from './App';
import { PinPromptHost } from './components/PinPromptHost';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { normalizeCheckoutReturnUrl } from './lib/checkoutReturn';
import { captureAttribution } from './lib/growth';
import { navigate } from './lib/router';
import { localeReady } from './i18n';
import { applyRegion, refreshRegion } from './lib/region';
import { applySaveData } from './lib/saveData';
import { MOVE_OLD_ORIGIN } from './config';

normalizeCheckoutReturnUrl();
// First-touch src/ref tags (?app=1&src=…&ref=…) — stored on this device only.
captureAttribution();
// Region wording ("Nigerian shops" only in Nigeria) from the cached geo answer / device hints; refreshed after mount.
applyRegion();
applySaveData();

registerSW({ immediate: true });

// Route in-app hash links (<a href="#/…">) through the history-aware navigator
// so the header Back button and Android/browser Back stay in sync.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return;
  }
  const a = (e.target as Element | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
  if (!a || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href') || '#/');
});

const root = document.getElementById('app');
// Hausa/Yoruba users: wait for their strings (precached; ~instant offline) to avoid an English flash.
const start = (then?: () => void) => root && void localeReady().finally(() => (mount(root), then?.()));
if (location.origin === MOVE_OLD_ORIGIN && window.top === window) {
  // Old address: books stay here until moved (IndexedDB is per address); empty phones go to bashibook.app.
  import('./lib/moveOld')
    .then((m) => m.oldHostBoot().then((stay) => stay && start(m.mountMoveCard)))
    .catch(() => start());
} else if (location.hash.startsWith('#/move-in') && root) {
  void localeReady().finally(() => import('./lib/moveIn').then((m) => m.mountMoveIn(root), () => start()));
} else {
  start();
}

function mount(root: HTMLElement) {
  render(<App />, root);
  document.getElementById('boot')?.remove();
  const pinHost = document.createElement('div');
  pinHost.id = 'pin-prompt-root';
  document.body.appendChild(pinHost);
  render(<PinPromptHost />, pinHost);
  window.setTimeout(() => void refreshRegion(), 2000);
}
