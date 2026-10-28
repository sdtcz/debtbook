import { describe, expect, it } from 'vitest';
// node:fs without @types/node (the app tsconfig type-checks tests in the build).
type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
import home from '../pages/HomePage.tsx?raw';
import detail from '../pages/CustomerDetailPage.tsx?raw';
import landing from '../pages/LandingPage.tsx?raw';
import tabbar from '../components/TabBar.tsx?raw';
import entry from '../pages/EntryFormPage.tsx?raw';
import cb from '../../public/credit-book-app.html?raw';
import ka from '../../public/kippa-alternative.html?raw';

const css = readFileSync('src/styles/app.css', 'utf8');

describe('QA fixes (Oct 28)', () => {
  it('red is reserved for overdue: rows, pills and the balance card carry an overdue class', () => {
    expect(home).toContain("soft-list-row ${tone}${overdue ? ' overdue' : ''}");
    expect(home).toContain("soft-list-pill ${tone}${overdue ? ' overdue' : ''}");
    expect(detail).toContain("balance-soft-hero ${tone}${overdue ? ' overdue' : ''}");
    const tail = css.slice(css.indexOf('QA fixes (Figma Bro'));
    expect(tail).toMatch(/\.amount-pill\.debt\{background:var\(--accent-soft\)/);
    expect(tail).toMatch(/\.amount-pill\.debt\.overdue\{[^}]*var\(--danger\)/);
  });
  it('home list comes before the chase and invite cards', () => {
    const list = home.indexOf('<div class="list">');
    expect(list).toBeGreaterThan(0);
    expect(home.indexOf('chase-today${')).toBeGreaterThan(list);
    expect(home.indexOf('growth-card invite')).toBeGreaterThan(list);
  });
  it('customer page has one primary button and no send-record/undo card', () => {
    expect(detail).not.toContain('btn-danger');
    expect(detail).not.toContain('btn btn-ok');
    expect(detail).not.toContain('undo-link');
    expect((detail.match(/btn-primary/g) || []).length).toBe(1);
  });
  it('landing hero uses the B logo, not the currency symbol', () => {
    expect(landing).toContain('/icons/icon.svg');
    expect(landing).not.toContain('landing-naira-wm');
    expect(landing).not.toContain('<iframe');
    expect(landing).not.toContain('Preview in browser');
    expect(landing).toContain("import '../styles/landing.css'");
    expect(css).not.toMatch(/landing/);
  });
  it('round 2: entry tally red only when overdue, '+' in the tab bar, one language at a time on neutral SEO pages', () => {
    expect(entry).toContain("isOverdue(customer, afterKobo) ? ' overdue' : ''");
    expect(css).toMatch(/\.entry-tally-amount\.debt \{\n  color: var\(--ink\);/);
    expect(home).not.toContain('class="fab');
    expect(css).not.toMatch(/\.fab\b/);
    expect(css).toContain('grid-template-columns: 1fr 1fr 64px 1fr 1fr;');
    expect(tabbar).toContain('class="tabbar-add"');
    expect(tabbar).toContain("t('home.addCustomer')");
    for (const html of [cb, ka]) {
      expect(html).toContain('#ha,#yo{display:none}');
      for (const id of ['en', 'ha', 'yo']) expect(html).toContain(`<a href="#${id}" hreflang="${id}">`);
    }
  });
});

describe('Desktop landing quick wins (Oct 28 competitor scan)', () => {
  it('hero matches the app promise and says only honest offline words', () => {
    expect(landing).toContain('Know who owes you.');
    expect(landing).toContain('<em>Get paid</em> on WhatsApp.');
    expect(landing).toContain('Works offline once opened');
    // plain shop words: no tech jargon on the marketing page
    for (const jargon of ['IndexedDB', 'JSON', 'PWA']) expect(landing).not.toContain(jargon);
  });
  it('one primary call to action, phone CTA shows the QR without touching the hash router', () => {
    // one filled CTA in the hero (the sticky copy only appears on narrow widths after it scrolls off)
    expect((landing.match(/class="lp-btn" ref=\{cta\}/g) || []).length).toBe(1);
    expect(landing).toContain('Start my book, free');
    expect(landing).toContain('id="lp-phone"');
    expect(landing).not.toContain('href="#lp-');
    // FAQ: the three worries, honest about staff logins
    for (const q of ['Will it use up my data?', 'What if I lose my phone?', 'Can my staff use it?']) expect(landing).toContain(q);
    expect(landing).toContain('There are no separate staff logins yet');
    expect(landing).toContain('~{KB_OPEN} kB to open');
  });
  it('Nigeria wording only through the region switch', () => {
    const code = landing.split('\n').filter((l: string) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toMatch(/Nigerian shops/);
    expect(landing).toContain("ng ? 'region.shopsNG' : 'region.shops'");
  });
});
