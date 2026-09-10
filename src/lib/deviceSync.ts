/**
 * Multi-device sync via encrypted full snapshot (same channel as cloud backup).
 */

import { markOutboxSynced } from '../db/outbox';
import { getShop, setCloudBackupMeta } from '../db/repo';
import { exportBackup, importBackup } from './backup';
import {
  decryptBackup,
  deriveBackupId,
  encryptBackup,
  isValidRecoveryCode,
} from './cloudBackup';
import {
  CloudBackupApiError,
  fetchCloudBackup,
  fetchCloudBackupMeta,
  uploadCloudBackup,
} from './cloudBackupApi';
import { isPro } from './entitlement';
import {
  compareCloudTimes,
  needsPush,
  planSyncNow,
  type SyncCompareResult,
} from './syncDecision';
import {
  getUnlockedRecoveryCode,
  isSyncUnlocked,
  lockSyncOnDevice,
  unlockSyncOnDevice,
} from './syncUnlock';

export type SyncPushResult = {
  backupId: string;
  markedOutbox: number;
  at: number;
};

export type SyncPullResult = {
  customers: number;
  entries: number;
  at: number;
};

export async function cloudSyncAvailable(): Promise<boolean> {
  const shop = await getShop();
  return Boolean(shop && isPro(shop) && shop.cloudBackupEnabled && shop.cloudBackupId);
}

export async function getSyncStatus(): Promise<{
  pro: boolean;
  cloudEnabled: boolean;
  unlocked: boolean;
  lastCloudBackupAt?: number;
  lastLocalChangeAt?: number;
  pendingLocal: boolean;
  online: boolean;
}> {
  const shop = await getShop();
  const pro = isPro(shop);
  const cloudEnabled = Boolean(shop?.cloudBackupEnabled && shop?.cloudBackupId);
  const unlocked =
    cloudEnabled && shop?.cloudBackupId
      ? await isSyncUnlocked(shop.cloudBackupId)
      : false;
  const lastCloudBackupAt = shop?.lastCloudBackupAt;
  const lastLocalChangeAt = shop?.lastLocalChangeAt;
  return {
    pro,
    cloudEnabled,
    unlocked,
    lastCloudBackupAt,
    lastLocalChangeAt,
    pendingLocal: needsPush({ lastLocalChangeAt, lastCloudBackupAt }),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };
}

export async function unlockDeviceForSync(
  recoveryCode: string,
): Promise<void> {
  const shop = await getShop();
  if (!shop?.cloudBackupId) {
    throw new Error('Enable cloud backup first');
  }
  await unlockSyncOnDevice(recoveryCode, shop.cloudBackupId);
}

export async function lockDeviceSync(): Promise<void> {
  await lockSyncOnDevice();
}

/** Encrypt current ledger and upload; mark outbox synced. */
export async function pushSnapshot(
  recoveryCode: string,
): Promise<SyncPushResult> {
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error('Invalid recovery code');
  }
  const shop = await getShop();
  const id = await deriveBackupId(recoveryCode);
  if (shop?.cloudBackupId && id !== shop.cloudBackupId) {
    throw new Error('Recovery code does not match this device’s cloud backup');
  }
  const payload = await exportBackup();
  const enc = await encryptBackup(payload, recoveryCode);
  await uploadCloudBackup(enc);
  const at = Date.now();
  await setCloudBackupMeta({
    cloudBackupEnabled: true,
    cloudBackupId: enc.backupId,
    lastCloudBackupAt: at,
    lastLocalChangeAt: at,
  });
  const markedOutbox = await markOutboxSynced();
  return { backupId: enc.backupId, markedOutbox, at };
}

/** Download, decrypt, import. Caller must confirm with user first. */
export async function pullAndRestore(
  recoveryCode: string,
): Promise<SyncPullResult> {
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error('Invalid recovery code');
  }
  const backupId = await deriveBackupId(recoveryCode);
  const blob = await fetchCloudBackup(backupId);
  const data = await decryptBackup(blob, recoveryCode);
  const result = await importBackup(data);
  const at =
    blob.meta?.exportedAt ||
    (blob as { storedAt?: number }).storedAt ||
    Date.now();
  await setCloudBackupMeta({
    cloudBackupEnabled: true,
    cloudBackupId: backupId,
    lastCloudBackupAt: at,
    lastLocalChangeAt: at,
  });
  // Keep unlock if code matches
  await unlockSyncOnDevice(recoveryCode, backupId);
  await markOutboxSynced();
  return { customers: result.customers, entries: result.entries, at };
}

