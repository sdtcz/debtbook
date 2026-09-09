import { useState } from 'preact/hooks';
import { saveShop } from '../db/repo';
import { notifyChanged } from '../components/StatusBadge';
import { useLocale } from '../hooks/useLocale';
import { navigate } from '../lib/router';

interface Props {
  onDone: () => void;
}

export function SetupPage({ onDone }: Props) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await saveShop(trimmed);
      notifyChanged();
      onDone();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.couldNotSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="setup-screen">
      <h1>DebtBook</h1>
      <p>{t('setup.tagline')}</p>
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
        <button class="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('setup.start')}
        </button>
      </form>
    </div>
  );
}
