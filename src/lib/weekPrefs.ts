/** Spec 4: tiny Sunday/hide/names prefs (Home imports only this; the rest of the week code is lazy). */

export const WEEK_HIDDEN_KEY = 'debtbook-week-hidden';
export const WEEK_NAMES_KEY = 'debtbook-week-names';

/** ISO-8601 week, e.g. "2026-W44" (the hide-until-next-week value). */
export function isoWeek(now = Date.now()): string {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Mon = 0
  const th = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3); // Thursday of this week
  const jan4 = new Date(th.getFullYear(), 0, 4);
  const w = 1 + Math.round(((th.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${th.getFullYear()}-W${String(w).padStart(2, '0')}`;
}

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Home shows the card on Sundays (local time) unless hidden for this ISO week. */
export function weekCardDue(now = Date.now(), ls: Pick<Storage, 'getItem'> | null = store()): boolean {
  if (new Date(now).getDay() !== 0) return false;
  return ls?.getItem(WEEK_HIDDEN_KEY) !== isoWeek(now);
}

export function hideWeekCard(now = Date.now(), ls: Pick<Storage, 'setItem'> | null = store()): void {
  try {
    ls?.setItem(WEEK_HIDDEN_KEY, isoWeek(now));
  } catch {
    /* ignore */
  }
}

/** "Show customer names in the shared picture": off unless the owner turned it on here. */
export function weekNamesOn(ls: Pick<Storage, 'getItem'> | null = store()): boolean {
  return ls?.getItem(WEEK_NAMES_KEY) === '1';
}

export function setWeekNames(on: boolean, ls: Pick<Storage, 'setItem'> | null = store()): void {
  try {
    ls?.setItem(WEEK_NAMES_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
