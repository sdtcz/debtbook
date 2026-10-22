import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL } from '../config';
import pageHtml from '../../public/kippa-alternative.html?raw';
import sitemap from '../../public/sitemap.xml?raw';
import robots from '../../public/robots.txt?raw';
import vercelJson from '../../vercel.json?raw';

const files: Record<string, string> = {
  'public/kippa-alternative.html': pageHtml,
  'public/sitemap.xml': sitemap,
  'public/robots.txt': robots,
  'vercel.json': vercelJson,
};
const read = (p: string) => files[p];

describe('/kippa-alternative static page', () => {
  const html = read('public/kippa-alternative.html');
  it('has title, meta description, canonical and the four languages', () => {
    expect(html).toMatch(/<title>[^<]*Kippa alternative[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,160}">/);
    expect(html).toContain(`<link rel="canonical" href="${PUBLIC_APP_URL}/kippa-alternative">`);
    for (const lang of ['en', 'pcm', 'ha', 'yo']) expect(html).toContain(`<section id="${lang}" lang="${lang}">`);
    expect(html).toContain('Your book stays on your phone, works offline, free.');
  });
  it('makes no claims about Kippa beyond the neutral question and trademark note', () => {
    const kippaLines = html.split('\n').filter((l: string) => /kippa/i.test(l) && !/src=kippa|kippa-alternative/.test(l));
    for (const l of kippaLines) expect(l).toMatch(/Kippa alternative|trademark of its owner|not affiliated/i);
    expect(html).not.toMatch(/shut ?down|went dark|lost (their|your) data/i);
  });
  it('is in the sitemap and robots.txt points to it', () => {
    expect(read('public/sitemap.xml')).toContain(`<loc>${PUBLIC_APP_URL}/kippa-alternative</loc>`);
    expect(read('public/robots.txt')).toContain(`Sitemap: ${PUBLIC_APP_URL}/sitemap.xml`);
  });
  it('vercel serves it before the SPA catch-all', () => {
    const v = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] };
    const i = v.rewrites.findIndex((r) => r.source === '/kippa-alternative');
    const spa = v.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(spa);
  });
});
