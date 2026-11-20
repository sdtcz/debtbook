import { describe, expect, it } from 'vitest';
import notFound from '../../public/404.html?raw';
import vercelJson from '../../vercel.json?raw';

describe('404 page helpful links', () => {
  it('links to the live guide pages and home, neutral copy, no script, still noindex', () => {
    const rewrites = (JSON.parse(vercelJson) as { rewrites: { source: string }[] }).rewrites.map((r) => r.source);
    const nav = notFound.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? '';
    const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/credit-book-format', '/whatsapp-payment-reminder', '/credit-book-app', '/help', '/']);
    for (const h of hrefs) expect(rewrites).toContain(h);
    expect(notFound).toContain('href="/?app=1"');
    expect(notFound).toContain('<meta name="robots" content="noindex">');
    expect(notFound).not.toMatch(/<script|src=|kippa|okcredit|khatabook|vyapar|Nigeria|₦|\$\d|free forever/i);
  });
});
