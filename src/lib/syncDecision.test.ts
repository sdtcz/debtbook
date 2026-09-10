import { describe, expect, it } from 'vitest';
import {
  compareCloudTimes,
  needsPush,
  planSyncNow,
} from './syncDecision';

describe('compareCloudTimes', () => {
  it('returns no_remote when neither remote timestamp exists', () => {
    expect(
      compareCloudTimes({ localLastCloudAt: 1000 }),
    ).toBe('no_remote');
  });

  it('prefers exportedAt over storedAt', () => {
    expect(
      compareCloudTimes({
        localLastCloudAt: 1000,
        remoteExportedAt: 5000,
        remoteStoredAt: 9000,
      }),
    ).toBe('remote_newer');
  });

  it('falls back to storedAt when exportedAt missing', () => {
    expect(
      compareCloudTimes({
        localLastCloudAt: 1000,
        remoteStoredAt: 5000,
      }),
    ).toBe('remote_newer');
  });

  it('detects local_newer and equal within skew', () => {
    expect(
      compareCloudTimes({
        localLastCloudAt: 10_000,
        remoteExportedAt: 5_000,
      }),
    ).toBe('local_newer');

    expect(
      compareCloudTimes({
        localLastCloudAt: 10_000,
        remoteExportedAt: 10_500,
      }),
    ).toBe('equal');

    expect(
      compareCloudTimes({
        localLastCloudAt: 10_000,
        remoteExportedAt: 10_000,
      }),
    ).toBe('equal');
  });

  it('treats missing local as 0 so any remote is newer', () => {
    expect(
      compareCloudTimes({
        remoteExportedAt: 100,
      }),
    ).toBe('remote_newer');
  });
});

describe('needsPush', () => {
  it('false when no local changes recorded', () => {
    expect(needsPush({ lastCloudBackupAt: 1000 })).toBe(false);
    expect(
      needsPush({ lastLocalChangeAt: 0, lastCloudBackupAt: 1000 }),
    ).toBe(false);
  });

  it('true when local change after last cloud backup', () => {
    expect(
      needsPush({
        lastLocalChangeAt: 2000,
        lastCloudBackupAt: 1000,
      }),
    ).toBe(true);
  });

  it('false when cloud is same or newer', () => {
    expect(
      needsPush({
        lastLocalChangeAt: 1000,
        lastCloudBackupAt: 1000,
      }),
    ).toBe(false);
    expect(
      needsPush({
        lastLocalChangeAt: 1000,
        lastCloudBackupAt: 2000,
      }),
    ).toBe(false);
  });
});

describe('planSyncNow', () => {
  it('offline and locked take priority', () => {
    expect(
      planSyncNow({
        online: false,
        unlocked: true,
        compare: 'remote_newer',
        needsPush: true,
      }),
    ).toBe('offline');
    expect(
      planSyncNow({
        online: true,
        unlocked: false,
        compare: 'local_newer',
        needsPush: true,
      }),
    ).toBe('locked');
  });

  it('offers pull when remote newer', () => {
    expect(
      planSyncNow({
        online: true,
        unlocked: true,
        compare: 'remote_newer',
        needsPush: false,
      }),
    ).toBe('pull_offer');
  });

  it('pushes when local newer or pending changes', () => {
    expect(
      planSyncNow({
        online: true,
        unlocked: true,
        compare: 'local_newer',
        needsPush: false,
      }),
    ).toBe('push');
    expect(
      planSyncNow({
        online: true,
        unlocked: true,
        compare: 'equal',
        needsPush: true,
      }),
    ).toBe('push');
    expect(
      planSyncNow({
        online: true,
        unlocked: true,
        compare: 'no_remote',
        needsPush: false,
      }),
    ).toBe('push');
  });

  it('skips when equal and nothing pending', () => {
    expect(
      planSyncNow({
        online: true,
        unlocked: true,
        compare: 'equal',
        needsPush: false,
      }),
    ).toBe('skip_equal');
  });
});
