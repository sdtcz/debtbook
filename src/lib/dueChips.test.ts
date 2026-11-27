import { describe, expect, it } from 'vitest';

type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
const css = readFileSync('src/styles/app.css', 'utf8');
const tsx = readFileSync('src/pages/EntryFormPage.tsx', 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf('\n' + sel + ' {');
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe("Credit entry 'Will pay on' chips", () => {
  it('sit in an even 2-column grid so HA/YO labels wrap instead of leaving a ragged row', () => {
    expect(rule('.due-chips')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  it('match the .chip system: 44px tap, 1.5px border, weight 700, wrap-safe', () => {
    const chip = rule('.due-chip');
    expect(chip).toContain('min-height: var(--tap-min, 44px)');
    expect(chip).toContain('border: 1.5px solid var(--border)');
    expect(chip).toContain('font-weight: 700');
    expect(chip).toContain('min-width: 0');
    expect(chip).toContain('overflow-wrap: break-word');
    expect(chip).not.toContain('nowrap');
    const on = rule('.due-chip.active');
    expect(on).toContain('background: var(--primary-soft)');
    expect(on).toContain('border-color: var(--primary)');
  });

  it('expose their selected state to screen readers', () => {
    expect(tsx).toContain('aria-pressed={active}');
    expect(tsx).toContain('aria-pressed={pickActive}');
  });

  it('keep the legend and preview line readable (no colour lighter than muted)', () => {
    expect(rule('.due-picker legend')).toContain('color: var(--muted)');
    expect(rule('.due-preview')).toContain('color: var(--primary-dark)');
    expect(css).toMatch(/--muted: #475569;/);
  });
});
