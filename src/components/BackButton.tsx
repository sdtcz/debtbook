import { useLocale } from '../hooks/useLocale';
import { goBack } from '../lib/router';

/** Header back control: mirrors Android/browser Back, falls back to a parent route. */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const { t } = useLocale();
  return (
    <button
      class="icon-btn back-btn"
      type="button"
      aria-label={t('common.back')}
      title={t('common.back')}
      onClick={() => goBack(fallback)}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
