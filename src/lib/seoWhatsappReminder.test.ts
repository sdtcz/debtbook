import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL as B } from '../config';
import html from '../../public/whatsapp-payment-reminder.html?raw';
import sitemap from '../../public/sitemap.xml?raw';
import vercelJson from '../../vercel.json?raw';
import viteConfig from '../../vite.config.ts?raw';
import landing from '../pages/LandingPage.tsx?raw';

const scripts = () => [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe('/whatsapp-payment-reminder static page', () => {
  it('has title, meta description, canonical/og/hreflang, three languages and FAQ JSON-LD', () => {
    expect(html).toMatch(/<title>How to remind a customer to pay on WhatsApp \(politely\)[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,160}">/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<link rel="canonical" href="${B}/whatsapp-payment-reminder">`);
    expect(html).toContain(`<meta property="og:url" content="${B}/whatsapp-payment-reminder">`);
    const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
    expect(alts).toEqual([
      ['x-default', `${B}/whatsapp-payment-reminder`],
      ['en', `${B}/whatsapp-payment-reminder`],
    ]);
    for (const lang of ['en', 'ha', 'yo']) expect(html).toContain(`<section id="${lang}" lang="${lang}">`);
    expect(html).toContain('#ha,#yo{display:none}'); // one language at a time, English default
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b['@type']).sort()).toEqual(['FAQPage', 'SoftwareApplication']);
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBe(4);
    for (const q of faq.mainEntity) expect(html).toContain(`<h3>${q.name}</h3>`);
  });

  it('is country-neutral, honest (offline once opened), no Pidgin, no competitor claims', () => {
    expect(html).not.toMatch(/nigeria/i);
    expect(html).not.toMatch(/lang="pcm"|Pidgin/);
    expect(html).not.toMatch(/no data needed|without (data|network)|data no dey|ba tare da data|láìsí dátà/i);
    expect(html).toContain('Works offline once opened');
    expect(html).toMatch(/small shops|shop owners/);
    expect(html).not.toMatch(/kippa|oKash|khatabook|vyapar/i);
  });

  it('shows 4 copyable English templates as plain text (no JS needed) plus Hausa and Yoruba ones', () => {
    const en = html.split('<section id="ha"')[0];
    expect((en.match(/<p class="msg">/g) || []).length).toBe(4);
    expect((html.match(/<p class="msg">/g) || []).length).toBe(8);
    expect(html).toMatch(/\.msg\{[^}]*user-select:all/);
    expect(scripts().length).toBe(1); // only the ?src passthrough, no beacon, no copy script
    expect(html).not.toContain('<script src');
    expect(html).not.toMatch(/fonts\.googleapis|@font-face|<img/);
  });

  it('tags app links src=wr and passes ?src through as wr-<src>', () => {
    const ctas = html.match(/<a class="cta" href="[^"]+">/g) || [];
    expect(ctas.length).toBe(3);
    for (const a of ctas) expect(a).toContain('href="/?app=1&amp;src=wr"');
    const run = (search: string) => {
      const links = [{ href: '/?app=1&src=wr', setAttribute(_: string, v: string) { this.href = v; } }];
      new Function('location', 'document', scripts()[0])({ search }, { querySelectorAll: () => links });
      return links[0].href;
    };
    expect(run('')).toBe('/?app=1&src=wr');
    expect(run('?src=WhatsApp')).toBe('/?app=1&src=wr-whatsapp');
    expect(run('?src=%3Cscript%3E"')).toBe('/?app=1&src=wr-script');
    expect(run('?src=' + 'a'.repeat(40))).toBe(`/?app=1&src=wr-${'a'.repeat(20)}`);
  });

  it('is in the sitemap, served before the SPA catch-all, kept out of the PWA fallback and linked from the landing footer', () => {
    expect(sitemap).toContain(`<loc>${B}/whatsapp-payment-reminder</loc>`);
    const v = JSON.parse(vercelJson) as { rewrites: { source: string; destination: string }[]; headers: { source: string }[] };
    const i = v.rewrites.findIndex((r) => r.source === '/whatsapp-payment-reminder' && r.destination === '/whatsapp-payment-reminder.html');
    const spa = v.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(spa);
    expect(v.headers.some((h) => h.source === '/whatsapp-payment-reminder')).toBe(true);
    expect(viteConfig).toContain('/^\\/whatsapp-payment-reminder/');
    expect(viteConfig).toContain("'**/whatsapp-payment-reminder.html'");
    expect(landing).toContain('<a href="/whatsapp-payment-reminder">');
  });
});
