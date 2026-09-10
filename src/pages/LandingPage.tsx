import { appEmbedUrl, setForceApp } from '../lib/viewportMode';

const FEATURES = [
  {
    title: 'Offline-first',
    body: 'Works without data. Your ledger lives on the phone in IndexedDB.',
  },
  {
    title: 'WhatsApp remind',
    body: 'One tap to nudge customers over WhatsApp (SMS / share fallback).',
  },
  {
    title: 'Free + Pro backup',
    body: 'Local JSON backup free; encrypted cloud backup on Pro.',
  },
  {
    title: 'Hausa & Yoruba',
    body: 'English, Hausa, and Yoruba — switch in Settings.',
  },
  {
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

  const useAppHere = () => {
    setForceApp(true);
    onUseAppHere();
  };

  return (
    <div class="landing">
      <div class="landing-inner">
        <header class="landing-hero">
          <p class="landing-eyebrow">Nigeria · ₦ · PWA</p>
          <h1 class="landing-title">BashiBook</h1>
          <p class="landing-pitch">
            Offline credit / udhar ledger for Nigerian shopkeepers — track who owes what,
            remind on WhatsApp, back up when you are ready.
          </p>
          <div class="landing-cta-row">
            <a class="landing-cta" href={href}>
              Open on your phone
            </a>
            <button type="button" class="landing-linkish" onClick={useAppHere}>
              Use app here anyway
            </button>
          </div>
        </header>

        <div class="landing-stage">
          <div class="landing-copy">
            <ul class="landing-features">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <strong>{f.title}</strong>
                  <span>{f.body}</span>
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
              </div>
            </div>
          </div>

          <div class="phone-frame" aria-label="Live BashiBook preview">
            <div class="phone-notch" aria-hidden="true" />
            <iframe
              class="phone-screen"
              title="BashiBook app preview"
              src={embed}
              allow="clipboard-write"
            />
          </div>
        </div>

        <footer class="landing-footer">
          <p>
            Bashi = debt (Hausa). Not affiliated with US DebtBook SaaS.
          </p>
        </footer>
      </div>
    </div>
  );
}
