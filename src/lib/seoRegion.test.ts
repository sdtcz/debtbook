import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL as B } from '../config';
import cb from '../../public/credit-book-app.html?raw';
import kippa from '../../public/kippa-alternative.html?raw';
import cbNg from '../../public/ng/credit-book-app.html?raw';
import kippaNg from '../../public/ng/kippa-alternative.html?raw';
import sitemap from '../../public/sitemap.xml?raw';
import vercelJson from '../../vercel.json?raw';
import viteConfig from '../../vite.config.ts?raw';
import landing from '../pages/LandingPage.tsx?raw';
import indexHtml from '../../index.html?raw';

const NG = /nigeria/i;
const pages = [
  { name: 'credit-book-app', neutral: cb, ng: cbNg, src: 'cb', ev: 'view_cb' },
  { name: 'kippa-alternative', neutral: kippa, ng: kippaNg, src: 'kippa', ev: 'view_kippa' },
];

function alternates(html: string) {
  return [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
}

function runPassthrough(html: string, search: string, base: string) {
  const code = html.match(/<script>\n([\s\S]*?)<\/script>/)![1];
  const links = [{ href: base, setAttribute(_: string, v: string) { this.href = v; } }];
  new Function('location', 'document', code)({ search }, { querySelectorAll: () => links });
  return links[0].href;
}

function runBeacon(html: string, search: string) {
  const code = [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)][1][1];
  const sent: string[] = [];
  const ls = new Map<string, string>();
  const nav = { sendBeacon: (_u: string, b: { parts: string[] }) => (sent.push(b.parts[0]), true) };
  class FakeBlob { parts: string[]; constructor(p: string[]) { this.parts = p; } }
  new Function('location', 'localStorage', 'navigator', 'Blob', code)(
    { search },
    { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => ls.set(k, v) },
    nav,
    FakeBlob,
  );
  return sent.map((s) => JSON.parse(s));
}

describe('region-neutral SEO pages + /ng/ variants', () => {
  for (const p of pages) {
    it(`${p.name}: neutral page never says Nigeria, is canonical and x-default`, () => {
      expect(p.neutral).not.toMatch(NG);
      expect(p.neutral).toContain('<html lang="en">');
      expect(p.neutral).toContain(`<link rel="canonical" href="${B}/${p.name}">`);
      expect(p.neutral).toMatch(/small shops/);
    });
    it(`${p.name}: /ng/ page has the Nigeria wording, self-canonical, en-NG`, () => {
      expect(p.ng).toMatch(/Nigerian shops/);
      expect(p.ng).toContain('<html lang="en-NG">');
      expect(p.ng).toContain(`<link rel="canonical" href="${B}/ng/${p.name}">`);
      expect(p.ng).toContain(`<meta property="og:url" content="${B}/ng/${p.name}">`);
    });
    it(`${p.name}: both pages list the same reciprocal hreflang alternates`, () => {
      const want = [
        ['x-default', `${B}/${p.name}`],
        ['en', `${B}/${p.name}`],
        ['en-NG', `${B}/ng/${p.name}`],
      ];
      expect(alternates(p.neutral)).toEqual(want);
      expect(alternates(p.ng)).toEqual(want);
    });
    it(`${p.name}: /ng/ CTAs are tagged ${p.src}-ng and pass ?src through`, () => {
      const ctas = p.ng.match(/<a class="cta" href="[^"]+">/g) || [];
      expect(ctas.length).toBe(4);
      for (const a of ctas) expect(a).toContain(`href="/?app=1&amp;src=${p.src}-ng"`);
      const base = `/?app=1&src=${p.src}-ng`;
      expect(runPassthrough(p.ng, '', base)).toBe(base);
      expect(runPassthrough(p.ng, '?src=Tw', base)).toBe(`/?app=1&src=${p.src}-ng-tw`);
      expect(runPassthrough(p.ng, '?src=' + 'a'.repeat(40), base)).toBe(`/?app=1&src=${p.src}-ng-${'a'.repeat(20)}`);
      expect(runPassthrough(p.neutral, '?src=tw', `/?app=1&src=${p.src}`)).toBe(`/?app=1&src=${p.src}-tw`);
    });
    it(`${p.name}: /ng/ anonymous count tags the source "ng-…" within the 32-char limit`, () => {
      expect(runBeacon(p.ng, '')).toEqual([{ e: p.ev, s: 'ng' }]);
      const [hit] = runBeacon(p.ng, '?src=' + 'b'.repeat(40));
      expect(hit.s).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(hit.s.startsWith('ng-b')).toBe(true);
      expect(runBeacon(p.neutral, '')).toEqual([{ e: p.ev }]);
    });
  }

  it('sitemap lists all four pages', () => {
    for (const p of pages) {
      expect(sitemap).toContain(`<loc>${B}/${p.name}</loc>`);
      expect(sitemap).toContain(`<loc>${B}/ng/${p.name}</loc>`);
    }
  });

  it('vercel serves /ng/ pages before the app root, and the PWA never shells them', () => {
    const v = JSON.parse(vercelJson) as { rewrites: { source: string; destination: string }[] };
    const root = v.rewrites.findIndex((r) => r.source === '/');
    for (const p of pages) {
      const i = v.rewrites.findIndex((r) => r.source === `/ng/${p.name}` && r.destination === `/ng/${p.name}.html`);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(root);
    }
    expect(viteConfig).toContain('/^\\/ng\\//');
    expect(viteConfig).toContain("'**/ng/*.html'");
  });

  it('landing and index.html only say Nigeria behind the region switch', () => {
    expect(indexHtml).not.toMatch(NG);
    const lines = landing.split('\n').filter((l: string) => NG.test(l.replace(/isRegionNigeria/g, '')) && !/^\s*\/\//.test(l));
    expect(lines).toEqual([expect.stringContaining("{ng ? 'Nigeria · ₦ · PWA'")]);
    expect(landing).toContain('{enShops}');
  });
});
