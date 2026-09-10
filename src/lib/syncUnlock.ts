/**
 * Device-local sync unlock: store recovery code in IndexedDB so Sync Now /
 * auto-push do not re-prompt. Never upload or log the recovery code.
 */

import { getDb, type SyncUnlockRecord } from '../db/schema';
import {
  deriveBackupId,
  isValidRecoveryCode,
  normalizeRecoveryCode,
} from './cloudBackup';

const UNLOCK_KEY = 'shop' as const;

export async function getSyncUnlock(): Promise<SyncUnlockRecord | undefined> {
  const db = await getDb();
  return db.get('syncUnlock', UNLOCK_KEY);
}

export async function isSyncUnlocked(expectedBackupId?: string): Promise<boolean> {
  const rec = await getSyncUnlock();
  if (!rec?.recoveryCode) return false;
  if (expectedBackupId && rec.backupId !== expectedBackupId.toLowerCase()) {
    return false;
  }
  return true;
}

export async function unlockSyncOnDevice(
  recoveryCode: string,
  expectedBackupId?: string,
): Promise<SyncUnlockRecord> {
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error('Invalid recovery code');
  }
  const normalized = normalizeRecoveryCode(recoveryCode);
  const backupId = await deriveBackupId(normalized);
  if (
    expectedBackupId &&
    backupId.toLowerCase() !== expectedBackupId.toLowerCase()
  ) {
    throw new Error('Recovery code does not match this device’s cloud backup');
  }
  const db = await getDb();
  const rec: SyncUnlockRecord = {
    id: UNLOCK_KEY,
    recoveryCode: normalized,
    backupId: backupId.toLowerCase(),
    unlockedAt: Date.now(),
  };
  await db.put('syncUnlock', rec);
  return rec;
}

export async function lockSyncOnDevice(): Promise<void> {
  const db = await getDb();
  await db.delete('syncUnlock', UNLOCK_KEY);
}

/** Return stored recovery code if unlocked; undefined otherwise. */
export async function getUnlockedRecoveryCode(
  expectedBackupId?: string,
): Promise<string | undefined> {
  const rec = await getSyncUnlock();
  if (!rec?.recoveryCode) return undefined;
  if (
    expectedBackupId &&
    rec.backupId !== expectedBackupId.toLowerCase()
  ) {
    return undefined;
  }
  return rec.recoveryCode;
}
