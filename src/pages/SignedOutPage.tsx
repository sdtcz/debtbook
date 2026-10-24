import { useLocale } from '../hooks/useLocale';
import { LOCALE_OPTIONS } from '../i18n';

interface Props {
  shopName: string;
  onSignIn: () => void;
  onErase: () => void;
}

/** Shown after Log out (keep data): the book is still on this phone. */
export function SignedOutPage({ shopName, onSignIn, onErase }: Props) {
  const { locale, setLocale, t } = useLocale();
  return (
    <main class="setup-screen signed-out-screen">
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
        <img class="signed-out-mark" src="/icons/icon.svg" width={56} height={56} alt="" />
        <div class="setup-kicker">{t('signedOut.kicker')}</div>
        <h1>{t('signedOut.title')}</h1>
        <p>{t('signedOut.body', { shop: shopName })}</p>
      </div>
      <button class="btn btn-primary" type="button" onClick={onSignIn}>
        {t('signedOut.signIn', { shop: shopName })}
      </button>
      <p class="muted signed-out-note">{t('signedOut.syncNote')}</p>
      <button class="btn btn-ghost signed-out-erase" type="button" onClick={onErase}>
        {t('signedOut.erase')}
      </button>
    </main>
  );
}
