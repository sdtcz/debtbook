import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL } from '../config';
import html from '../../public/kippa-alternative.html?raw';

describe('/kippa-alternative WhatsApp share loop', () => {
  it('has one share link tagged kippa-share pointing back to the neutral page', () => {
    const all = [...html.matchAll(/<a class="share" href="https:\/\/wa\.me\/\?text=([^"]+)"/g)];
    expect(all).toHaveLength(1);
    const text = decodeURIComponent(all[0][1]);
    expect(text).toContain(`${PUBLIC_APP_URL}/kippa-alternative?src=kippa-share`);
    expect(text).not.toMatch(/Nigeria/i);
  });
  it('uses the same row layout as the other guide pages and keeps the CTA passthrough', () => {
    expect(html).toMatch(/<a class="share" [^>]*><span class="ic"><svg aria-hidden="true"[\s\S]*?<\/svg><\/span><span class="t">Share this page with a shop on WhatsApp<\/span><span class="chev" aria-hidden="true">&rsaquo;<\/span><\/a>/);
    expect(html).toMatch(/\.share\{[^}]*min-height:56px[^}]*text-align:left/);
    expect(html).toContain("querySelectorAll('a.cta')");
    expect(html).not.toMatch(/Nigeria/);
  });
});
