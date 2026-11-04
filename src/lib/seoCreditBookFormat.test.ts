import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL as B } from '../config';
import html from '../../public/credit-book-format.html?raw';
import sitemap from '../../public/sitemap.xml?raw';
import vercelJson from '../../vercel.json?raw';
import viteConfig from '../../vite.config.ts?raw';
import landing from '../pages/LandingPage.tsx?raw';
import reminder from '../../public/whatsapp-payment-reminder.html?raw';
import creditApp from '../../public/credit-book-app.html?raw';

const scripts = () => [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const num = (s: string) => Number(s.replace(/,/g, '') || 0);

describe('/credit-book-format static page', () => {
  it('has title, meta description, canonical/og/hreflang and HowTo + FAQ JSON-LD matching the visible text', () => {
    expect(html).toMatch(/<title>Credit book format for a shop \(with a filled-in example\)[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,160}">/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<link rel="canonical" href="${B}/credit-book-format">`);
    expect(html).toContain(`<meta property="og:url" content="${B}/credit-book-format">`);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b['@type']).sort()).toEqual(['FAQPage', 'HowTo', 'SoftwareApplication']);
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBe(4);
    for (const q of faq.mainEntity) {
      expect(html).toContain(`<h3>${q.name}</h3>`);
      expect(html).toContain(`<p>${q.acceptedAnswer.text.replace(/'/g, "'")}</p>`);
    }
    expect(blocks.find((b) => b['@type'] === 'HowTo').step.length).toBe(4);
  });

  it('example page balances add up line by line, and the summary total is right', () => {
    const ex = html.split('id="example"')[1].split('A blank page')[0];
    const rows = [...ex.matchAll(/<tr[^>]*><td>[^<]*<\/td><td>[^<]*<\/td><td class="n">([\d,]*)<\/td><td class="n">([\d,]*)<\/td><td class="n bal">([\d,]*)<\/td><\/tr>/g)];
    expect(rows.length).toBe(6);
    let bal = 0;
    for (const [, credit, paid, b] of rows) {
      bal = bal + num(credit) - num(paid);
      expect(num(b)).toBe(bal);
    }
    expect(bal).toBe(0);
    const sum = html.split('id="summary"')[1].split('</table>')[0];
    const bals = [...sum.matchAll(/<td class="n bal">([\d,]+)<\/td>/g)].map((m) => num(m[1]));
    const total = bals.pop();
    expect(bals.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('is country-neutral, honest (offline once opened, free to start), no competitor claims, no tracking', () => {
    expect(html).not.toMatch(/nigeria/i);
    expect(html).not.toMatch(/no data needed|without (data|network)|free forever/i);
    expect(html).toContain('Works offline once opened');
    expect(html).toContain('Free to start');
    expect(html).not.toMatch(/kippa|okcredit|khatabook|vyapar|tabs/i);
    expect(scripts().length).toBe(1); // only the ?src passthrough
    expect(html).not.toContain('<script src');
    expect(html).not.toMatch(/fonts\.googleapis|@font-face|<img|\/api\/hit|fetch\(|sendBeacon/);
    expect(html).toMatch(/@media print\{/);
  });

  it('Hausa/Yoruba column words come from the app strings', async () => {
    const { ha } = await import('../i18n/locales/ha');
    const { yo } = await import('../i18n/locales/yo');
    const h = ha as Record<string, string>;
    const y = yo as Record<string, string>;
    for (const k of ['common.customer', 'customer.balanceTitle', 'common.note']) {
      expect(html).toContain(`<td lang="ha">${h[k]}</td>`);
      expect(html).toContain(`<td lang="yo">${y[k]}</td>`);
    }
    expect(html).toContain(`<td lang="ha">${h['customer.creditLimit'].replace(' {{amount}}', '')}</td>`);
    expect(html).toContain(`<td lang="yo">${y['customer.creditLimit'].replace(' {{amount}}', '')}</td>`);
  });

  it('tags the app link src=cbf, passes ?src through as cbf-<src>, and has a WhatsApp share link', () => {
    const ctas = html.match(/<a class="cta" href="[^"]+">/g) || [];
    expect(ctas).toEqual(['<a class="cta" href="/?app=1&amp;src=cbf">', '<a class="cta" href="/?app=1&amp;src=cbf">']);
    const run = (search: string) => {
      const links = [{ href: '/?app=1&src=cbf', setAttribute(_: string, v: string) { this.href = v; } }];
      new Function('location', 'document', scripts()[0])({ search }, { querySelectorAll: () => links });
      return links[0].href;
    };
    expect(run('')).toBe('/?app=1&src=cbf');
    expect(run('?src=FB')).toBe('/?app=1&src=cbf-fb');
    expect(run('?src=cbf-share')).toBe('/?app=1&src=cbf-share');
    expect(run('?src=%3Cscript%3E"')).toBe('/?app=1&src=cbf-script');
    const share = /<a class="share" href="https:\/\/wa\.me\/\?text=([^"]+)"/.exec(html);
    expect(share).not.toBeNull();
    expect(decodeURIComponent(share![1])).toContain(`${B}/credit-book-format?src=cbf-share`);
  });

  it('ledger tables read cleanly on a 375px phone and the header sits on the page column on desktop', () => {
    // Dates, phone and limit never split mid-value; units stay with their quantity.
    expect(html).toContain('td:first-child,td.d{white-space:nowrap}');
    const sum = html.split('id="summary"')[1].split('</table>')[0];
    expect(sum).toContain('<table class="sum">');
    expect(html).toContain('.sum td:first-child{white-space:normal}'); // the over-limit tag wraps under the name
    expect([...sum.matchAll(/<td class="d">\d{1,2} [A-Z][a-z]{2}<\/td>/g)].length).toBe(3);
    expect(html).toContain('<span class="f">Phone: 0800 000 0000</span>');
    expect(html).toContain('Rice 5&nbsp;kg, oil 1&nbsp;L');
    // Blank page: ruled fill-in lines, not underscores.
    const blank = html.split('A blank page to copy')[1].split('</table>')[0];
    expect(blank).toContain('<div class="top fill"><span><b>Customer</b><i></i></span><span>Phone<i></i></span><span>Limit<i></i></span></div>');
    expect(blank).not.toContain('____');
    expect(html).toContain('header>*{max-width:692px;margin-left:auto;margin-right:auto}');
    expect(html).toMatch(/\nh1\{[^}]*margin:14px auto 6px\}/);
  });

  it('is in the sitemap, served before the SPA catch-all, kept out of the PWA fallback, CSP allows its script, and linked', async () => {
    expect(sitemap).toContain(`<loc>${B}/credit-book-format</loc>`);
    const v = JSON.parse(vercelJson) as { rewrites: { source: string; destination: string }[]; headers: { source: string; headers: { key: string; value: string }[] }[] };
    const i = v.rewrites.findIndex((r) => r.source === '/credit-book-format' && r.destination === '/credit-book-format.html');
    const spa = v.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(spa);
    expect(v.headers.some((h) => h.source === '/credit-book-format')).toBe(true);
    const csp = v.headers.find((h) => h.source === '/(.*)')!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    const raw = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
    const b64 = btoa(String.fromCharCode(...digest));
    expect(csp).toContain(`'sha256-${b64}'`);
    expect(viteConfig).toContain('/^\\/credit-book-format/');
    expect(viteConfig).toContain("'**/credit-book-format.html'");
    expect(landing).toContain('<a href="/credit-book-format">');
    expect(reminder).toContain('<a href="/credit-book-format">');
    expect(creditApp).toContain('<a href="/credit-book-format">');
  });
});
