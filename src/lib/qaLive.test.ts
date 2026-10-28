import { describe, expect, it } from 'vitest';
import home from '../pages/HomePage.tsx?raw';
import landing from '../pages/LandingPage.tsx?raw';
import app from '../App.tsx?raw';
import main from '../main.tsx?raw';
import { shortName } from '../pages/HomePage';

type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
const css = readFileSync('src/styles/app.css', 'utf8');
const lpCss = readFileSync('src/styles/landing.css', 'utf8');

describe('QA live fixes (Oct 28, Figma Bro)', () => {
  it('P1: chase card column can shrink below a long name', () => {
    expect(css).toMatch(/\.chase-today-list \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });
  it('P2: long names ellipsize, badges never do', () => {
    expect(home).toContain('<span class="nt">{row.customer.name}</span>');
    expect(css).toContain('.soft-list-meta .name .nt{min-width:0;overflow:hidden;text-overflow:ellipsis}');
    expect(css).toContain('.soft-list-meta .name>span:not(.nt){flex:none}');
  });
  it('P2: landing demo row text swaps with the amount (still frame reads Settled)', () => {
    expect(landing).toMatch(/<small class="lp-sw">\s*<span class="f1">Owes for 4 days · 2 bags of rice<\/span>\s*<span class="f3">Settled · paid today<\/span>/);
    expect(lpCss).toContain('.lp-sw{display:grid}.lp-sw>span{grid-area:1/1}');
    expect(css).not.toContain('.lp-sw');
  });
  it('P3: red only for overdue, 44px growth buttons, short hero names', () => {
    expect(css).toMatch(/\.report-tile\.debt \{\s*border-top: 3px solid var\(--ink\)/);
    expect(css).toMatch(/\.growth-card-actions \.btn \{\s*width: auto;\s*min-height: 44px/);
    expect(shortName('Oluwaseun Adebayo-Ogunlesi')).toBe('Oluwaseun Adebayo…');
    expect(shortName('Ngozi A.')).toBe('Ngozi A.');
    expect(home).toContain('name: shortName(oldest.customer.name)');
  });
  it('landing: no /api/geo, view count after load on idle', () => {
    expect(main).not.toContain('refreshRegion');
    expect(landing).not.toContain('refreshRegion');
    expect(app).toMatch(/if \(!showApp \|\| geoAsked\) return;[\s\S]*refreshRegion\(\)/);
    expect(landing).toContain("addEventListener('load', idle, { once: true })");
    expect(landing).toContain('requestIdleCallback(go');
  });
});
