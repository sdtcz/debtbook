import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';
import type { StatementRange } from '../lib/statementPdf';

interface Props {
  customerName: string;
  onPick: (range: StatementRange) => Promise<void>;
  onClose: () => void;
}

/** Pick a date range, then build + share the statement PDF. */
export function StatementPdfSheet({ customerName, onPick, onClose }: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pick = async (r: StatementRange) => {
    setBusy(true);
    try {
      await onPick(r);
    } finally {
      setBusy(false);
    }
  };

  const ranges: StatementRange[] = ['all', 'last30', 'thisMonth'];
  const label = (r: StatementRange) =>
    r === 'all' ? t('customer.rangeAll') : r === 'last30' ? t('customer.rangeLast30') : t('customer.rangeThisMonth');

  return (
    <div
      class="bb-sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div class="bb-sheet" role="dialog" aria-modal="true" aria-labelledby="stmt-pdf-title" aria-describedby="stmt-pdf-body">
        <h2 id="stmt-pdf-title" class="bb-sheet-title">
          {t('customer.statementPdfTitle', { name: customerName })}
        </h2>
        <p id="stmt-pdf-body" class="bb-sheet-body">
          {t('customer.statementPdfBody')}
        </p>
        {ranges.map((r, i) => (
          <button
            key={r}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            class="bb-choice stmt-range"
            disabled={busy}
            onClick={() => pick(r)}
          >
            <span class="bb-choice-title">{label(r)}</span>
          </button>
        ))}
        <button type="button" class="btn btn-ghost" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
