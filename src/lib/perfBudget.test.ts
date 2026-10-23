import { afterEach, describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.ts?raw';
import pkg from '../../package.json';
import appSrc from '../App.tsx?raw';
import { wantsSaveData } from './saveData';

describe('low-data guards', () => {
  it('every build runs the bundle budget (fails the deploy when the app gets heavier)', () => {
    expect(pkg.scripts.build).toContain('node scripts/budget.mjs');
  });

  it('Hausa/Yoruba strings and the desktop landing are not precached (fetched on demand, then cached)', () => {
    for (const g of ["'**/assets/ha-*.js'", "'**/assets/yo-*.js'", "'**/assets/LandingPage-*.js'"]) expect(viteConfig).toContain(g);
    expect(viteConfig).toContain("handler: 'CacheFirst'");
  });

  it('fixed entry name + stable vendor/en chunks, so a deploy re-sends only what changed', () => {
    expect(viteConfig).toContain("entryFileNames: 'app.js'");
    expect(viteConfig).toMatch(/return 'vendor'/);
    expect(viteConfig).toMatch(/return 'en'/);
  });

  it('screens a new phone does not need at start are lazy-loaded', () => {
    for (const p of ['HomePage', 'CustomerDetailPage', 'EntryFormPage', 'PayMePage', 'SetupPage', 'SettingsPage']) {
      expect(appSrc).not.toMatch(new RegExp(`import \\{ ${p} \\} from`));
      expect(appSrc).toContain(`const ${p} = lazyPage(`);
    }
  });
});

describe('Save-Data', () => {
  const nav = globalThis.navigator;
  afterEach(() => Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true }));
  const setNav = (saveData: boolean) =>
    Object.defineProperty(globalThis, 'navigator', { value: { connection: { saveData } }, configurable: true });

  it('follows navigator.connection.saveData', () => {
    setNav(true);
    expect(wantsSaveData()).toBe(true);
    setNav(false);
    expect(wantsSaveData()).toBe(false);
  });
});
