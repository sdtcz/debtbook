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
    title: 'Works with no network',
    body: 'Works offline once opened. Your book stays on your phone. No sign-up.',
  },
  {
    icon: '💬',
    title: 'Remind in one tap',
    body: 'Send a polite WhatsApp reminder with the balance. SMS or share if there is no WhatsApp.',
  },
  {
    icon: '☁️',
    title: 'Never lose your book',
    body: 'Free backup file any time. Pro adds encrypted cloud backup and restore on a new phone.',
  },
  {
    icon: '🌍',
    title: 'Your language',
    body: 'English, Hausa and Yorùbá. Switch any time in Settings.',
  },
  {
    icon: '📇',
    title: 'Add from contacts',
    body: 'Pick customers from your phone book on Android.',
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

  // "Open on your phone" from a desktop: show the QR (the hash is the app router, so no #anchor).
  const showQr = () => {
    document.getElementById('landing-qr')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div class="landing">
      <div class="landing-bg" aria-hidden="true">
        <div class="landing-orb landing-orb-a" />
        <div class="landing-orb landing-orb-b" />
        <div class="landing-orb landing-orb-c" />
        <div class="landing-grid" />
        <div class="landing-noise" />
      </div>

      <nav class="landing-nav">
        <div class="landing-nav-brand">
          <BrandLockup reverse />
          <span class="landing-tag-chip">{ng ? 'Nigeria · ₦ · Free' : 'Free · Works offline once opened'}</span>
        </div>
        <div class="landing-nav-actions">
          <button type="button" class="landing-nav-ghost" onClick={previewInBrowser}>
            Preview in browser
          </button>
          <button type="button" class="landing-nav-primary" onClick={openAppHome}>
            Start free
          </button>
        </div>
      </nav>

      <div class="landing-shell">
        <section class="landing-narrative landing-soft-glow">
          <section class="glow-crest-hero" aria-labelledby="landing-title">
            <div class="glow-crest glow-crest-logo" aria-hidden="true">
              <img src="/icons/icon.svg" alt="" width="64" height="64" decoding="async" />
            </div>
            <p class="glow-kicker">Free credit book</p>
            <h1 id="landing-title" class="landing-title">
              Know who owes you.
              <br />
              <span class="landing-title-accent">Get paid on WhatsApp.</span>
            </h1>
            <p class="glow-hint">
              A free credit (bashi) book for {enShops}. Write it once, remind in
              one tap, keep a backup. Works offline once opened.
            </p>
          </section>

          <div class="landing-cta-row">
            <button type="button" class="landing-cta" onClick={openAppHome}>
              Start my book, free
            </button>
            <button type="button" class="landing-cta-secondary" onClick={showQr}>
              Open on your phone
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

          <div class="landing-qr-block landing-qr-soft" id="landing-qr">
            <QrCode class="landing-qr" value={href} size={168} label="QR code to open BashiBook" />
            <div class="landing-qr-meta">
              <p class="landing-qr-label">Scan to open on your phone</p>
              <a class="landing-url" href={href}>
                Open {PUBLIC_APP_LABEL} →
              </a>
              <p class="landing-qr-hint">Add it to your home screen to open it in one tap.</p>
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
