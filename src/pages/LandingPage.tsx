import { useEffect, useRef, useState } from 'preact/hooks';
import { PUBLIC_APP_URL } from '../config';
import { setForceApp } from '../lib/viewportMode';
import { QrCode } from '../components/QrCode';
import { useLocale } from '../hooks/useLocale';
import { isRegionNigeria, t as tr } from '../i18n';
import { KB_APP, KB_MEASURED, KB_OPEN } from '../lib/sizes';
import '../styles/landing.css';

const FEATURES = [
  ['Works with no network', 'Works offline once opened. Your book stays on your phone. No sign-up.'],
  ['Remind in one tap', 'Send a polite WhatsApp reminder with the balance. SMS or share if there is no WhatsApp.'],
  ['Never lose your book', 'Free backup file any time. Pro adds encrypted cloud backup and restore on a new phone.'],
  ['Your language', 'English, Hausa and Yorùbá. Switch any time in Settings.'],
  ['Add from contacts', 'Pick customers from your phone book on Android.'],
  ['Suppliers too', 'Track what you owe your suppliers, kept apart from what customers owe you.'],
] as const;

const FAQ: [string, string, boolean][] = [
  [
    'Will it use up my data?',
    `Very little. Opening BashiBook the first time downloads about ${KB_OPEN} kB. The rest of the app saves itself on your phone (about ${KB_APP} kB in total), so it keeps working with no network. Recording sales and payments on the free book uses no data (with Pro cloud backup on, changes upload when you are online). Reminders go through your own WhatsApp or SMS, at your normal cost.`,
    true,
  ],
  [
    'What if I lose my phone?',
    'Your book lives on your phone, so keep a backup. Download a free backup file any time in Settings and keep it somewhere safe, then choose "Have a backup? Restore it" on your new phone. Pro adds encrypted cloud backup that you restore with your recovery code. Without a backup, a lost phone means a lost book.',
    true,
  ],
  [
    'Can my staff use it? Will they see everything?',
    'BashiBook is one book on one phone. There are no separate staff logins yet, so anyone using your phone can open the book. Set a 4-digit PIN to hide your totals when you leave the app, and turn on "Ask PIN before deleting" so nobody can remove a customer or an entry without it.',
    true,
  ],
  [
    'Who can see my records?',
    "Your book is saved on your phone. We don't receive your customers or amounts. If you turn on Pro cloud backup, your book is encrypted on your phone before it is uploaded.",
    false,
  ],
  ['Do my customers need the app?', 'No. They get your reminder or receipt as a normal WhatsApp message or SMS.', false],
];

function Logo({ size }: { size: number }) {
  return <img src="/icons/icon.svg" alt="" width={size} height={size} decoding="async" />;
}

type Props = {
  onUseAppHere: () => void;
};

