import { render } from 'preact';
import { App } from './App';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { normalizeCheckoutReturnUrl } from './lib/checkoutReturn';

normalizeCheckoutReturnUrl();

registerSW({ immediate: true });

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
