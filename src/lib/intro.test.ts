import { describe, expect, it, vi, afterEach } from 'vitest';
import setup from '../pages/SetupPage.tsx?raw';
import app from '../App.tsx?raw';

afterEach(() => vi.unstubAllGlobals());

function stub({ phone, search = '', seen = false }: { phone: boolean; search?: string; seen?: boolean }) {
  const store = new Map<string, string>(seen ? [['bb-intro', '1']] : []);
  vi.stubGlobal('window', {
    location: { search },
    matchMedia: (q: string) => ({ matches: phone && q.includes('max-width: 640px') }),
  });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null });
}

describe('Phone intro (Spec 2)', () => {
  it('shows only on a first phone visit', async () => {
    const { wantsIntro } = await import('../pages/SetupPage');
    stub({ phone: true });
    expect(wantsIntro()).toBe(true);
    stub({ phone: true, seen: true });
    expect(wantsIntro()).toBe(false); // tapped Start this session
    stub({ phone: true, search: '?app=1' });
    expect(wantsIntro()).toBe(false); // installed PWA launch
    stub({ phone: false });
    expect(wantsIntro()).toBe(false); // desktop gets the landing
  });
  it('only for phones with no book, neutral copy, one tap to the focused form', () => {
    expect(app).toContain('fresh={!hasShop}');
    const intro = setup.slice(setup.indexOf("if (step === 'intro')"), setup.indexOf('return (\n    <main class="setup-screen">'));
    expect(intro).toContain("t('setup.title')");
    expect(intro).not.toContain('titleNg'); // no Pidgin on /
    expect(intro).not.toContain('BrandLockup'); // its tagline swaps to Pidgin for the NG region
    expect(intro).toContain("t('setup.introCta')");
    expect((intro.match(/btn-primary/g) || []).length).toBe(1);
    expect(setup).toContain('nameRef.current?.focus()');
  });
});
