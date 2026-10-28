import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL } from '../config';
import html from '../../public/credit-book-app.html?raw';
import sitemap from '../../public/sitemap.xml?raw';
import vercelJson from '../../vercel.json?raw';
import viteConfig from '../../vite.config.ts?raw';

describe('/credit-book-app static page', () => {
  it('has title, meta description, canonical, three languages (Pidgin only on /ng/) and FAQ JSON-LD', () => {
    expect(html).toMatch(/<title>[^<]*Credit book app[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,160}">/);
    expect(html).toContain(`<link rel="canonical" href="${PUBLIC_APP_URL}/credit-book-app">`);
    for (const lang of ['en', 'ha', 'yo']) expect(html).toContain(`<section id="${lang}" lang="${lang}">`);
    expect(html).not.toMatch(/lang="pcm"|Pidgin/); // Pidgin only on /ng/*
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b['@type']).sort()).toEqual(['FAQPage', 'SoftwareApplication']);
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBe(4);
  });
  it('keeps the same honest claims (offline once opened, real prices) and no competitor claims', () => {
    expect(html).not.toMatch(/without (data|network)|data no dey|ba tare da data|láìsí dátà/i);
    expect(html).toContain('Works offline once opened');
    expect(html).toContain('$1.99/month or $15/year');
    const kippa = html.split('\n').filter((l: string) => /kippa/i.test(l));
    expect(kippa).toEqual([expect.stringContaining('href="/kippa-alternative"')]);
  });
  it('tags app links src=cb and passes ?src through as cb-<src>', () => {
    const ctas = html.match(/<a class="cta" href="[^"]+">/g) || [];
    expect(ctas.length).toBe(3);
    for (const a of ctas) expect(a).toContain('href="/?app=1&amp;src=cb"');
    const code = html.match(/<script>\n([\s\S]*?)<\/script>/)![1];
    const run = (search: string) => {
      const links = [{ href: '/?app=1&src=cb', setAttribute(_: string, v: string) { this.href = v; } }];
      new Function('location', 'document', code)({ search }, { querySelectorAll: () => links });
      return links[0].href;
    };
    expect(run('')).toBe('/?app=1&src=cb');
    expect(run('?src=Nairaland')).toBe('/?app=1&src=cb-nairaland');
    expect(run('?src=%3Cscript%3E"')).toBe('/?app=1&src=cb-script');
  });
  it('is in the sitemap, served before the SPA catch-all, and kept out of the PWA fallback', () => {
    expect(sitemap).toContain(`<loc>${PUBLIC_APP_URL}/credit-book-app</loc>`);
    const v = JSON.parse(vercelJson) as { rewrites: { source: string; destination: string }[] };
    const i = v.rewrites.findIndex((r) => r.source === '/credit-book-app');
    const spa = v.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(spa);
    expect(viteConfig).toContain('/^\\/credit-book-app/');
    expect(viteConfig).toContain("'**/credit-book-app.html'");
  });
});
