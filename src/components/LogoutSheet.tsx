import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';

interface Props {
  cloudEnabled: boolean;
  hasPin: boolean;
  onKeep: () => Promise<void>;
  onErase: () => Promise<void>;
  onClose: () => void;
}

/** Log out confirm dialog: keep data (default, safe) vs erase this phone. */
export function LogoutSheet({ cloudEnabled, hasPin, onKeep, onErase, onClose }: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      class="bb-sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        class="bb-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-body"
      >
        <h2 id="logout-title" class="bb-sheet-title">
          {t('logout.sheetTitle')}
        </h2>
        <p id="logout-body" class="bb-sheet-body">
          {t('logout.body')}
        </p>
        <p class="bb-sheet-note">{cloudEnabled ? t('logout.cloudOn') : t('logout.cloudOff')}</p>
        {!hasPin && <p class="bb-sheet-note">{t('logout.pinTip')}</p>}

        <button
          ref={keepRef}
          type="button"
          class="bb-choice"
          disabled={busy}
          onClick={() => run(onKeep)}
        >
          <span class="bb-choice-title">{busy ? t('logout.working') : t('logout.keepTitle')}</span>
          <span class="bb-choice-sub">{t('logout.keepSub')}</span>
        </button>
        <button
          type="button"
          class="bb-choice danger"
          disabled={busy}
          onClick={() => {
            if (!confirm(t('logout.eraseConfirm'))) return;
            void run(onErase);
          }}
        >
          <span class="bb-choice-title">{t('logout.eraseTitle')}</span>
          <span class="bb-choice-sub">{t('logout.eraseSub')}</span>
        </button>
        <button type="button" class="btn btn-ghost" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
