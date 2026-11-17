import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import helpHtml from '../../public/help.html?raw';
import { getDb, resetDbCache } from '../db/schema';
import { getShop, saveShop, setCloudBackupMeta } from '../db/repo';
import { deriveBackupId, generateRecoveryCode } from './cloudBackup';
import { deleteMyCloudBackup, NeedRecoveryCodeError } from './cloudBackupDelete';
import { getSyncUnlock, unlockSyncOnDevice } from './syncUnlock';

const calls: { url: string; method: string }[] = [];
let respond: () => Response = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

beforeEach(async () => {
  calls.length = 0;
  respond = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || 'GET' });
    return respond();
  });
  try {
    (await getDb()).close();
  } catch {
    /* none */
  }
  resetDbCache();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => vi.unstubAllGlobals());

async function setupCloud() {
  await saveShop('Test Shop');
  const code = generateRecoveryCode();
  const backupId = await deriveBackupId(code);
  await setCloudBackupMeta({ cloudBackupEnabled: true, cloudBackupId: backupId, lastCloudBackupAt: 1 });
  return { code, backupId };
}

describe('deleteMyCloudBackup', () => {
  it('uses the unlocked code, sends only the backupId, and turns cloud + sync off', async () => {
    const { code, backupId } = await setupCloud();
    await unlockSyncOnDevice(code, backupId);
    const r = await deleteMyCloudBackup();
    expect(r).toEqual({ backupId, thisPhone: true });
    expect(calls).toEqual([{ url: `/api/cloud-backup?id=${backupId}`, method: 'DELETE' }]);
    expect(calls[0].url).not.toContain(code);
    const shop = await getShop();
    expect(shop?.cloudBackupEnabled).toBe(false);
    expect(shop?.cloudBackupId).toBeUndefined();
    expect(await getSyncUnlock()).toBeUndefined();
  });

  it('asks for a code when sync is locked', async () => {
    await setupCloud();
    await expect(deleteMyCloudBackup()).rejects.toBeInstanceOf(NeedRecoveryCodeError);
    expect(calls).toHaveLength(0);
  });

  it('accepts a typed code; another code leaves this phone alone', async () => {
    const { backupId } = await setupCloud();
    const other = generateRecoveryCode();
    const r = await deleteMyCloudBackup(other);
    expect(r.thisPhone).toBe(false);
    expect((await getShop())?.cloudBackupId).toBe(backupId);
    expect((await getShop())?.cloudBackupEnabled).toBe(true);
  });

  it('restores local cloud state when the server delete fails', async () => {
    const { code, backupId } = await setupCloud();
    respond = () => new Response(JSON.stringify({ ok: false, message: 'boom' }), { status: 500 });
    await expect(deleteMyCloudBackup(code)).rejects.toThrow('boom');
    const shop = await getShop();
    expect(shop?.cloudBackupEnabled).toBe(true);
    expect(shop?.cloudBackupId).toBe(backupId);
    expect((await getSyncUnlock())?.backupId).toBe(backupId);
  });

  it('rejects an invalid code without calling the server', async () => {
    await setupCloud();
    await expect(deleteMyCloudBackup('not-a-code')).rejects.toThrow('Invalid recovery code');
    expect(calls).toHaveLength(0);
  });
});

describe('/help privacy text', () => {
  const html = helpHtml;
  it('explains in-app cloud backup deletion with support as fallback', () => {
    const section = html.slice(html.indexOf('<section id="delete-data">'), html.indexOf('<section id="contact"'));
    expect(section).toContain('Settings → Delete my cloud backup');
    expect(section).toContain('support@bashibook.app');
    expect(section).toContain(
      "Lost your recovery code? Your cloud backup is stored under an anonymous ID, so we can't look it up or read it, and nobody can open it without the code.",
    );
    expect(section).toContain('from your Pro receipt address to delete your purchase records; we handle requests within 30 days.');
    expect(section).not.toContain('If you lost your recovery code, or want a purchase record');
    expect(section).toContain("Cloud backups that haven't synced for 90 days are deleted automatically.");
  });
  it('has the new PIN reset text, not the stale one', () => {
    expect(html).toContain(
      'Forgot your PIN? If you use Pro cloud backup, reset it with your recovery code. Otherwise, erase this phone and restore from your latest backup file.',
    );
    expect(html).not.toContain('no way to reset a forgotten PIN');
  });
});
