import { afterEach, describe, expect, it } from 'vitest';
import entryFormSrc from '../pages/EntryFormPage.tsx?raw';
import { fromLocalDateInput, toLocalDateInput } from './localDate';

// Vitest runs in Node; the app tsconfig has no Node types.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const origTz = env.TZ;
afterEach(() => {
  env.TZ = origTz;
});

function localMidnight(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

describe('will-pay-on date input stays on the local calendar day', () => {
  for (const tz of ['Africa/Lagos', 'America/Chicago', 'Asia/Kolkata', 'UTC']) {
    it(`round-trips a picked day in ${tz}`, () => {
      env.TZ = tz;
      const ts = fromLocalDateInput('2026-11-27');
      expect(ts).toBe(localMidnight(2026, 11, 27));
      expect(new Date(ts!).getDate()).toBe(27);
      expect(toLocalDateInput(ts!)).toBe('2026-11-27');
    });

    it(`shows a chip's local-midnight date as that day in ${tz}`, () => {
      env.TZ = tz;
      expect(toLocalDateInput(localMidnight(2026, 12, 1))).toBe('2026-12-01');
      expect(toLocalDateInput(localMidnight(2027, 1, 1))).toBe('2027-01-01');
    });
  }

  it('min is today on the phone, not the UTC day (Lagos just after midnight)', () => {
    env.TZ = 'Africa/Lagos';
    const justAfterMidnight = new Date(2026, 10, 27, 0, 30).getTime(); // 23:30Z on the 26th
    expect(new Date(justAfterMidnight).toISOString().slice(0, 10)).toBe('2026-11-26');
    expect(toLocalDateInput(justAfterMidnight)).toBe('2026-11-27');
  });

  it('empty or invalid input clears the date', () => {
    expect(fromLocalDateInput('')).toBeNull();
    expect(fromLocalDateInput('2026-02-30')).toBeNull();
    expect(fromLocalDateInput('27/11/2026')).toBeNull();
  });

  it('EntryFormPage uses the local helpers, not UTC ISO slicing, for the date input', () => {
    const src = entryFormSrc;
    expect(src).toContain('toLocalDateInput(dueAt)');
    expect(src).toContain('fromLocalDateInput(val)');
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
  });
});
