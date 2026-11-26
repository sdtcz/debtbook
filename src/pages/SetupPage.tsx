import { useEffect, useRef, useState } from 'preact/hooks';
import { isRegionNigeria } from '../i18n';
import { formatMoneyWhole, setCurrency, currencySymbol } from '../lib/money';
import { defaultCurrency } from '../lib/currency';
import { CurrencyOptions } from '../components/CurrencyOptions';
import { BrandLockup, brandTagline } from '../components/BrandLockup';
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
    const sym = currencySymbol(currency);
    const name = t('setup.introDemoName');
    const noteText = t('setup.introDemoNote').replace(/^Owes you · /, '');
    return (
      <main class="setup-screen intro-screen">
        <div class="intro-top">
          <img src="/icons/icon.svg" width={32} height={32} alt="" />
          <b>BashiBook</b>
          {langPills(true)}
        </div>
        <div class="intro-kick">{brandTagline(ng)}</div>
        <h1 class="setup-title">{t('setup.title')}</h1>
        <p class="setup-lede">{t('setup.lede')}</p>

        <div class="stage" role="img" aria-label={t('setup.introDemoLabel')}>
          <div class="stage-blob" aria-hidden="true" />
          <div class="phone-frame">
            <div class="phone-ear" aria-hidden="true" />
            <div class="phone-scr">
              <div class="phone-status" aria-hidden="true">
                <span>9:41</span>
                <span class="phone-icons">
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" aria-hidden="true"><rect x="0" y="6" width="2" height="4" rx=".4"/><rect x="3.5" y="4" width="2" height="6" rx=".4"/><rect x="7" y="2" width="2" height="8" rx=".4"/><rect x="10.5" y="0" width="2" height="10" rx=".4"/></svg>
                  <svg width="14" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M2 8.5a11 11 0 0 1 20 0"/><path d="M6 12a6.5 6.5 0 0 1 12 0"/><path d="M12 16.5h.01" strokeWidth="3"/></svg>
                  <svg width="18" height="10" viewBox="0 0 22 12" aria-hidden="true"><rect x=".7" y=".7" width="18" height="10.6" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4"/><rect x="2.2" y="2.2" width="13.4" height="7.6" rx="1" fill="currentColor"/><rect x="19.4" y="3.6" width="1.6" height="4.8" rx=".6" fill="currentColor"/></svg>
                </span>
              </div>
              <header class="phone-topbar">
                <span class="phone-back" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-8-7 8-7"/></svg>
                </span>
                <div class="phone-who">
                  <div class="phone-name">{name}</div>
                  <div class="phone-sub">{noteText}</div>
                </div>
              </header>
              <div class="phone-body">
                <section class="phone-balance">
                  <div class="phone-bal-row">
                    <div class="phone-av" aria-hidden="true">{sym}</div>
                    <div class="phone-bal-text">
                      <div class="phone-kicker">{t('customer.balanceTitle')}</div>
                      <div class="phone-amt">{amount}</div>
                      <p class="phone-label">{t('balance.owesYou')}</p>
                      <span class="phone-pays">{t('home.chipPaysOn', { day: 'Fri' })}</span>
                    </div>
                  </div>
                </section>
                <div class="phone-remind">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>
                  </svg>
                  {t('customer.remindOnWhatsApp', { name })}
                </div>
              </div>
            </div>
            <div class="phone-home-ind" aria-hidden="true" />
          </div>
        </div>

        <ul class="setup-checks">
          <li>{t('setup.check1')}</li>
          <li>{t('setup.check2')}</li>
          <li>{t('setup.check3Kb', { kb: KB_OPEN })}</li>
        </ul>
        <p class="intro-pro">
          <a href="/pricing">
            {t('setup.proLine')} {ng ? t('setup.proPriceNgn') : t('setup.proPrice')}
          </a>
        </p>
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
