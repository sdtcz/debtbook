import { BackButton } from '../components/BackButton';
import { APP_VERSION } from '../config';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n';

const PARAS: MessageKey[] = [
  'privacy.p1',
  'privacy.p2',
  'privacy.p3',
  'privacy.p4',
  'privacy.p5',
  'privacy.p6',
  'privacy.p7',
];

export function PrivacyPage() {
  const { t } = useLocale();
  return (
    <div class="app-shell">
      <header class="topbar">
        <BackButton fallback="/settings" />
        <h1>{t('privacy.title')}</h1>
      </header>
      <main class="main settings-main">
        <div class="card privacy-card">
          <ul class="privacy-list">
            {PARAS.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
        <p class="settings-about muted">BashiBook v{APP_VERSION}</p>
      </main>
    </div>
  );
}
