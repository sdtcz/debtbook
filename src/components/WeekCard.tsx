/** Spec 4: Sunday "your week" card on Home (lazy: only fetched on Sundays). */
import { useEffect, useState } from 'preact/hooks';
import { getShop, listAllEntries, listCustomers } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { deviceLocale } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { navigate } from '../lib/router';
import {
  hideWeekCard,
  setWeekNames,
  weekFacts,
  weekHasNews,
  weekNamesOn,
  weekRange,
  weekSentences,
  type WeekFacts,
} from '../lib/week';
import { shareMyWeek } from '../lib/weekShareFlow';

interface Props {
  onHide: () => void;
  toast: (msg: string) => void;
}

export function WeekCard({ onHide, toast }: Props) {
  const { t } = useLocale();
  const tr = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const [facts, setFacts] = useState<WeekFacts | null>(null);
  const [shop, setShop] = useState('');
  const [names, setNames] = useState(() => weekNamesOn());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [c, e, s] = await Promise.all([listCustomers(), listAllEntries(), getShop()]);
      if (!alive) return;
      setFacts(weekFacts(c, e));
      setShop(s?.name || '');
    };
    void load().catch(() => {});
    window.addEventListener('debtbook:changed', load);
    return () => {
      alive = false;
      window.removeEventListener('debtbook:changed', load);
    };
  }, []);

  if (!facts || !weekHasNews(facts)) return null;
  const [a, b] = weekSentences(facts, tr, (k) => formatMoney(k), true);

  return (
    <section class="growth-card week" aria-label={tr('week.share')}>
      <div class="growth-card-body">
        <strong>{tr('week.title', { range: weekRange(facts, deviceLocale()) })}</strong>
        <p>{a.join(' ')}</p>
        <p>{b.join(' ')}</p>
      </div>
      <div class="growth-card-actions">
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => void shareMyWeek(facts, shop, tr, names, toast)}
        >
          {tr('week.share')}
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => navigate('/reports')}>
          {tr('week.seeReport')}
        </button>
        <button
          type="button"
          class="pro-hint-dismiss"
          aria-label={tr('week.hide')}
          title={tr('week.hide')}
          onClick={() => {
            hideWeekCard();
            onHide();
          }}
        >
          ×
        </button>
      </div>
      <label class="week-names">
        <input
          type="checkbox"
          checked={names}
          onChange={(e) => {
            const on = (e.target as HTMLInputElement).checked;
            setNames(on);
            setWeekNames(on);
          }}
        />
        {tr('week.names')}
      </label>
    </section>
  );
}
