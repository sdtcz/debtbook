import { afterEach, describe, expect, it } from 'vitest';
// node:fs without @types/node (the app tsconfig type-checks tests in the build).
type Fs = { existsSync(p: string): boolean; statSync(p: string): { size: number } };
const { existsSync, statSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
import viteConfig from '../../vite.config.ts?raw';
import indexHtml from '../../index.html?raw';
import cbNeutral from '../../public/credit-book-app.html?raw';
import kaNeutral from '../../public/kippa-alternative.html?raw';
import cbNg from '../../public/ng/credit-book-app.html?raw';
import kaNg from '../../public/ng/kippa-alternative.html?raw';
import { brandTagline, TAGLINE, TAGLINE_NG } from '../components/BrandLockup';
import { setRegionNigeria } from '../i18n';

const pub = (f: string) => new URL(`../../public/${f}`, import.meta.url).pathname;
afterEach(() => setRegionNigeria(false));

describe('logo pack (speech-bubble B)', () => {
  it('ships every pack file, small enough for 2G', () => {
    const max: Record<string, number> = {
      'favicon.ico': 4e3, 'favicon.svg': 1e3, 'apple-touch-icon.png': 4e3, 'og-image.png': 40e3, 'og-image-ng.png': 40e3,
      'icons/icon.svg': 2e3, 'icons/icon-192.png': 5e3, 'icons/icon-512.png': 12e3, 'icons/maskable-192.png': 4e3,
      'icons/icon-maskable-512.png': 8e3, 'brand/wordmark.svg': 6e3, 'brand/wordmark-reverse.svg': 6e3,
    };
    for (const [f, bytes] of Object.entries(max)) {
      expect(existsSync(pub(f)), f).toBe(true);
      expect(statSync(pub(f)).size, f).toBeLessThan(bytes);
    }
    for (let n = 1; n <= 5; n++) expect(existsSync(pub(`screenshots/screenshot-${n}.webp`))).toBe(true);
    expect(existsSync(pub('icons/apple-touch-icon.png'))).toBe(false); // moved to the root
  });

  it('manifest: any + maskable icons and install screenshots', () => {
    expect(viteConfig).toMatch(/icons\/maskable-192\.png'.*purpose: 'maskable'/);
    expect(viteConfig).toMatch(/icons\/icon-maskable-512\.png'.*purpose: 'maskable'/);
    expect(viteConfig).not.toMatch(/icon-512\.png'[^\n]*maskable/); // the rounded "any" tile is not maskable
    expect(viteConfig).toContain("form_factor: 'narrow'");
    expect(viteConfig).toContain('screenshots/screenshot-${n}.webp');
  });

  it('index: 1200×630 share image, svg favicon, root apple-touch-icon', () => {
    expect(indexHtml).toContain('content="https://debtbook-neon.vercel.app/og-image.png"');
    expect(indexHtml).toContain('<meta property="og:image:width" content="1200" />');
    expect(indexHtml).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(indexHtml).not.toContain('icon-512.png');
  });

  it('share images follow the region rule: Pidgin tagline only on /ng/ pages', () => {
    for (const h of [cbNeutral, kaNeutral]) {
      expect(h).toContain('/og-image.png"');
      expect(h).not.toContain('og-image-ng');
      expect(h).not.toContain('Write am');
    }
    for (const h of [cbNg, kaNg]) expect(h).toContain('/og-image-ng.png"');
  });

  it('lockup tagline: neutral English by default, Pidgin only in Nigeria', () => {
    setRegionNigeria(false);
    expect(brandTagline()).toBe(TAGLINE);
    expect(TAGLINE).toBe('Record it. Remind. Get paid.');
    setRegionNigeria(true);
    expect(brandTagline()).toBe(TAGLINE_NG);
    expect(brandTagline(false)).toBe(TAGLINE);
  });
});
