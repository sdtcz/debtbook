/**
 * Local calendar-day helpers for <input type="date">.
 *
 * `toISOString().slice(0, 10)` gives the UTC day, which is the previous day
 * for a local-midnight timestamp east of UTC (e.g. Lagos, UTC+1), and
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, which is the previous
 * local day west of UTC. These helpers stay on the phone's own calendar.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for the local calendar day of `t`. */
export function toLocalDateInput(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for a 'YYYY-MM-DD' value, or null if empty/invalid. */
export function fromLocalDateInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d.getTime();
}
