import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbCache } from '../db/schema';
import { getDb } from '../db/schema';
import { saveShop, upsertCustomer, listCustomers } from '../db/repo';
import { normalizeWhatsAppDigits } from '../lib/phone';

function phoneDedupeKey(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return normalizeWhatsAppDigits(raw) || raw.replace(/\D/g, '') || null;
}

interface DuplicateMatch {
  customerId: string;
  customerName: string;
  matchType: 'phone' | 'name';
}

async function findDuplicate(
  inputName: string,
  inputPhone: string,
  editingId?: string,
): Promise<DuplicateMatch | null> {
  const existing = await listCustomers();
  const inputPhoneKey = phoneDedupeKey(inputPhone);
  const inputNameLower = inputName.trim().toLowerCase();

  for (const c of existing) {
    if (c.id === editingId) continue;
    const existingPhoneKey = phoneDedupeKey(c.phone);
    if (inputPhoneKey && existingPhoneKey && inputPhoneKey === existingPhoneKey) {
      return { customerId: c.id, customerName: c.name, matchType: 'phone' };
    }
  }
  for (const c of existing) {
    if (c.id === editingId) continue;
    if (c.name.trim().toLowerCase() === inputNameLower) {
      return { customerId: c.id, customerName: c.name, matchType: 'name' };
    }
  }
  return null;
}

async function freshDb() {
  try {
    (await getDb()).close();
  } catch {
    /* none */
  }
  resetDbCache();
  globalThis.indexedDB = new IDBFactory();
}

beforeEach(freshDb);

describe('duplicate customer detection', () => {
  it('detects phone match with normalized digits', async () => {
    await saveShop('Test Shop');
    const existing = await upsertCustomer({ name: 'John Doe', phone: '0803 123 4567' });

    const match = await findDuplicate('Jane Doe', '08031234567');
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('phone');
    expect(match!.customerId).toBe(existing.id);
    expect(match!.customerName).toBe('John Doe');
  });

  it('detects phone match with different formatting', async () => {
    await saveShop('Test Shop');
    await upsertCustomer({ name: 'John Doe', phone: '+234 803 123 4567' });

    const match = await findDuplicate('Jane Doe', '0803-123-4567');
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('phone');
  });

  it('detects case-insensitive name match', async () => {
    await saveShop('Test Shop');
    const existing = await upsertCustomer({ name: 'John Doe' });

    const match = await findDuplicate('JOHN DOE', '');
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('name');
    expect(match!.customerId).toBe(existing.id);
  });

  it('detects name match with trimmed whitespace', async () => {
    await saveShop('Test Shop');
    await upsertCustomer({ name: 'John Doe' });

    const match = await findDuplicate('  John Doe  ', '');
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('name');
  });

  it('prioritizes phone match over name match', async () => {
    await saveShop('Test Shop');
    const john = await upsertCustomer({ name: 'John Doe', phone: '0803 123 4567' });
    await upsertCustomer({ name: 'Jane Doe', phone: '0804 555 6666' });

    const match = await findDuplicate('Jane Doe', '0803 123 4567');
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('phone');
    expect(match!.customerId).toBe(john.id);
  });

  it('does not match self when editing', async () => {
    await saveShop('Test Shop');
    const john = await upsertCustomer({ name: 'John Doe', phone: '0803 123 4567' });

    const matchWhenEditing = await findDuplicate('John Doe', '0803 123 4567', john.id);
    expect(matchWhenEditing).toBeNull();
  });

  it('matches different customer when editing with collision', async () => {
    await saveShop('Test Shop');
    const john = await upsertCustomer({ name: 'John Doe', phone: '0803 123 4567' });
    const jane = await upsertCustomer({ name: 'Jane Doe', phone: '0804 555 6666' });

    const match = await findDuplicate('Jane Doe', '0803 123 4567', jane.id);
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('phone');
    expect(match!.customerId).toBe(john.id);
  });

  it('returns null when no duplicate found', async () => {
    await saveShop('Test Shop');
    await upsertCustomer({ name: 'John Doe', phone: '0803 123 4567' });

    const match = await findDuplicate('Jane Smith', '0804 555 6666');
    expect(match).toBeNull();
  });

  it('ignores customers without phone when checking phone match', async () => {
    await saveShop('Test Shop');
    await upsertCustomer({ name: 'John Doe' });

    const match = await findDuplicate('Jane Doe', '0803 123 4567');
    expect(match).toBeNull();
  });

  it('matches name when phone is empty on both', async () => {
    await saveShop('Test Shop');
    const existing = await upsertCustomer({ name: 'John Doe' });

    const match = await findDuplicate('John Doe', '');
    expect(match).not.toBeNull();
    expect(match!.matchType).toBe('name');
    expect(match!.customerId).toBe(existing.id);
  });

  it('does not match soft-deleted customers', async () => {
    await saveShop('Test Shop');
    const { softDeleteCustomer } = await import('../db/repo');
    const john = await upsertCustomer({ name: 'John Doe', phone: '0803 123 4567' });
    await softDeleteCustomer(john.id);

    const phoneMatch = await findDuplicate('Jane Doe', '0803 123 4567');
    expect(phoneMatch).toBeNull();

    const nameMatch = await findDuplicate('John Doe', '');
    expect(nameMatch).toBeNull();
  });
});
