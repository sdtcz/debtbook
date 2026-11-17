import { describe, expect, it } from 'vitest';
import help from '../../public/help.html?raw';

describe('/help WhatsApp share row', () => {
  it('has one tagged wa.me share link, neutral copy, no script', () => {
    const links = help.match(/href="https:\/\/wa\.me\/\?text=[^"]+"/g) ?? [];
    expect(links).toHaveLength(1);
    const text = decodeURIComponent((links[0] ?? '').slice('href="https://wa.me/?text='.length, -1));
    expect(text).toContain('https://bashibook.app/help?src=help-share');
    expect(text).not.toMatch(/Nigeria|kippa|vercel\.app/i);
    expect(help).toContain('id="share"');
    expect(help).not.toMatch(/<script>/);
  });
});
