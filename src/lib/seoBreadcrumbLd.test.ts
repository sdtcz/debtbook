import { describe, expect, it } from 'vitest';
import cba from '../../public/credit-book-app.html?raw';
import cbf from '../../public/credit-book-format.html?raw';
import wpr from '../../public/whatsapp-payment-reminder.html?raw';
import help from '../../public/help.html?raw';
import kippa from '../../public/kippa-alternative.html?raw';
import ngCba from '../../public/ng/credit-book-app.html?raw';
import ngKippa from '../../public/ng/kippa-alternative.html?raw';

const pages: [string, string, string][] = [
  ['credit-book-app', cba, 'Credit book app'],
  ['credit-book-format', cbf, 'Credit book format'],
  ['whatsapp-payment-reminder', wpr, 'WhatsApp payment reminder'],
  ['help', help, 'Help & FAQ'],
  ['kippa-alternative', kippa, 'Kippa alternative'],
  ['ng/credit-book-app', ngCba, 'Credit book app for Nigerian shops'],
  ['ng/kippa-alternative', ngKippa, 'Kippa alternative'],
];

describe('guide pages BreadcrumbList structured data', () => {
  for (const [path, html, name] of pages) {
    it(`/${path} has one Home > page breadcrumb matching its canonical URL`, () => {
      const raw = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      const crumbs = raw.map((r) => JSON.parse(r)).filter((b) => b['@type'] === 'BreadcrumbList');
      expect(crumbs.length).toBe(1);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)![1];
      expect(canonical).toBe(`https://bashibook.app/${path}`);
      expect(crumbs[0].itemListElement).toEqual([
        { '@type': 'ListItem', position: 1, name: 'BashiBook', item: 'https://bashibook.app/' },
        { '@type': 'ListItem', position: 2, name, item: canonical },
      ]);
      // data only: inside <head>, no closing tags inside the JSON
      expect(html.indexOf('"BreadcrumbList"')).toBeLessThan(html.indexOf('</head>'));
      for (const r of raw) expect(r).not.toMatch(/<\//);
    });
  }
  it('neutral guide pages do not name a competitor in their breadcrumb', () => {
    for (const html of [cba, cbf, wpr, help, ngCba]) {
      const bc = html.match(/<script type="application\/ld\+json">(\{[^<]*"BreadcrumbList"[^<]*)<\/script>/)![1];
      expect(bc).not.toMatch(/kippa|oKash|okcredit|khatabook|bos afora/i);
    }
  });
});
