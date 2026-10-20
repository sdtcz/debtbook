import { render } from 'preact';
import { App } from './App';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { normalizeCheckoutReturnUrl } from './lib/checkoutReturn';
import { captureAttribution } from './lib/growth';
import { navigate } from './lib/router';

normalizeCheckoutReturnUrl();
// First-touch src/ref tags (?app=1&src=…&ref=…) — stored on this device only.
captureAttribution();

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
if (root) {
  render(<App />, root);
}