export function LandingPage({ onUseAppHere }: Props) {
  // Canonical public URL (src/config.ts), never the raw deployment host.
  const href = `${PUBLIC_APP_URL}/`;
  useLocale(); // re-render when the region answer arrives
  const ng = isRegionNigeria();
  // Landing copy is English; {{shops}} is "Nigerian shops" only for visitors in Nigeria.
  const enShops = tr(ng ? 'region.shopsNG' : 'region.shops', undefined, 'en');
  const seo = ng ? '/ng' : '';
  const cta = useRef<HTMLButtonElement>(null);
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    // Anonymous channel count (event + src tag only), once per device per day. Sent on idle, after paint.
    let src: string | null = null;
    try {
      src = new URL(location.href).searchParams.get('src');
    } catch {
      /* ignore */
    }
    // QA Oct 28: never compete with first paint. After the load event, on idle, via sendBeacon (lib/hit).
    const go = () => void import('../lib/hit').then((m) => m.hit('view_home', { daily: true, src })).catch(() => {});
    const idle = () =>
      'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1);
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
    return () => removeEventListener('load', idle);
  }, []);

  useEffect(() => {
    // Narrow widths: a sticky "Start my book, free" only after the hero CTA scrolls off.
    if (!cta.current || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => setSticky(!e[0]!.isIntersecting));
    io.observe(cta.current);
    return () => io.disconnect();
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

  // The hash is the app router, so scroll instead of #anchors.
  const scrollTo = (id: string) => () =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div class="lp">
      <div class="lp-w">
        <nav class="lp-nav">
          <a class="lp-brand" href="/">
            <Logo size={38} />
            <span>
              <b>BashiBook</b>
              <small>Record it. Remind. Get paid.</small>
            </span>
          </a>
          <div class="lp-nl">
            <button type="button" class="lp-hide" onClick={scrollTo('lp-how')}>
              How it works
            </button>
            <button type="button" class="lp-hide" onClick={scrollTo('lp-faq')}>
              Questions
            </button>
            <button type="button" class="lp-btn lp-sm" onClick={openAppHome}>
              Start free
            </button>
          </div>
        </nav>

        <header class="lp-hero">
          <div>
            <span class="lp-kick">
              <i />
              Free credit book
            </span>
            <h1 id="landing-title">
              <span class="lp-l">Know who owes you.</span>{' '}
              <span class="lp-l">
                <em>Get paid</em> on WhatsApp.
              </span>
            </h1>
            <p class="lp-lede">
              A free credit (bashi) book for {enShops}. Write it once, remind in one tap, keep a backup.
              Works offline once opened.
            </p>
            <div class="lp-ctas">
              <button type="button" class="lp-btn" ref={cta} onClick={openAppHome}>
                Start my book, free
              </button>
              <button type="button" class="lp-tl" onClick={scrollTo('lp-phone')}>
                Open on your phone ↓
              </button>
            </div>
            <ul class="lp-proof">
              <li>Works offline once opened</li>
              <li>No sign-up</li>
              <li class="kb">~{KB_OPEN} kB to open</li>
              <li>English · Hausa · Yorùbá</li>
            </ul>
          </div>
          <div class="lp-stage" role="img" aria-label="Demo: record a credit sale, remind on WhatsApp, get paid">
            <div class="lp-phone" aria-hidden="true">
              <div class="lp-scr">
                <div class="lp-shop">
                  <Logo size={22} />
                  Grace's Corner Shop
                </div>
                <div class="lp-tot">
                  <small>Customers owe you</small>
                  <b>
                    <span class="f1">$148</span>
                    <span class="f3">$123</span>
                  </b>
                  <em>3 customers · oldest: Ama, 9 days</em>
                </div>
                <div class="lp-row">
                  <div class="lp-av">S</div>
                  <div class="lp-nm">
                    <b>Sam</b>
                    <small class="lp-sw">
                      <span class="f1">Owes for 4 days · 2 bags of rice</span>
                      <span class="f3">Settled · paid today</span>
                    </small>
                  </div>
                  <div class="lp-amt">
                    <span class="f1">
                      $25<i class="lp-pill owe">Owes you</i>
                    </span>
                    <span class="f3">
                      $0<i class="lp-pill set">Settled ✓</i>
                    </span>
                  </div>
                </div>
                <div class="lp-cw">
                  <div class="lp-rb f1">💬 Remind Sam on WhatsApp</div>
                  <div class="lp-chat">
                    <div class="h">
                      <span>WhatsApp · Sam</span>
                      <span>✓✓</span>
                    </div>
                    <div class="lp-bub">
                      Hello Sam, this is Grace's Corner Shop. Your balance is $25 (2 bags of rice). Thank you!
                    </div>
                    <div class="lp-bub2">Sent it now 👍</div>
                  </div>
                </div>
                <div class="lp-row lp-mt12">
                  <div class="lp-av">A</div>
                  <div class="lp-nm">
                    <b>Ama</b>
                    <small>Owes for 9 days · paid $12 of $30</small>
                  </div>
                  <div class="lp-amt">
                    <span>
                      $18<i class="lp-pill owe">Owes you</i>
                    </span>
                  </div>
                </div>
                <div class="lp-row lp-mt8">
                  <div class="lp-av">T</div>
                  <div class="lp-nm">
                    <b>Tom</b>
                    <small>Owes for 2 days</small>
                  </div>
                  <div class="lp-amt">
                    <span>
                      $105<i class="lp-pill owe">Owes you</i>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="lp-steps" aria-hidden="true">
              <span>1 Record</span>
              <span>2 Remind</span>
              <span>3 Get paid</span>
            </div>
          </div>
        </header>

        <section id="lp-how" class="lp-sec">
          <h2>Three taps from "who took what?" to "paid".</h2>
          <p class="lp-sub">Built like your paper book, so there's nothing new to learn.</p>
          <div class="lp-how">
            <div class="lp-card">
              <div class="n">1</div>
              <h3>Record it</h3>
              <p>
                Add a customer, type <b>3k</b> for 3,000 and a note like "2 bags of rice". Their balance updates at
                once.
              </p>
            </div>
            <div class="lp-card">
              <div class="n">2</div>
              <h3>Remind</h3>
              <p>One tap sends a polite WhatsApp reminder with the balance. SMS or share if there is no WhatsApp.</p>
            </div>
            <div class="lp-card">
              <div class="n">3</div>
              <h3>Get paid</h3>
              <p>Record the payment when it comes in. Part-payments are fine: the book shows what's left.</p>
            </div>
          </div>
        </section>

        <section class="lp-sec">
          <div class="lp-size">
            <div>
              <h2>Small enough for any phone and any data plan.</h2>
              <p class="lp-sub">
                BashiBook opens in your browser. No app store download, no sign-up. Open it once and it keeps working
                with no network.
              </p>
            </div>
            <div class="lp-meter">
              <div class="lp-mrow">
                <b>~{KB_OPEN} kB</b>
                <div>
                  <span>to open BashiBook the first time</span>
                  <div class="lp-bar">
                    <i style={{ width: `${Math.round((KB_OPEN / KB_APP) * 100)}%` }} />
                  </div>
                </div>
              </div>
              <div class="lp-mrow">
                <b>~{KB_APP} kB</b>
                <div>
                  <span>the whole app, saved on your phone for offline use</span>
                  <div class="lp-bar">
                    <i style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
              <div class="lp-mrow">
                <b>0 kB</b>
                <div>
                  <span>to record a sale or a payment on the free book. It is saved on your phone</span>
                  <div class="lp-bar">
                    <i style={{ width: '0' }} />
                  </div>
                </div>
              </div>
              <p class="lp-src">
                Measured on bashibook.app, {KB_MEASURED}: compressed HTML, code and styles as downloaded.
              </p>
            </div>
          </div>
        </section>

        <section class="lp-sec">
          <h2>Made for the shop counter, not the office.</h2>
          <p class="lp-sub">Everything a shop that sells on credit needs. Nothing it doesn't.</p>
          <div class="lp-feat">
            {FEATURES.map(([title, body]) => (
              <div key={title}>
                <b>{title}</b>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="lp-faq" class="lp-sec">
          <div class="lp-faq">
            <div>
              <h2>Worries we hear most</h2>
              <p class="lp-sub">Straight answers. If something isn't built yet, we say so.</p>
            </div>
            <div>
              {FAQ.map(([q, a, open]) => (
                <details key={q} open={open}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="lp-phone" class="lp-sec">
          <div class="lp-qr">
            <QrCode class="lp-qrbox" value={href} size={132} label="QR code to open BashiBook" />
            <div>
              <h3>Open it on your phone</h3>
              <p>
                Scan the code or type <a href={href}>{PUBLIC_APP_URL.replace(/^https?:\/\//, '')}</a>. Add it to your home screen to open it in
                one tap.
              </p>
            </div>
          </div>
        </section>
      </div>
      <footer class="lp-foot">
        <div class="lp-w">
          <span>© BashiBook</span>
          <a href={`${seo}/credit-book-app`}>Free credit book app for {enShops}</a>
          <a href={`${seo}/kippa-alternative`}>Looking for a Kippa alternative?</a>
          <span>Bashi = credit (Hausa). Not affiliated with US DebtBook SaaS.</span>
        </div>
      </footer>
      <div class={sticky ? 'lp-sticky on' : 'lp-sticky'}>
        <button type="button" class="lp-btn" onClick={openAppHome} tabIndex={sticky ? 0 : -1}>
          Start my book, free
        </button>
      </div>
    </div>
  );
}
