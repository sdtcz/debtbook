import { describe, expect, it } from 'vitest';
import kippa from '../../public/kippa-alternative.html?raw';
import cba from '../../public/credit-book-app.html?raw';
import help from '../../public/help.html?raw';
import kippaNg from '../../public/ng/kippa-alternative.html?raw';
import cbaNg from '../../public/ng/credit-book-app.html?raw';

const footer = (h: string) => /<footer>([\s\S]*?)<\/footer>/.exec(h)?.[1] ?? '';

describe('neutral guide pages link to each other', () => {
  it('/kippa-alternative footer links to the other neutral guides and help', () => {
    const f = footer(kippa);
    for (const p of ['/credit-book-app', '/credit-book-format', '/whatsapp-payment-reminder', '/help']) {
      expect(f).toContain(`href="${p}"`);
    }
    expect(f).not.toContain('/ng/');
    expect(kippa).not.toMatch(/Nigeria/);
  });
  it('/credit-book-app footer links to the reminder page and help', () => {
    const f = footer(cba);
    expect(f).toContain('href="/whatsapp-payment-reminder"');
    expect(f).toContain('href="/help"');
    expect(f).not.toContain('/ng/');
  });
  it('/help footer links to every neutral guide', () => {
    const f = footer(help);
    for (const p of ['/credit-book-app', '/kippa-alternative', '/credit-book-format', '/whatsapp-payment-reminder']) {
      expect(f).toContain(`href="${p}"`);
    }
    expect(f).not.toContain('/ng/');
  });
  it('/ng pages footers link onward to guides and help (no more dead ends)', () => {
    const k = footer(kippaNg);
    for (const p of ['/ng/credit-book-app', '/credit-book-format', '/whatsapp-payment-reminder', '/help']) {
      expect(k).toContain(`href="${p}"`);
    }
    const c = footer(cbaNg);
    for (const p of ['/ng/kippa-alternative', '/credit-book-format', '/whatsapp-payment-reminder', '/help']) {
      expect(c).toContain(`href="${p}"`);
    }
  });
});
