import { useEffect, useRef, useState } from 'preact/hooks';
import { getShop } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n';
import { isValidPin } from '../lib/pin';
import {
  checkRecoveryCode,
  eraseAndRestore,
  readBackupFile,
  resetPinWithRecoveryCode,
  type RecoveryCheck,
} from '../lib/pinRecovery';
import type { BackupPayload, ShopProfile } from '../lib/types';

interface Props {
  onClose: () => void;
  /** New PIN saved after a verified recovery code. */
  onReset: () => void;
  /** Phone erased (and maybe restored): the app reloads. */
  onErased: () => void;
}

const MSG: Record<Exclude<RecoveryCheck, 'ok'>, MessageKey> = {
  format: 'forgot.badFormat',
  'no-cloud': 'forgot.cloudNone',
  mismatch: 'forgot.mismatch',
  wrong: 'forgot.wrong',
  offline: 'forgot.offline',
  failed: 'forgot.failed',
};

/** Forgot-PIN help: recovery code (verified against the cloud backup) or erase + restore from file. */
export function ForgotPinSheet({ onClose, onReset, onErased }: Props) {
  const { t } = useLocale();
  const [shop, setShop] = useState<ShopProfile | undefined>();
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState<'' | 'check' | 'save' | 'erase'>('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getShop().then(setShop);
  }, []);

  const hasCloud = Boolean(shop?.cloudBackupId);

  const check = async () => {
    setBusy('check');
    setMsg('');
    const r = await checkRecoveryCode(code, shop);
    setBusy('');
    if (r === 'ok') setVerified(true);
    else setMsg(t(MSG[r]));
  };

  const save = async () => {
    if (!isValidPin(pin1)) return setMsg(t('settings.pinMustBe4'));
    if (pin1 !== pin2) return setMsg(t('forgot.pinMismatch'));
    setBusy('save');
    setMsg('');
    const r = await resetPinWithRecoveryCode(code, shop, pin1);
    setBusy('');
    if (r === 'ok') onReset();
    else setMsg(r === 'bad-pin' ? t('settings.pinMustBe4') : t(MSG[r]));
  };

  const erase = async (backup: BackupPayload | null) => {
    setBusy('erase');
    try {
      await eraseAndRestore(backup);
    } finally {
      onErased();
    }
  };

  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const backup = await readBackupFile(file);
    if (!backup) return setMsg(t('forgot.badFile'));
    const ok = confirm(
      t('forgot.eraseConfirm', { file: file.name, customers: backup.customers.length, entries: backup.entries.length }),
    );
    if (ok) await erase(backup);
  };

  const eraseEmpty = async () => {
    if (confirm(t('forgot.eraseEmptyConfirm'))) await erase(null);
  };

  return (
    <div class="forgot-pin" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
      <h2 id="forgot-title">{t('forgot.title')}</h2>
      <p class="hint">{t('forgot.intro')}</p>

      <section class="forgot-step">
        <h3>{t('forgot.cloudTitle')}</h3>
        {!hasCloud ? (
          <p class="hint">{t('forgot.cloudNone')}</p>
        ) : !verified ? (
          <>
            <p class="hint">{t('forgot.cloudBody')}</p>
            <label for="forgot-code">{t('forgot.codeLabel')}</label>
            <input
              id="forgot-code"
              class="input"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck={false}
              value={code}
              onInput={(e) => setCode((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="btn btn-primary" disabled={!!busy || !code.trim()} onClick={check}>
              {busy === 'check' ? t('forgot.verifying') : t('forgot.verify')}
            </button>
          </>
        ) : (
          <>
            <p class="hint">{t('forgot.newPinTitle')}</p>
            <label for="forgot-pin1">{t('forgot.newPin')}</label>
            <input id="forgot-pin1" class="input" type="password" inputMode="numeric" maxLength={4} autocomplete="new-password"
              value={pin1} onInput={(e) => setPin1((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
            <label for="forgot-pin2">{t('forgot.confirmPin')}</label>
            <input id="forgot-pin2" class="input" type="password" inputMode="numeric" maxLength={4} autocomplete="new-password"
              value={pin2} onInput={(e) => setPin2((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
            <button type="button" class="btn btn-primary" disabled={!!busy} onClick={save}>
              {busy === 'save' ? t('common.saving') : t('forgot.saveNewPin')}
            </button>
          </>
        )}
      </section>

      <section class="forgot-step forgot-danger">
        <h3>{t('forgot.eraseTitle')}</h3>
        <p class="hint">{t('forgot.eraseBody')}</p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        <button type="button" class="btn btn-secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === 'erase' ? t('forgot.erasing') : t('forgot.chooseFile')}
        </button>
        <button type="button" class="btn btn-ghost forgot-erase-empty" disabled={!!busy} onClick={eraseEmpty}>
          {t('forgot.eraseEmpty')}
        </button>
      </section>

      {msg && (
        <p class="forgot-msg" role="alert">
          {msg}
        </p>
      )}
      <button type="button" class="btn btn-ghost" disabled={busy === 'erase'} onClick={onClose}>
        {t('common.back')}
      </button>
    </div>
  );
}
