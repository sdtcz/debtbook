import { describe, expect, it } from 'vitest';
import { getLocale, loadLocale, localeNativeName, setLocale, t } from './index';

describe('lazy locales', () => {
  it('falls back to English for unloaded locales, then switches once loaded', async () => {
    await setLocale('en');
    expect(t('supplier.payment', undefined, 'ha')).toBe('I paid'); // ha not loaded yet → en fallback
    expect(localeNativeName('yo')).toBe('Yorùbá');
    await setLocale('ha');
    expect(getLocale()).toBe('ha');
    expect(t('supplier.payment')).toBe('Na biya');
    await loadLocale('yo');
    expect(t('supplier.payment', undefined, 'yo')).toBe('Mo ti san');
  });

  it('the latest choice wins a race', async () => {
    await setLocale('en');
    const a = setLocale('yo');
    const b = setLocale('ha');
    await Promise.all([a, b]);
    expect(getLocale()).toBe('ha');
    await setLocale('en');
  });
});
