import { useEffect, useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';
import { verifyPin } from '../lib/pin';

interface Props {
  salt: string;
  hash: string;
  shopName?: string;
  onUnlock: () => void;
  /** Override the heading (default: Unlock) — used by "Ask PIN before deleting". */
  title?: string;
  hint?: string;
  /** When set, shows a Cancel button (and Escape closes). */
  onCancel?: () => void;
}

export function PinLock({ salt, hash, shopName, onUnlock, title, hint, onCancel }: Props) {
  const { t } = useLocale();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (digits.length !== 4) return;
    let cancelled = false;
    (async () => {
      const ok = await verifyPin(salt, digits, hash);
      if (cancelled) return;
      if (ok) {
        setError(false);
        onUnlock();
      } else {
        setError(true);
        setShake((n) => n + 1);
        setDigits('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [digits, salt, hash, onUnlock]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape' && onCancel) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const press = (d: string) => {
    setError(false);
    setDigits((prev) => (prev.length < 4 ? prev + d : prev));
  };

  const back = () => setDigits((prev) => prev.slice(0, -1));

  const name = shopName?.trim();

  return (
    <div class="pin-overlay" role="dialog" aria-modal="true" aria-label={title || t('pin.unlock')}>
      <div class={`pin-card pin-soft${error ? ' error' : ''}`}>
        <section class="pin-soft-hero">
          <div class="pin-soft-crest" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2.5" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          {name && <div class="pin-soft-kicker">{name}</div>}
          <h2>{title || t('pin.unlock')}</h2>
          {error ? (
            <p class="pin-soft-wrong" role="alert">
              {t('pin.wrong')}
            </p>
          ) : (
            <p class="pin-soft-hint">{hint || t('pin.enter')}</p>
          )}
          <div key={shake} class={`pin-dots${shake ? ' shake' : ''}`} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} class={digits.length > i ? 'filled' : ''} />
            ))}
          </div>
        </section>
        <div class="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
            k === '' ? (
              <span key="empty" />
            ) : (
              <button
                key={k}
                type="button"
                class={k === '⌫' ? 'pin-back' : undefined}
                onClick={() => (k === '⌫' ? back() : press(k))}
                aria-label={k === '⌫' ? t('pin.backspace') : k}
              >
                {k}
              </button>
            ),
          )}
        </div>
        {onCancel && (
          <button type="button" class="btn btn-ghost pin-cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
