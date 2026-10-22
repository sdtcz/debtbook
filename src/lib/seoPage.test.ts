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
    expect(html).toContain('Your book stays on your phone, works offline once opened, free.');
  });
  it('makes no claims about Kippa beyond the neutral question and trademark note', () => {
    const kippaLines = html.split('\n').filter((l: string) => /kippa/i.test(l) && !/src=kippa|kippa-/.test(l));
    for (const l of kippaLines) expect(l).toMatch(/Kippa alternative|trademark of its owner|not affiliated/i);
    expect(html).not.toMatch(/shut ?down|went dark|lost (their|your) data/i);
  });
  it('only claims offline use once opened, never "without data or network"', () => {
    expect(html).not.toMatch(/without (data|network)|data no dey|ba tare da data|láìsí dátà/i);
    expect(html).toContain('Works offline once opened');
  });
  it('passes ?src= through to the app link, sanitised, with the static href as fallback', () => {
    const ctas = html.match(/<a class="cta" href="[^"]+">/g) || [];
    expect(ctas.length).toBe(4);
    for (const a of ctas) expect(a).toContain('href="/?app=1&amp;src=kippa"');
    const code = html.match(/<script>\n([\s\S]*?)<\/script>/)![1];
    const run = (search: string) => {
      const links = [0, 1].map(() => ({ href: '/?app=1&src=kippa', setAttribute(_: string, v: string) { this.href = v; } }));
      new Function('location', 'document', code)({ search }, { querySelectorAll: () => links });
      return links.map((l) => l.href);
    };
    expect(run('')).toEqual(['/?app=1&src=kippa', '/?app=1&src=kippa']);
    expect(run('?src=tw')[1]).toBe('/?app=1&src=kippa-tw');
    expect(run('?utm=x&src=Google_Ads%20NG!')[0]).toBe('/?app=1&src=kippa-googleadsng');
    expect(run('?src=' + 'a'.repeat(40))[0]).toBe('/?app=1&src=kippa-' + 'a'.repeat(20));
    expect(run('?src=%3Cscript%3E"')[0]).toBe('/?app=1&src=kippa-script');
    expect(run('?src=%E0%A4%A')[0]).toBe('/?app=1&src=kippa');
    expect(run('?src=!!!')[0]).toBe('/?app=1&src=kippa');
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
