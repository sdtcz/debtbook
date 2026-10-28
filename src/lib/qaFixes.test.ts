import { describe, expect, it } from 'vitest';
// node:fs without @types/node (the app tsconfig type-checks tests in the build).
type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
import home from '../pages/HomePage.tsx?raw';
import detail from '../pages/CustomerDetailPage.tsx?raw';
import landing from '../pages/LandingPage.tsx?raw';
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
  });
  it('round 2: entry tally red only when overdue, compact FAB, one language at a time on neutral SEO pages', () => {
    expect(entry).toContain("isOverdue(customer, afterKobo) ? ' overdue' : ''");
    expect(css).toMatch(/\.entry-tally-amount\.debt \{\n  color: var\(--ink\);/);
    expect(home).toContain("rows.length >= 3 ? 'fab fab-compact' : 'fab'");
    for (const html of [cb, ka]) {
      expect(html).toContain('#ha,#yo{display:none}');
      for (const id of ['en', 'ha', 'yo']) expect(html).toContain(`<a href="#${id}" hreflang="${id}">`);
    }
  });
});
