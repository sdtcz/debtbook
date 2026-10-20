import { useLocale } from '../hooks/useLocale';

/** Shown when the on-phone database could not be read (instead of a misleading empty state). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <div class="empty load-error" role="alert">
      <div class="load-error-glyph" aria-hidden="true">
        !
      </div>
      <strong>{t('common.loadFailedTitle')}</strong>
      <p>{t('common.loadFailedBody')}</p>
      <button type="button" class="btn btn-primary" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}
