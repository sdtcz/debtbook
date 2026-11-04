import { describe, it, expect } from 'vitest';
type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;

// Competitor scan 2026-11-04: on phones the only app button on these pages sat far below the fold
// (about 3,900px down on /credit-book-format). The header now carries a home link and a 44px "Start free" pill.
const pages: [string, string][] = [
  ['public/credit-book-format.html', 'cbf'],
  ['public/whatsapp-payment-reminder.html', 'wr'],
  ['public/credit-book-app.html', 'cb'],
];

describe('neutral SEO pages: app link in the header', () => {
  for (const [file, src] of pages) {
    it(`${file}: brand links home and a tagged a.cta sits in the header`, () => {
      const html = readFileSync(file, 'utf8');
      const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
      expect(header).toContain(`<div class="bar"><a class="brand" href="/">BashiBook</a><a class="cta" href="/?app=1&amp;src=${src}">Start free</a></div>`);
      expect(html).toContain('header .cta{min-height:44px;');
      expect(html).toContain('header>*{max-width:692px;margin-left:auto;margin-right:auto}');
      expect(html).not.toContain('<div class="brand">');
      expect(html).not.toMatch(/Nigeria/);
    });
  }
});

describe('desktop landing demo', () => {
  it('keeps the balance and row values on screen during the Remind step', () => {
    const css = readFileSync('src/styles/landing.css', 'utf8');
    expect(css).toContain('@keyframes lp-a2{0%,63%{opacity:1}69%,94%{opacity:0}100%{opacity:1}}');
    expect(css).toContain('.lp .f1{animation:lp-a2 9s infinite}.lp .lp-rb{animation-name:lp-a1}');
  });
});
