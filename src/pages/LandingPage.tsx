import { appEmbedUrl, setForceApp } from '../lib/viewportMode';

const FEATURES = [
  {
    icon: '📴',
    title: 'Offline-first',
    body: 'Works without data. Your ledger lives on the phone in IndexedDB.',
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
  const href =
    typeof window !== 'undefined' ? window.location.href.split('#')[0]! : 'https://debtbook-neon.vercel.app/';
  const displayUrl = href.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=168x168&margin=8&data=${encodeURIComponent(href)}`;
  const embed = typeof window !== 'undefined' ? appEmbedUrl() : '/?app=1#/';

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
        <div class="landing-naira-wm">₦</div>
      </div>

      <nav class="landing-nav">
        <div class="landing-nav-brand">
          <span class="landing-logo-mark" aria-hidden="true">
            ₦
          </span>
          <span class="landing-logo-text">BashiBook</span>
          <span class="landing-tag-chip">Nigeria · ₦ · PWA</span>
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
        <section class="landing-narrative">
          <p class="landing-eyebrow">Offline credit ledger</p>
          <h1 class="landing-title">
            Track udhar.
            <br />
            <span class="landing-title-accent">Remind. Recover.</span>
          </h1>
          <p class="landing-pitch">
            Offline credit / udhar ledger for Nigerian shopkeepers — track who owes what,
            remind on WhatsApp, back up when you are ready.
          </p>

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

          <ul class="landing-features landing-features-bento">
            {FEATURES.map((f) => (
              <li key={f.title} class="landing-feature-card">
                <span class="landing-feature-icon" aria-hidden="true">
                  {f.icon}
                </span>
                <div class="landing-feature-body">
                  <strong>{f.title}</strong>
                  <span>{f.body}</span>
                </div>
              </li>
            ))}
          </ul>

          <div class="landing-qr-block">
            <img
              class="landing-qr"
              src={qrSrc}
              width={168}
              height={168}
              alt="QR code to open BashiBook"
              loading="lazy"
            />
            <div class="landing-qr-meta">
              <p class="landing-qr-label">Scan to open on your phone</p>
              <a class="landing-url" href={href}>
                {displayUrl}
              </a>
              <p class="landing-qr-hint">Best experience as an installed PWA on Android.</p>
            </div>
          </div>

          <footer class="landing-footer">
            <p>Bashi = debt (Hausa). Not affiliated with US DebtBook SaaS.</p>
          </footer>
        </section>

        <aside class="landing-stage" id="landing-phone-stage">
          <div class="landing-stage-glow" aria-hidden="true" />
          <div class="phone-frame" aria-label="Live BashiBook preview">
            <div class="phone-notch" aria-hidden="true" />
            <iframe
              class="phone-screen"
              title="BashiBook app preview"
              src={embed}
              allow="clipboard-write"
            />
          </div>
          <div class="landing-phone-reflect" aria-hidden="true" />
          <p class="landing-stage-caption">Live preview · tap around inside the phone</p>
        </aside>
      </div>
    </div>
  );
}