export async function fetchRemoteCompare(): Promise<{
  compare: SyncCompareResult;
  remoteExportedAt?: number;
  remoteStoredAt?: number;
}> {
  const shop = await getShop();
  if (!shop?.cloudBackupId) {
    return { compare: 'no_remote' };
  }
  try {
    const meta = await fetchCloudBackupMeta(shop.cloudBackupId);
    const remoteExportedAt = meta.meta?.exportedAt;
    const remoteStoredAt = meta.storedAt;
    const compare = compareCloudTimes({
      localLastCloudAt: shop.lastCloudBackupAt,
      remoteExportedAt,
      remoteStoredAt,
    });
    return { compare, remoteExportedAt, remoteStoredAt };
  } catch (err) {
    if (err instanceof CloudBackupApiError && err.status === 404) {
      return { compare: 'no_remote' };
    }
    throw err;
  }
}

/**
 * Sync Now orchestration (caller shows unlock UI / confirm restore).
 * Returns action taken or what UI must do next.
 */
export async function runSyncNow(opts: {
  recoveryCode?: string;
  /** If remote newer and user already confirmed restore */
  confirmRestore?: boolean;
}): Promise<
  | { action: 'offline' }
  | { action: 'locked' }
  | { action: 'need_confirm_restore'; remoteAt?: number }
  | { action: 'restored'; result: SyncPullResult }
  | { action: 'pushed'; result: SyncPushResult }
  | { action: 'up_to_date' }
> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { action: 'offline' };
  }
  const shop = await getShop();
  if (!shop?.cloudBackupEnabled || !shop.cloudBackupId) {
    return { action: 'locked' };
  }

  let code =
    opts.recoveryCode ||
    (await getUnlockedRecoveryCode(shop.cloudBackupId));
  if (!code) {
    return { action: 'locked' };
  }

  // Ensure unlock stored when code provided
  if (opts.recoveryCode) {
    await unlockSyncOnDevice(code, shop.cloudBackupId);
  }

  const { compare, remoteExportedAt, remoteStoredAt } =
    await fetchRemoteCompare();
  const pending = needsPush({
    lastLocalChangeAt: shop.lastLocalChangeAt,
    lastCloudBackupAt: shop.lastCloudBackupAt,
  });
  const plan = planSyncNow({
    online: true,
    unlocked: true,
    compare,
    needsPush: pending,
  });

  if (plan === 'pull_offer') {
    if (!opts.confirmRestore) {
      return {
        action: 'need_confirm_restore',
        remoteAt: remoteExportedAt || remoteStoredAt,
      };
    }
    const result = await pullAndRestore(code);
    return { action: 'restored', result };
  }

  if (plan === 'skip_equal') {
    return { action: 'up_to_date' };
  }

  const result = await pushSnapshot(code);
  return { action: 'pushed', result };
}

/** Soft auto-push when unlocked + pending + online. Fail soft. */
export async function tryAutoPush(): Promise<'pushed' | 'skipped' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'skipped';
    const shop = await getShop();
    if (!shop || !isPro(shop) || !shop.cloudBackupEnabled || !shop.cloudBackupId) {
      return 'skipped';
    }
    const code = await getUnlockedRecoveryCode(shop.cloudBackupId);
    if (!code) return 'skipped';
    if (
      !needsPush({
        lastLocalChangeAt: shop.lastLocalChangeAt,
        lastCloudBackupAt: shop.lastCloudBackupAt,
      })
    ) {
      return 'skipped';
    }
    // Don't auto-overwrite if remote is newer — leave for Sync Now confirm
    try {
      const { compare } = await fetchRemoteCompare();
      if (compare === 'remote_newer') return 'skipped';
    } catch {
      /* proceed to try push */
    }
    await pushSnapshot(code);
    return 'pushed';
  } catch {
    return 'failed';
  }
}

/** On focus/open: if remote newer, return offer; else optional auto-push. */
export async function checkPullOnFocus(): Promise<
  | { kind: 'offer_restore'; remoteAt?: number }
  | { kind: 'none' }
> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { kind: 'none' };
    }
    const shop = await getShop();
    if (!shop || !isPro(shop) || !shop.cloudBackupEnabled || !shop.cloudBackupId) {
      return { kind: 'none' };
    }
    const unlocked = await isSyncUnlocked(shop.cloudBackupId);
    if (!unlocked) return { kind: 'none' };
    const { compare, remoteExportedAt, remoteStoredAt } =
      await fetchRemoteCompare();
    if (compare === 'remote_newer') {
      return {
        kind: 'offer_restore',
        remoteAt: remoteExportedAt || remoteStoredAt,
      };
    }
    return { kind: 'none' };
  } catch {
    return { kind: 'none' };
  }
}
