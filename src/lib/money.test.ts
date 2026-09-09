import { describe, expect, it } from 'vitest';
import {
  balanceLabel,
  balanceTone,
  formatNaira,
  parseNairaToKobo,
} from './money';
import { computeBalance } from '../db/repo';
import type { Entry } from './types';

describe('money', () => {
  it('formats naira with separators', () => {
    expect(formatNaira(123456)).toMatch(/1,234\.56/);
  });

  it('parses amounts to kobo', () => {
    expect(parseNairaToKobo('1,500.50')).toBe(150050);
    expect(parseNairaToKobo('100')).toBe(10000);
    expect(parseNairaToKobo('')).toBeNull();
    expect(parseNairaToKobo('-5')).toBeNull();
  });

  it('labels balances', () => {
    expect(balanceLabel(100)).toBe('owes you');
    expect(balanceLabel(-50)).toBe('you owe');
    expect(balanceLabel(0)).toBe('settled');
    expect(balanceTone(-1)).toBe('credit');
  });
});

describe('computeBalance', () => {
  const base = {
    customerId: 'c1',
    note: undefined,
    occurredAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };

  it('credits minus payments; allows negative (shop owes)', () => {
    const entries: Entry[] = [
      { id: '1', type: 'credit', amountKobo: 50000, ...base },
      { id: '2', type: 'payment', amountKobo: 20000, ...base },
      { id: '3', type: 'payment', amountKobo: 40000, ...base },
    ];
    const { balanceKobo, creditTotalKobo, paymentTotalKobo } =
      computeBalance(entries);
    expect(creditTotalKobo).toBe(50000);
    expect(paymentTotalKobo).toBe(60000);
    expect(balanceKobo).toBe(-10000);
  });

  it('ignores soft-deleted entries', () => {
    const entries: Entry[] = [
      { id: '1', type: 'credit', amountKobo: 10000, ...base },
      {
        id: '2',
        type: 'credit',
        amountKobo: 99999,
        ...base,
        deletedAt: 99,
      },
    ];
    expect(computeBalance(entries).balanceKobo).toBe(10000);
  });
});
