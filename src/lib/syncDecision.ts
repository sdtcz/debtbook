/**
 * Pure helpers for multi-device sync decisions (encrypted snapshot channel).
 * No I/O — unit-testable.
 */

export type SyncCompareResult =
  | 'remote_newer'
  | 'local_newer'
  | 'equal'
  | 'no_remote';

/**
 * Prefer remote meta.exportedAt; fall back to API storedAt.
 * Compare against local lastCloudBackupAt (last successful upload/restore marker).
 */
export function compareCloudTimes(opts: {
  localLastCloudAt?: number | null;
  remoteExportedAt?: number | null;
  remoteStoredAt?: number | null;
}): SyncCompareResult {
  const remote =
    opts.remoteExportedAt && opts.remoteExportedAt > 0
      ? opts.remoteExportedAt
      : opts.remoteStoredAt && opts.remoteStoredAt > 0
        ? opts.remoteStoredAt
        : null;

  if (remote == null) return 'no_remote';

  const local = opts.localLastCloudAt && opts.localLastCloudAt > 0
    ? opts.localLastCloudAt
    : 0;

  // Never synced locally — any remote snapshot is newer
  if (local <= 0) return 'remote_newer';

  // Small skew tolerance (2s) so equal push/pull round-trips don't flap
  const SKEW_MS = 2000;
  if (remote > local + SKEW_MS) return 'remote_newer';
  if (local > remote + SKEW_MS) return 'local_newer';
  return 'equal';
}

/** True when local ledger mutated after the last successful cloud snapshot. */
export function needsPush(opts: {
  lastLocalChangeAt?: number | null;
  lastCloudBackupAt?: number | null;
}): boolean {
  const local = opts.lastLocalChangeAt ?? 0;
  const cloud = opts.lastCloudBackupAt ?? 0;
  if (local <= 0) return false;
  return local > cloud;
}

/**
 * What Sync Now should do given unlock + online + compare result + pending local.
 */
export type SyncNowPlan =
  | 'offline'
  | 'locked'
  | 'pull_offer'
  | 'push'
  | 'skip_equal';

export function planSyncNow(opts: {
  online: boolean;
  unlocked: boolean;
  compare: SyncCompareResult;
  needsPush: boolean;
}): SyncNowPlan {
  if (!opts.online) return 'offline';
  if (!opts.unlocked) return 'locked';
  if (opts.compare === 'remote_newer') return 'pull_offer';
  if (opts.compare === 'local_newer' || opts.needsPush) return 'push';
  if (opts.compare === 'equal' && !opts.needsPush) return 'skip_equal';
  // no_remote or equal-with-pending → push
  return 'push';
}
