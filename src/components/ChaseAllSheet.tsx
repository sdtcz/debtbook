import { useMemo, useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';
import type { CustomerBalance } from '../lib/types';
import { formatNaira } from '../lib/money';
import { remindCustomer } from '../lib/sms';

interface Props {
  shopName: string;
  overdue: CustomerBalance[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function ChaseAllSheet({ shopName, overdue, onClose, onToast }: Props) {
  const { t } = useLocale();
  const withPhone = useMemo(
    () => overdue.filter((r) => Boolean(r.customer.phone?.trim())),
    [overdue],
  );
  const noPhoneCount = overdue.length - withPhone.length;
  const [index, setIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const totalKobo = useMemo(
    () => overdue.reduce((sum, r) => sum + Math.max(0, r.balanceKobo), 0),
    [overdue],
  );
  const current = withPhone[index];
  const finished = withPhone.length === 0 || index >= withPhone.length;
  const progressPct =
    withPhone.length === 0
      ? 100
      : Math.round((Math.min(doneIds.size, withPhone.length) / withPhone.length) * 100);
  const initial = (name: string) => (name.trim().charAt(0) || '?').toUpperCase();

  const finishToast = () => {
    if (noPhoneCount > 0) {
      onToast(t('home.chaseSkippedNoPhone', { n: noPhoneCount }));
    } else {
      onToast(t('home.chaseDone'));
    }
  };

  const remindAt = async (i: number) => {
    const row = withPhone[i];
    if (!row || busy) return;
    setBusy(true);
    try {
      const result = await remindCustomer({
        shopName,
        customerName: row.customer.name,
        phone: row.customer.phone,
        balanceKobo: row.balanceKobo,
      });
      if (result === 'whatsapp') onToast(t('customer.openingWhatsApp'));
      else if (result === 'sms') onToast(t('customer.openingSms'));
      else if (result === 'share') onToast(t('customer.shared'));
      else if (result === 'clipboard') onToast(t('customer.messageCopied'));
      else onToast(t('customer.couldNotRemind'));
      setDoneIds((prev) => new Set(prev).add(row.customer.id));
      const next = i + 1;
      setIndex(next);
      if (next >= withPhone.length) finishToast();
    } finally {
      setBusy(false);
    }
  };

  const onRemindNext = () => {
    if (finished) {
      finishToast();
      onClose();
      return;
    }
    void remindAt(index);
  };

  return (
    <div
      class="chase-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('home.chaseSheetTitle', { n: overdue.length })}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="chase-sheet">
        <div class="chase-sheet-head chase-soft-hero">
          <div class="chase-soft-crest" aria-hidden="true">
            ₦
          </div>
          <div class="chase-soft-meta">
            <div class="chase-soft-kicker">{t('common.overdue')}</div>
            <div class="chase-sheet-title">
              {t('home.chaseSheetTitle', { n: overdue.length })}
              {totalKobo > 0 ? ` · ${formatNaira(totalKobo)}` : ''}
            </div>
            {withPhone.length > 0 && (
              <div class="chase-sheet-sub">
                {finished
                  ? t('home.chaseDone')
                  : t('home.chaseProgress', {
                      current: Math.min(index + 1, withPhone.length),
                      total: withPhone.length,
                    })}
                {noPhoneCount > 0
                  ? ` · ${t('home.chaseSkippedNoPhone', { n: noPhoneCount })}`
                  : ''}
              </div>
            )}
            {withPhone.length === 0 && (
              <div class="chase-sheet-sub">
                {t('home.chaseSkippedNoPhone', { n: noPhoneCount || overdue.length })}
              </div>
            )}
            {withPhone.length > 0 && (
              <div
                class="chase-soft-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={withPhone.length}
                aria-valuenow={Math.min(doneIds.size, withPhone.length)}
              >
                <span style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>
          <button
            type="button"
            class="icon-btn chase-soft-close"
            aria-label={t('home.chaseClose')}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div class="chase-sheet-list">
          {overdue.map((row) => {
            const hasPhone = Boolean(row.customer.phone?.trim());
            const isCurrent =
              hasPhone && current && current.customer.id === row.customer.id && !finished;
            const done = doneIds.has(row.customer.id);
            return (
              <div
                key={row.customer.id}
                class={
                  'chase-row' +
                  (isCurrent ? ' current' : done ? ' done' : hasPhone ? '' : ' nophone')
                }
              >
                <div class="chase-row-avatar" aria-hidden="true">
                  {done ? '✓' : initial(row.customer.name)}
                </div>
                <div class="chase-row-meta">
                  <div class="chase-row-name">{row.customer.name}</div>
                  <div class="chase-row-hint">
                    {hasPhone
                      ? row.customer.phone
                      : t('home.chaseNoPhone')}{' '}
                    · {formatNaira(row.balanceKobo)}
                  </div>
                </div>
                {done ? (
                  <span class="chase-row-sent">{t('home.chaseSent')}</span>
                ) : hasPhone ? (
                  <button
                    type="button"
                    class={
                      isCurrent
                        ? 'btn btn-primary chase-row-btn'
                        : 'btn btn-secondary chase-row-btn'
                    }
                    disabled={busy}
                    onClick={() => {
                      const i = withPhone.findIndex(
                        (r) => r.customer.id === row.customer.id,
                      );
                      if (i >= 0) void remindAt(i);
                    }}
                  >
                    {t('home.chaseRemind')}
                  </button>
                ) : (
                  <span class="chase-row-skip">{t('home.chaseNoPhone')}</span>
                )}
              </div>
            );
          })}
        </div>

        <div class="chase-sheet-actions">
          {withPhone.length > 0 && !finished ? (
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy}
              onClick={onRemindNext}
            >
              {current
                ? t('home.chaseRemindThis', { name: current.customer.name })
                : t('home.chaseRemindNext')}
            </button>
          ) : (
            <button type="button" class="btn btn-primary" onClick={onClose}>
              {t('home.chaseClose')}
            </button>
          )}
          {!finished && withPhone.length > 0 && (
            <button
              type="button"
              class="btn btn-ghost"
              disabled={busy || index >= withPhone.length - 1}
              onClick={() => setIndex((i) => Math.min(i + 1, withPhone.length))}
            >
              {t('home.chaseRemindNext')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
