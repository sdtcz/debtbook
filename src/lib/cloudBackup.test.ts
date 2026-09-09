import { describe, expect, it } from 'vitest';
import type { BackupPayload } from './types';
import {
  decryptBackup,
  deriveBackupId,
  encryptBackup,
  formatRecoveryCode,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
} from './cloudBackup';

const samplePayload = (): BackupPayload => ({
  version: 1,
  exportedAt: 1_700_000_000_000,
  shop: {
    id: 'shop',
    name: 'Test Shop',
    currency: 'NGN',
    createdAt: 1,
    updatedAt: 1,
  },
  customers: [
    {
      id: 'c1',
      name: 'Ada',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  entries: [
    {
      id: 'e1',
      customerId: 'c1',
      type: 'credit',
      amountKobo: 50000,
      occurredAt: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

describe('recovery code', () => {
  it('generates 8 groups of 4 alphanumeric (no ambiguous chars)', () => {
    const code = generateRecoveryCode();
    expect(code.split('-')).toHaveLength(8);
    expect(normalizeRecoveryCode(code)).toHaveLength(32);
    expect(isValidRecoveryCode(code)).toBe(true);
    expect(/[0O1Il]/.test(normalizeRecoveryCode(code))).toBe(false);
  });

  it('normalizes and formats consistently', () => {
    const raw = 'ABCD' + 'EFGH' + 'JKLM' + 'NPQR' + 'STUV' + 'WXYZ' + '2345' + '6789';
    expect(raw).toHaveLength(32);
    expect(normalizeRecoveryCode('abcd-efgh-jklm-npqr-stuv-wxyz-2345-6789')).toBe(
      raw,
    );
    const formatted = formatRecoveryCode(raw.toLowerCase());
    expect(formatted).toBe('ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789');
    expect(formatted).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/);
  });

  it('rejects wrong length or ambiguous alphabet', () => {
    expect(isValidRecoveryCode('AAAA')).toBe(false);
    expect(isValidRecoveryCode('OOOO-OOOO-OOOO-OOOO-OOOO-OOOO-OOOO-OOOO')).toBe(
      false,
    );
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips BackupPayload and derives stable backupId', async () => {
    const code = generateRecoveryCode();
    const payload = samplePayload();
    const enc = await encryptBackup(payload, code);

    expect(enc.backupId).toHaveLength(64);
    expect(enc.backupId).toBe(await deriveBackupId(code));
    expect(enc.ciphertext.length).toBeGreaterThan(16);
    expect(enc.iv).toBeTruthy();
    expect(enc.salt).toBeTruthy();
    expect(enc.meta.algorithm).toBe('AES-GCM');

    const dec = await decryptBackup(enc, code);
    expect(dec.version).toBe(1);
    expect(dec.shop?.name).toBe('Test Shop');
    expect(dec.customers).toHaveLength(1);
    expect(dec.entries[0]?.amountKobo).toBe(50000);
  });

  it('same recovery code → same backupId; wrong code fails decrypt', async () => {
    const codeA = generateRecoveryCode();
    let codeB = generateRecoveryCode();
    while (normalizeRecoveryCode(codeB) === normalizeRecoveryCode(codeA)) {
      codeB = generateRecoveryCode();
    }

    const idA1 = await deriveBackupId(codeA);
    const idA2 = await deriveBackupId(formatRecoveryCode(normalizeRecoveryCode(codeA)));
    expect(idA1).toBe(idA2);
    expect(idA1).not.toBe(await deriveBackupId(codeB));

    const enc = await encryptBackup(samplePayload(), codeA);
    await expect(decryptBackup(enc, codeB)).rejects.toThrow(/Wrong recovery code/);
  });

  it('ciphertext does not contain plaintext shop name', async () => {
    const code = generateRecoveryCode();
    const enc = await encryptBackup(samplePayload(), code);
    const decoded = atob(enc.ciphertext);
    expect(decoded.includes('Test Shop')).toBe(false);
    expect(decoded.includes('Ada')).toBe(false);
  });
});
