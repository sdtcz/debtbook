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
    expect(indexHtml).toContain('<link rel="canonical" href="https://bashibook.app/" />');
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) expect(indexHtml).toContain(`property="${p}"`);
    for (const n of ['twitter:card', 'twitter:title', 'twitter:image']) expect(indexHtml).toContain(`name="${n}"`);
    expect(indexHtml).toContain('href="/favicon.ico"');
  });
});

const pages = import.meta.glob('../../public/**/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

async function sha256b64(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...d));
}

describe('security headers', () => {
  const all = vercel.headers.find((h) => h.source === '/(.*)');
  const get = (k: string) => all?.headers.find((h) => h.key === k)?.value || '';

  it('sends nosniff, referrer, permissions and frame headers on every path', () => {
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(get('Permissions-Policy')).toContain('camera=()');
    expect(get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('CSP is strict but allows what the app uses (same-origin iframe preview, Stripe, Vercel Blob)', () => {
    const csp = get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'"); // landing page previews the app in a same-origin iframe
    expect(csp).toMatch(/form-action [^;]*https:\/\/checkout\.stripe\.com/);
    expect(csp).toMatch(/connect-src [^;]*blob\.vercel-storage\.com/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it('allows every inline script on the static pages by hash (run node scripts/csp.mjs after edits)', async () => {
    const csp = get('Content-Security-Policy');
    const files = Object.keys(pages);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      for (const m of pages[f].matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        expect(csp, f).toContain(`'sha256-${await sha256b64(m[1])}'`);
      }
    }
  });
});

describe('web app manifest', () => {
  it('has a stable id, categories and shortcuts into hash routes', () => {
    expect(viteConfig).toContain("id: '/?app=1',");
    expect(viteConfig).toContain("start_url: '/?app=1',");
    expect(viteConfig).toMatch(/categories: \['finance', 'business', 'productivity'\]/);
    const urls = [...viteConfig.matchAll(/\burl: '([^']+)'/g)].map((m) => m[1]);
    expect(urls).toEqual(['/?app=1#/customers/new', '/?app=1#/reports', '/?app=1#/pay-details']);
  });
});

describe('help page', () => {
  const help = pages['../../public/help.html'];
  it('is a crawlable FAQ on the new domain, served at /help and kept out of the precache', () => {
    expect(help).toContain('<link rel="canonical" href="https://bashibook.app/help">');
    expect(help).toContain('application/ld+json');
    expect(help).not.toMatch(/<script>/);
    expect(help).not.toContain('vercel.app');
    expect(help).not.toContain('Nigerian');
    expect(vercel.rewrites).toContainEqual({ source: '/help', destination: '/help.html' });
    expect(viteConfig).toContain("'**/help.html'");
  });

  it('explains data deletion in plain HTML at /help#delete-data (Play Data safety URL)', () => {
    expect(help).toContain('<section id="delete-data">');
    expect(help).toContain('<h2>Delete your data</h2>');
    expect(help).toContain('Log out and erase this phone');
    expect(help).toContain('support@bashibook.app');
    expect(help).toContain('within 30 days');
  });
});
