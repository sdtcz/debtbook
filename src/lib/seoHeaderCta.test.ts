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

// Competitor scan 2026-11-11: the Kippa pages and /ng/credit-book-app still had a plain brand line,
// so at 390px the first screen showed only the language chips and no app button. Same header bar now.
const morePages: [string, string, boolean][] = [
  ['public/kippa-alternative.html', 'kippa', true],
  ['public/ng/kippa-alternative.html', 'kippa-ng', false],
  ['public/ng/credit-book-app.html', 'cb-ng', false],
];

describe('kippa and /ng/ SEO pages: app link in the header', () => {
  for (const [file, src, neutral] of morePages) {
    it(`${file}: brand links home and a tagged a.cta sits in the header`, () => {
      const html = readFileSync(file, 'utf8');
      const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
      expect(header).toContain(`<div class="bar"><a class="brand" href="/">BashiBook</a><a class="cta" href="/?app=1&amp;src=${src}">Start free</a></div>`);
      expect(html).toContain('header .cta{min-height:44px;');
      expect(html).toContain('header>*{max-width:692px;margin-left:auto;margin-right:auto}');
      expect(html).not.toContain('<div class="brand">');
      if (neutral) expect(html).not.toMatch(/Nigeria/);
    });
  }
});

describe('desktop landing demo', () => {
  it('keeps the balance and row values on screen during the Remind step', () => {
    const css = readFileSync('src/styles/landing.css', 'utf8');
    expect(css).toContain('@keyframes lp-a2{0%,63%{opacity:1}69%,94%{opacity:0}100%{opacity:1}}');
    expect(css).toContain('.lp-rec{position:absolute;left:0;right:0;top:14px;display:grid;gap:8px;animation:lp-a1 9s infinite}');
    expect(css).toContain('.lp-just{background:var(--okS);');
    expect(css).toContain('.lp .f1{animation:lp-a2 9s infinite}.lp .f3{animation:lp-a3 9s infinite;opacity:0}');
  });
});
