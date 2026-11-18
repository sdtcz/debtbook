import { describe, expect, it } from 'vitest';
import help from '../../public/help.html?raw';

function text(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

describe('/help FAQPage structured data', () => {
  it('matches the visible questions and answers word for word', () => {
    const m = help.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const ld = JSON.parse(m![1]) as {
      '@type': string;
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(ld['@type']).toBe('FAQPage');
    const visible = [...help.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map((x) => ({
      q: text(x[1]),
      a: text(x[2]),
    }));
    expect(visible.length).toBeGreaterThanOrEqual(19);
    expect(ld.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(visible);
    expect(m![1]).not.toMatch(/<\//);
  });
});
