/**
 * "Forgot PIN?" — the only two ways past a forgotten PIN:
 *  1. Pro cloud recovery code: must match this phone's cloud backup id AND decrypt the
 *     cloud backup (same check as restore). Then the owner sets a new PIN.
 *  2. Erase this phone without opening the book, then restore from a backup file.
 * Nothing here reads or exports the locked book.
 */
import { setPin } from '../db/repo';
import { importBackup, isBackupPayload } from './backup';
import { decryptBackup, deriveBackupId, isValidRecoveryCode } from './cloudBackup';
import { fetchCloudBackup } from './cloudBackupApi';
import { hashPin, isValidPin, randomSalt } from './pin';
import { eraseThisDevice } from './session';
import type { BackupPayload, ShopProfile } from './types';

export type RecoveryCheck = 'ok' | 'format' | 'no-cloud' | 'mismatch' | 'wrong' | 'offline' | 'failed';

type Deps = {
  fetchBlob: typeof fetchCloudBackup;
  decrypt: typeof decryptBackup;
  online: () => boolean;
};
const realDeps: Deps = {
  fetchBlob: fetchCloudBackup,
  decrypt: decryptBackup,
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
};

export async function checkRecoveryCode(
  code: string,
  shop: Pick<ShopProfile, 'cloudBackupId'> | undefined,
  deps: Deps = realDeps,
): Promise<RecoveryCheck> {
  if (!isValidRecoveryCode(code)) return 'format';
  if (!shop?.cloudBackupId) return 'no-cloud';
  const id = await deriveBackupId(code);
  if (id !== shop.cloudBackupId) return 'mismatch';
  if (!deps.online()) return 'offline';
  let blob;
  try {
    blob = await deps.fetchBlob(id);
  } catch (e) {
    return (e as { status?: number })?.status === 0 ? 'offline' : 'failed';
  }
  try {
    await deps.decrypt(blob, code);
  } catch {
    return 'wrong';
  }
  return 'ok';
}

/** Set a new PIN after a successful recovery-code check (re-verified here). */
export async function resetPinWithRecoveryCode(
  code: string,
  shop: Pick<ShopProfile, 'cloudBackupId'> | undefined,
  newPin: string,
  deps: Deps = realDeps,
): Promise<RecoveryCheck | 'bad-pin'> {
  if (!isValidPin(newPin)) return 'bad-pin';
  const check = await checkRecoveryCode(code, shop, deps);
  if (check !== 'ok') return check;
  const salt = randomSalt();
  await setPin(await hashPin(salt, newPin), salt);
  return 'ok';
}

/** Parse a chosen backup file BEFORE erasing anything; null when it is not a BashiBook backup. */
export async function readBackupFile(file: Blob): Promise<BackupPayload | null> {
  try {
    const data = JSON.parse(await file.text()) as unknown;
    return isBackupPayload(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Erase this phone (no export of the locked book) and optionally restore a backup file.
 * The restored book has no PIN: the owner sets a new one in Settings.
 */
export async function eraseAndRestore(backup: BackupPayload | null): Promise<void> {
  await eraseThisDevice();
  if (!backup) return;
  const shop = backup.shop ? { ...backup.shop } : null;
  if (shop) {
    delete shop.pinHash;
    delete shop.pinSalt;
    delete shop.pinBeforeDelete;
  }
  await importBackup({ ...backup, shop });
}
