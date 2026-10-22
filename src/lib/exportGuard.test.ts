import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./backup', async (orig) => ({
  ...(await orig<typeof import('./backup')>()),
  downloadJson: vi.fn(),
  exportBackup: vi.fn(async () => ({ app: 'debtbook' })),
}));
vi.mock('./deviceSync', () => ({ tryAutoPush: vi.fn(async () => undefined) }));
vi.mock('./syncUnlock', () => ({ lockSyncOnDevice: vi.fn(async () => undefined) }));

import { downloadJson, exportBackup } from './backup';
import { guardEraseDownload, guardExport, subscribePinRequests, type PinRequest } from './pinGuard';
import { signOutAndErase } from './session';

const withPin = { pinHash: 'h', pinSalt: 's' };
let asked: PinRequest[] = [];
let answer = false;
let off = () => {};
beforeEach(() => {
  asked = [];
  off = subscribePinRequests((r) => {
    if (!r) return;
    asked.push(r);
    queueMicrotask(() => r.resolve(answer));
  });
  vi.mocked(downloadJson).mockClear();
  vi.mocked(exportBackup).mockClear();
});
afterEach(() => off());

describe('guardExport: backup / CSV downloads', () => {
  it('no PIN set: allowed with no prompt', async () => {
    expect(await guardExport(null)).toBe(true);
    expect(await guardExport({ pinBeforeDelete: true })).toBe(true);
    expect(asked).toHaveLength(0);
  });

  it('PIN set: always asks, even with "Ask PIN before deleting" off', async () => {
    answer = false;
    expect(await guardExport({ ...withPin, pinBeforeDelete: false })).toBe(false);
    expect(await guardExport(async () => ({ ...withPin }))).toBe(false);
    answer = true;
    expect(await guardExport({ ...withPin })).toBe(true);
    expect(asked.map((r) => r.kind)).toEqual(['export', 'export', 'export']);
  });
});

describe('guardEraseDownload: erase this phone', () => {
  it('no PIN: download then erase, no prompt', async () => {
    expect(await guardEraseDownload(null, () => true)).toBe('download');
    expect(asked).toHaveLength(0);
  });

  it('right PIN: download allowed', async () => {
    answer = true;
    expect(await guardEraseDownload({ ...withPin }, () => false)).toBe('download');
  });

  it('PIN not given: erase only without a download, and only after a second confirm', async () => {
    answer = false;
    const confirmNo = vi.fn(() => true);
    expect(await guardEraseDownload({ ...withPin }, confirmNo)).toBe('skip');
    expect(confirmNo).toHaveBeenCalledOnce();
    expect(await guardEraseDownload({ ...withPin }, () => false)).toBe('cancel');
  });

  it('PIN not given and "Ask PIN before deleting" on: nothing happens', async () => {
    answer = false;
    const confirmNo = vi.fn(() => true);
    expect(await guardEraseDownload({ ...withPin, pinBeforeDelete: true }, confirmNo)).toBe('cancel');
    expect(confirmNo).not.toHaveBeenCalled();
  });
});

describe('signOutAndErase', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    (globalThis as { sessionStorage?: unknown }).sessionStorage = { clear: () => undefined };
  });

  it('never reads or downloads the book when download is false', async () => {
    const r = await signOutAndErase({ download: false });
    expect(r.backupDownloaded).toBe(false);
    expect(exportBackup).not.toHaveBeenCalled();
    expect(downloadJson).not.toHaveBeenCalled();
  });

  it('downloads first when download is true', async () => {
    const r = await signOutAndErase({ download: true });
    expect(r.backupDownloaded).toBe(true);
    expect(downloadJson).toHaveBeenCalledOnce();
  });
});
