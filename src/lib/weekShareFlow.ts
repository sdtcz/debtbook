/** Tap handler shared by the Home card and Reports → 7 days. The picture code loads on tap. */
import { deviceLocale } from './dates';
import { formatMoney } from './money';
import { weekShareParts, type WeekFacts } from './week';

type Tr = (key: string, vars?: Record<string, string | number>) => string;

export async function shareMyWeek(
  facts: WeekFacts,
  shop: string,
  tr: Tr,
  names: boolean,
  toast: (msg: string) => void,
): Promise<void> {
  const parts = weekShareParts(facts, shop, tr, (k) => formatMoney(k), names, deviceLocale());
  try {
    const { shareWeek } = await import('./weekShare');
    const r = await shareWeek(parts.picture, parts.text, parts.title);
    if (r === 'share') toast(tr('reports.shared'));
    else if (r === 'clipboard') toast(tr('reports.copied'));
    else if (r === 'download') toast(tr('week.downloaded'));
  } catch {
    toast(tr('reports.shareFailed'));
  }
}
