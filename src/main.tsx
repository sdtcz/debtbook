import { render } from 'preact';
import { App } from './App';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { normalizePaystackReturnUrl } from './lib/paystackReturn';

normalizePaystackReturnUrl();

registerSW({ immediate: true });

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
