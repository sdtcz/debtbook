import { describe, expect, it } from 'vitest';
import cbApp from '../../public/credit-book-app.html?raw';
import kippa from '../../public/kippa-alternative.html?raw';
import ngCbApp from '../../public/ng/credit-book-app.html?raw';
import ngKippa from '../../public/ng/kippa-alternative.html?raw';

const LINE = 'Your book stays on your phone, works offline once opened, free.';
const pages: Record<string, string> = {
  'credit-book-app': cbApp,
  'kippa-alternative': kippa,
  'ng/credit-book-app': ngCbApp,
  'ng/kippa-alternative': ngKippa,
};

describe('guide pages: hero promise shown once', () => {
  for (const [name, html] of Object.entries(pages)) {
    it(`${name}: promise is in the header and not repeated as the English section lead`, () => {
      const body = html.slice(html.indexOf('<body'));
      const header = body.slice(0, body.indexOf('</header>'));
      expect(header).toContain(LINE);
      expect(body.split(LINE).length - 1).toBe(1);
      const en = body.slice(body.indexOf('<section id="en"'), body.indexOf('</section>', body.indexOf('<section id="en"')));
      expect(en).toContain('<h2>');
      expect(en).toContain('<ul>');
      // other-language leads stay
      expect(body).toMatch(/<section id="ha" lang="ha">\s*<h2>[^<]+<\/h2>\s*<p class="lead">/);
    });
  }
});
