import { currencySymbol } from '../lib/money';
import { defaultCurrency } from '../lib/currency';
import { useEffect, useState } from 'preact/hooks';
import { wantsSaveData } from '../lib/saveData';
import { PUBLIC_APP_LABEL, PUBLIC_APP_URL } from '../config';
import { appEmbedUrl, setForceApp } from '../lib/viewportMode';
import { QrCode } from '../components/QrCode';
import { BrandLockup } from '../components/BrandLockup';
import { useLocale } from '../hooks/useLocale';
import { isRegionNigeria, t as tr } from '../i18n';

const FEATURES = [
  {
    icon: '📴',
    title: 'Offline-first',
    body: 'Works offline once opened. Your ledger lives on the phone in IndexedDB.',
  },
  {
    icon: '💬',
    title: 'WhatsApp remind',
    body: 'One tap to nudge customers over WhatsApp (SMS / share fallback).',
  },
  {
    icon: '☁️',
    title: 'Free + Pro backup',
    body: 'Local JSON backup free; encrypted cloud backup on Pro.',
  },
  {
    icon: '🌍',
    title: 'Hausa & Yoruba',
    body: 'English, Hausa, and Yoruba — switch in Settings.',
  },
  {
    icon: '📇',
    title: 'Contacts pick (Android)',
    body: 'Add customers from the phone book when the browser allows it.',
  },
] as const;

type Props = {
  onUseAppHere: () => void;
};

export function LandingPage({ onUseAppHere }: Props) {
  // Canonical public URL (src/config.ts) — never the raw deployment host.
  const href = `${PUBLIC_APP_URL}/`;
  // Save-Data: the live preview loads a whole second copy of the app, so only on tap.
  const [preview, setPreview] = useState(() => !wantsSaveData());
  const embed = typeof window !== 'undefined' ? appEmbedUrl() : '/?app=1#/';
  // Landing copy is English; {{shops}} is "Nigerian shops" only for visitors in Nigeria.
  useLocale(); // re-render when the region answer arrives
  const ng = isRegionNigeria();
  const enShops = tr(ng ? 'region.shopsNG' : 'region.shops', undefined, 'en');
  const seo = ng ? '/ng' : '';
  const sym = currencySymbol(defaultCurrency(ng));

  useEffect(() => {
    // Anonymous channel count (event + src tag only), once per device per day.
    let src: string | null = null;
    try {
      src = new URL(location.href).searchParams.get('src');
    } catch {
      /* ignore */
    }
    void import('../lib/hit').then((m) => m.hit('view_home', { daily: true, src })).catch(() => {});
  }, []);

  const openAppHome = () => {
    setForceApp(true);
    try {
      window.location.hash = '#/';
    } catch {
      /* ignore */
    }
    onUseAppHere();
  };

  const previewInBrowser = () => {
    const el = document.getElementById('landing-phone-stage');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div class="landing">
      <div class="landing-bg" aria-hidden="true">
        <div class="landing-orb landing-orb-a" />
        <div class="landing-orb landing-orb-b" />
        <div class="landing-orb landing-orb-c" />
        <div class="landing-grid" />
        <div class="landing-noise" />
        <div class="landing-naira-wm">{sym}</div>
      </div>

      <nav class="landing-nav">
        <div class="landing-nav-brand">
          <BrandLockup reverse />
          <span class="landing-tag-chip">{ng ? 'Nigeria · ₦ · PWA' : 'Works offline · PWA'}</span>
        </div>
        <div class="landing-nav-actions">
          <button type="button" class="landing-nav-ghost" onClick={previewInBrowser}>
            Preview in browser
          </button>
          <button type="button" class="landing-nav-primary" onClick={openAppHome}>
            Open app home
          </button>
        </div>
      </nav>

      <div class="landing-shell">
        <section class="landing-narrative landing-soft-glow">
          <section class="glow-crest-hero" aria-labelledby="landing-title">
            <div class="glow-crest" aria-hidden="true">
              {sym}
            </div>
            <p class="glow-kicker">Offline credit ledger</p>
            <h1 id="landing-title" class="landing-title">
              Track bashi.
              <br />
              <span class="landing-title-accent">Remind. Recover.</span>
            </h1>
            <p class="glow-hint">
              Offline credit (bashi) book for {enShops} — track who owes what,
              remind on WhatsApp, back up when you are ready.
            </p>
          </section>

          <div class="landing-cta-row">
            <button type="button" class="landing-cta" onClick={openAppHome}>
              Open app home
            </button>
            <a class="landing-cta-secondary" href={href}>
              Open on your phone
            </a>
            <button type="button" class="landing-linkish" onClick={previewInBrowser}>
              Preview in browser
            </button>
          </div>

          <ul class="landing-features landing-features-bento landing-features-soft">
            {FEATURES.map((f) => (
              <li key={f.title} class="landing-feature-card">
                <span class="landing-feature-crest" aria-hidden="true">
                  {f.icon}
                </span>
                <div class="landing-feature-body">
                  <strong>{f.title}</strong>
                  <span>{f.body}</span>
                </div>
              </li>
            ))}
          </ul>

          <div class="landing-qr-block landing-qr-soft">
            <QrCode class="landing-qr" value={href} size={168} label="QR code to open BashiBook" />
            <div class="landing-qr-meta">
              <p class="landing-qr-label">Scan to open on your phone</p>
              <a class="landing-url" href={href}>
                Open {PUBLIC_APP_LABEL} →
              </a>
              <p class="landing-qr-hint">Best experience as an installed PWA on Android.</p>
            </div>
          </div>

          <footer class="landing-footer">
            <p>Bashi = debt (Hausa). Not affiliated with US DebtBook SaaS.</p>
            <p>
              <a class="landing-footer-link" href={`${seo}/kippa-alternative`}>
                Looking for a Kippa alternative?
              </a>
            </p>
            <p>
              <a class="landing-footer-link" href={`${seo}/credit-book-app`}>
                Free credit book app for {enShops}
              </a>
            </p>
          </footer>
        </section>

        <aside class="landing-stage" id="landing-phone-stage">
          <div class="landing-stage-glow" aria-hidden="true" />
          <div class="phone-frame" aria-label="Live BashiBook preview">
            <div class="phone-notch" aria-hidden="true" />
            {preview ? (
              <iframe
                class="phone-screen"
                title="BashiBook app preview"
                src={embed}
                allow="clipboard-write"
              />
            ) : (
              <button type="button" class="btn btn-primary landing-preview-btn" onClick={() => setPreview(true)}>
                Show live preview
              </button>
            )}
          </div>
          <div class="landing-phone-reflect" aria-hidden="true" />
          <p class="landing-stage-caption">Live preview · tap around inside the phone</p>
        </aside>
      </div>
    </div>
  );
}
