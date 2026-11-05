import { describe, expect, it } from 'vitest';

type Fs = { readFileSync(p: string, enc: string): string };
const { readFileSync } = (await import(/* @vite-ignore */ 'node:' + 'fs')) as Fs;
const css = readFileSync('src/styles/app.css', 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(sel + ' {');
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('Reports period switcher (Today / 7 days / This month / All time)', () => {
  it('lets long HA/YO labels wrap inside their own equal segment instead of overlapping', () => {
    const seg = rule('.reports-main .report-seg');
    expect(seg).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    const chip = rule('.reports-main .report-seg .chip');
    expect(chip).toContain('white-space: normal');
    expect(chip).not.toContain('nowrap');
    expect(chip).toContain('overflow-wrap: break-word');
    expect(chip).toContain('min-width: 0');
    expect(chip).toContain('min-height: 44px');
  });
});
