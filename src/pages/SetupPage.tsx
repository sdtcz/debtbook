import { useEffect, useRef, useState } from 'preact/hooks';
import { isRegionNigeria } from '../i18n';
import { formatMoneyWhole, setCurrency } from '../lib/money';
import { defaultCurrency } from '../lib/currency';
import { CurrencyOptions } from '../components/CurrencyOptions';
import { BrandLockup } from '../components/BrandLockup';
import { saveShop, setShopLocale } from '../db/repo';
import { notifyChanged } from '../components/StatusBadge';
import { useLocale } from '../hooks/useLocale';
import { LOCALE_OPTIONS } from '../i18n';
import { navigate } from '../lib/router';
import { KB_OPEN } from '../lib/sizes';
import { isForcedApp, isPhoneLikeViewport } from '../lib/viewportMode';

const INTRO_KEY = 'bb-intro';

/** Spec 2: first phone visit with no book sees one intro screen; ?app=1 (installed PWA) and desktop skip it. */
export function wantsIntro(): boolean {
  try {
    return isPhoneLikeViewport() && !isForcedApp() && localStorage.getItem(INTRO_KEY) !== '1';
  } catch {
    return false;
  }
}

interface Props {
  onDone: () => void;
  /** No book yet on this phone (not the explicit #/setup route). */
  fresh?: boolean;
}

export function SetupPage({ onDone, fresh = false }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [step, setStep] = useState<'intro' | 'form'>(() =>
    fresh && wantsIntro() ? 'intro' : 'form',
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const toForm = () => {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* private mode: show the form anyway */
    }
    setStep('form');
  };
  useEffect(() => {
    if (step === 'form') nameRef.current?.focus();
  }, [step]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // NGN in Nigeria, else from the device locale; follows the region answer until the user picks.
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked || defaultCurrency(isRegionNigeria());
  useEffect(() => setCurrency(currency), [currency]);

  const ng = isRegionNigeria();
  const fileRef = useRef<HTMLInputElement>(null);
  // "Have a backup? Restore it": the same JSON backup as Settings → Restore, before any shop exists.
  const restore = async (file: File) => {
    setError(null);
    try {
      const { importBackup, readJsonFile } = await import('../lib/backup');
      const data = await readJsonFile(file);
      await importBackup(data);
      notifyChanged();
      if ((data as { shop?: unknown } | null)?.shop) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.importFailed'));
    }
  };

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

  const langPills = (short = false) => (
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
            aria-label={short ? opt.nativeName : undefined}
            onClick={() => setLocale(opt.id)}
          >
            {short ? opt.id.toUpperCase() : opt.nativeName}
          </button>
        );
      })}
    </div>
  );

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      class="sr-only"
      tabIndex={-1}
      aria-label={t('settings.importBackupFile')}
      onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) void restore(f);
        (e.target as HTMLInputElement).value = '';
      }}
    />
  );
  const restoreBtn = (
    <button
      type="button"
      class="btn btn-ghost setup-restore"
      onClick={() => fileRef.current?.click()}
    >
      {t('setup.restore')}
    </button>
  );

  if (step === 'intro') {
    const amount = formatMoneyWhole(currency === 'NGN' ? 1250000 : 2500, currency);
    const name = t('setup.introDemoName');
    return (
      <main class="setup-screen intro-screen">
        <div class="intro-top">
          <img src="/icons/icon.svg" width={32} height={32} alt="" />
          <b>BashiBook</b>
          {langPills(true)}
        </div>
        <h1 class="setup-title">{t('setup.title')}</h1>
        <p class="setup-lede">{t('setup.lede')}</p>
        <div class="intro-demo" role="img" aria-label={t('setup.introDemoLabel')}>
          <div class="list-item-wrap soft-list-row debt">
            <div class="list-item soft-list-link">
              <div class="soft-list-avatar" aria-hidden="true">
                {name.charAt(0)}
              </div>
              <div class="meta soft-list-meta">
                <div class="name">{name}</div>
                <div class="hint soft-list-hint">{t('setup.introDemoNote')}</div>
              </div>
              <div class="amount-pill soft-list-pill debt">{amount}</div>
            </div>
            <div class="intro-wa">{t('setup.introRemind', { name })}</div>
            <div class="intro-bub">{t('setup.introBubble', { name, amount })}</div>
          </div>
        </div>
        <ul class="setup-checks">
          <li>{t('setup.check1')}</li>
          <li>{t('setup.check2')}</li>
          <li>{t('setup.check3Kb', { kb: KB_OPEN })}</li>
        </ul>
        <div class="intro-cta">
          <button type="button" class="btn btn-primary btn-block" onClick={toForm}>
            {t('setup.introCta')}
          </button>
          {restoreBtn}
        </div>
        {fileInput}
        {error && (
          <div class="hint" role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
      </main>
    );
  }

  return (
    <main class="setup-screen">
      {langPills()}

      <div class="setup-soft-hero">
        <BrandLockup heading />
        <h2 class="setup-title">{ng && locale === 'en' ? t('setup.titleNg') : t('setup.title')}</h2>
        <p>{t('setup.lede')}</p>
        <ul class="setup-checks">
          <li>{t('setup.check1')}</li>
          <li>{t('setup.check2')}</li>
          <li>{t('setup.check3')}</li>
        </ul>
      </div>

      <form onSubmit={submit}>
        <div class="field">
          <label for="shop-name">{t('setup.shopName')}</label>
          <input
            id="shop-name"
            class="input"
            placeholder={ng ? t('setup.placeholder') : t('setup.placeholderNeutral')}
            ref={nameRef}
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
      {restoreBtn}
      {fileInput}
    </main>
  );
}
