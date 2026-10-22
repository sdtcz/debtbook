import { describe, expect, it } from 'vitest';
import { statusBadge } from './StatusBadge';

describe('status badge', () => {
  it('hides the pending-sync badge when nothing is pending', () => {
    expect(statusBadge(true, 0)).toEqual({ kind: null, pending: 0 });
  });
  it('never shows a counter for 0, negative or invalid counts', () => {
    for (const n of [0, -1, NaN, Infinity]) {
      expect(statusBadge(true, n).kind).toBeNull();
      expect(statusBadge(false, n)).toEqual({ kind: 'offline', pending: 0 });
    }
  });
  it('shows "N pending sync" only for N > 0, and offline wins', () => {
    expect(statusBadge(true, 3)).toEqual({ kind: 'pending', pending: 3 });
    expect(statusBadge(false, 2)).toEqual({ kind: 'offline', pending: 2 });
  });
});
