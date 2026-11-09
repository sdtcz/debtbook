import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_URL } from '../config';
import html from '../../public/ng/credit-book-app.html?raw';

describe('/ng/credit-book-app WhatsApp share loop', () => {
  it('has one share link tagged cb-ng-share pointing back to the /ng/ page', () => {
    const all = [...html.matchAll(/<a class="share" href="https:\/\/wa\.me\/\?text=([^"]+)"/g)];
    expect(all).toHaveLength(1);
    const text = decodeURIComponent(all[0][1]);
    expect(text).toContain(`${PUBLIC_APP_URL}/ng/credit-book-app?src=cb-ng-share`);
    expect(text).toMatch(/Nigerian shops/);
  });
  it('uses the same row layout as the other guide pages and is not rewritten by the ?src passthrough', () => {
    expect(html).toMatch(/<a class="share" [^>]*><span class="ic"><svg aria-hidden="true"[\s\S]*?<\/svg><\/span><span class="t">Share this page with a shop on WhatsApp<\/span><span class="chev" aria-hidden="true">&rsaquo;<\/span><\/a>/);
    expect(html).toMatch(/\.share\{[^}]*min-height:56px[^}]*text-align:left/);
    expect(html).toContain("querySelectorAll('a.cta')");
  });
});
