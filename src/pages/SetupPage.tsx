import { useEffect, useState } from 'preact/hooks';
import { isRegionNigeria } from '../i18n';
import { currencySymbol, setCurrency } from '../lib/money';
import { defaultCurrency } from '../lib/currency';
import { CurrencyOptions } from '../components/CurrencyOptions';
import { saveShop, setShopLocale } from '../db/repo';
import { notifyChanged } from '../components/StatusBadge';
import { useLocale } from '../hooks/useLocale';
import { LOCALE_OPTIONS } from '../i18n';
import { navigate } from '../lib/router';

interface Props {
  onDone: () => void;
}

export function SetupPage({ onDone }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // NGN in Nigeria, else from the device locale; follows the region answer until the user picks.
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked || defaultCurrency(isRegionNigeria());
  useEffect(() => setCurrency(currency), [currency]);

  const submit = async (e: Event) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('setup.errorName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveShop(trimmed, currency);
      try {
        await setShopLocale(locale);
      } catch {
        /* localStorage locale is enough */
      }
      notifyChanged();
      onDone();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.couldNotSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="setup-screen">
      <div class="setup-lang" role="radiogroup" aria-label={t('settings.language')}>
        {LOCALE_OPTIONS.map((opt) => {
          const on = locale === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={on}
              class={on ? 'setup-lang-pill on' : 'setup-lang-pill'}
              lang={opt.id}
              onClick={() => setLocale(opt.id)}
            >
              {opt.nativeName}
            </button>
          );
        })}
      </div>

      <div class="setup-soft-hero">
        <div class="setup-crest" aria-hidden="true">
          {currencySymbol()}
        </div>
        <div class="setup-kicker">{t('setup.welcome')}</div>
        <h1>BashiBook</h1>
        <p>{t('setup.tagline')}</p>
        <ul class="setup-chips">
          <li>✓ {t('setup.chipOffline')}</li>
          <li>{t('setup.chipCurrency')}</li>
          <li>{LOCALE_OPTIONS.map((o) => o.nativeName).join(' · ')}</li>
        </ul>
      </div>

      <form onSubmit={submit}>
        <div class="field">
          <label for="shop-name">{t('setup.shopName')}</label>
          <input
            id="shop-name"
            class="input"
            placeholder={t('setup.placeholder')}
            value={name}
            autofocus
            maxlength={80}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          {error && (
            <div class="hint" style={{ color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </div>
        <div class="field">
          <label for="shop-currency">{t('setup.currency')}</label>
          <select
            id="shop-currency"
            class="input"
            value={currency}
            onChange={(e) => setPicked((e.target as HTMLSelectElement).value)}
          >
            <CurrencyOptions />
          </select>
        </div>
        <button class="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('setup.start')}
        </button>
      </form>
    </main>
  );
}
