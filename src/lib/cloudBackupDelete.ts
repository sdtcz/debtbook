/**
 * "Delete my cloud backup" — erases the server copy for a recovery code and,
 * when it is this phone's backup, turns cloud backup + sync off locally.
 * The book on this phone is never touched. The recovery code is never sent:
 * only its SHA-256 backupId goes to /api/cloud-backup.
 */

import { getShop, setCloudBackupMeta } from '../db/repo';
import { deriveBackupId, isValidRecoveryCode } from './cloudBackup';
import { deleteCloudBackup } from './cloudBackupApi';
import { getUnlockedRecoveryCode, lockSyncOnDevice, unlockSyncOnDevice } from './syncUnlock';

export class NeedRecoveryCodeError extends Error {
  constructor() {
    super('Recovery code needed');
    this.name = 'NeedRecoveryCodeError';
  }
}

/** Recovery code already unlocked for this phone's cloud backup, if any. */
export async function unlockedCodeForThisBackup(): Promise<string | undefined> {
  const shop = await getShop();
  if (!shop?.cloudBackupId) return undefined;
  return getUnlockedRecoveryCode(shop.cloudBackupId);
}

export async function deleteMyCloudBackup(
  recoveryCode?: string,
): Promise<{ backupId: string; thisPhone: boolean }> {
  const code = recoveryCode?.trim() ? recoveryCode : await unlockedCodeForThisBackup();
  if (!code) throw new NeedRecoveryCodeError();
  if (!isValidRecoveryCode(code)) throw new Error('Invalid recovery code');
  const backupId = (await deriveBackupId(code)).toLowerCase();

  const shop = await getShop();
  const thisPhone = Boolean(shop?.cloudBackupId && shop.cloudBackupId.toLowerCase() === backupId);
  const prev = shop
    ? { cloudBackupEnabled: shop.cloudBackupEnabled, cloudBackupId: shop.cloudBackupId }
    : undefined;

  // Turn sync off first so an auto-push can't re-upload while we delete.
  if (thisPhone) {
    await setCloudBackupMeta({ cloudBackupEnabled: false });
    await lockSyncOnDevice();
  }
  try {
    await deleteCloudBackup(backupId);
  } catch (err) {
    if (thisPhone && prev) {
      await setCloudBackupMeta(prev);
      await unlockSyncOnDevice(code, backupId).catch(() => undefined);
    }
    throw err;
  }
  if (thisPhone) {
    await setCloudBackupMeta({
      cloudBackupEnabled: false,
      cloudBackupId: undefined,
      lastCloudBackupAt: undefined,
    });
  }
  return { backupId, thisPhone };
}
