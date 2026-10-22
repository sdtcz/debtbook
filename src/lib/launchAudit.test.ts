import { describe, expect, it } from 'vitest';
import vercelJson from '../../vercel.json?raw';
import viteConfig from '../../vite.config.ts?raw';
import notFound from '../../public/404.html?raw';
import indexHtml from '../../index.html?raw';

type Rewrite = { source: string; destination: string };
const vercel = JSON.parse(vercelJson) as { rewrites: Rewrite[]; headers: { source: string; headers: { key: string; value: string }[] }[] };

describe('404 handling', () => {
  it('has a real, non-indexed 404 page that links back to the app', () => {
    expect(notFound).toContain('<meta name="robots" content="noindex">');
    expect(notFound).toContain('href="/?app=1"');
    expect(notFound).not.toMatch(/<script/);
  });
  it('vercel only serves the SPA shell on "/" (no catch-all), so unknown paths 404', () => {
    const spa = vercel.rewrites.filter((r) => r.destination === '/index.html');
    expect(spa).toEqual([{ source: '/', destination: '/index.html' }]);
    for (const r of vercel.rewrites) {
      expect(r.source).not.toContain('(?!');
      if (r.source !== '/api/(.*)') expect(r.source).not.toContain('(.*)');
    }
  });
  it('PWA navigate fallback only applies to the app root', () => {
    const m = viteConfig.match(/navigateFallbackAllowlist: \[(\/.*\/)\]/);
    expect(m).toBeTruthy();
    const re = new Function(`return ${m![1]}`)() as RegExp;
    for (const ok of ['/', '/?app=1', '/?app=1&src=cb', '/index.html']) expect(re.test(ok)).toBe(true);
    for (const no of ['/nope', '/credit-book-app', '/ng/credit-book-app', '/api/geo', '/404.html']) expect(re.test(no)).toBe(false);
    expect(viteConfig).toContain("'**/404.html'");
  });
});

describe('index.html share tags', () => {
  it('has description, canonical, og and twitter tags', () => {
    expect(indexHtml).toMatch(/<meta name="description" content="[^"]{50,160}" \/>/);
    expect(indexHtml).toContain('<link rel="canonical" href="https://debtbook-neon.vercel.app/" />');
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) expect(indexHtml).toContain(`property="${p}"`);
    for (const n of ['twitter:card', 'twitter:title', 'twitter:image']) expect(indexHtml).toContain(`name="${n}"`);
    expect(indexHtml).toContain('href="/favicon.ico"');
  });
});
