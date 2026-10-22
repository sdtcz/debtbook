import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbCache } from '../db/schema';
import { getShop, saveShop, setPin, upsertCustomer } from '../db/repo';
import { exportBackup } from './backup';
import { deriveBackupId, generateRecoveryCode } from './cloudBackup';
import { verifyPin, hashPin } from './pin';
import { FREE_TRIES, lockoutMs, pinWaitRemaining, recordPinFailure, recordPinSuccess } from './pinAttempts';
import { checkRecoveryCode, eraseAndRestore, readBackupFile, resetPinWithRecoveryCode } from './pinRecovery';

const store = new Map<string, string>();
beforeEach(async () => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as { sessionStorage?: unknown }).sessionStorage = { clear: () => undefined };
  try {
    (await getDb()).close();
  } catch {
    /* none */
  }
  resetDbCache();
  globalThis.indexedDB = new IDBFactory();
});

describe('wrong-PIN delay', () => {
  it('gives 5 free tries, then waits 30 s, 1 min, 2 min … capped at 30 min', () => {
    expect(FREE_TRIES).toBe(5);
    expect([1, 2, 3, 4].map(lockoutMs)).toEqual([0, 0, 0, 0]);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(6)).toBe(60_000);
    expect(lockoutMs(7)).toBe(120_000);
    expect(lockoutMs(20)).toBe(30 * 60_000);
  });

  it('records failures in storage, blocks until the wait ends, resets on success', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) expect(recordPinFailure(t0)).toBe(0);
    expect(pinWaitRemaining(t0)).toBe(0);
    expect(recordPinFailure(t0)).toBe(30_000);
    expect(pinWaitRemaining(t0 + 10_000)).toBe(20_000);
    expect(pinWaitRemaining(t0 + 30_000)).toBe(0);
    expect(recordPinFailure(t0 + 30_000)).toBe(60_000);
    expect(store.get('bashibook-pin-fails')).toContain('"n":6');
    recordPinSuccess();
    expect(pinWaitRemaining(t0 + 30_001)).toBe(0);
    expect(recordPinFailure(t0)).toBe(0);
  });

  it('never waits longer than the cap even if the clock was moved back', () => {
    store.set('bashibook-pin-fails', JSON.stringify({ n: 9, until: 10 ** 13 }));
    expect(pinWaitRemaining(0)).toBe(30 * 60_000);
  });
});

describe('Forgot PIN: recovery code', () => {
  const code = generateRecoveryCode();
  const deps = (over: Partial<Record<'fail' | 'offline' | 'bad', boolean>> = {}) => ({
    fetchBlob: async () => {
      if (over.fail) throw Object.assign(new Error('x'), { status: 500 });
      return { ciphertext: 'c', iv: 'i', salt: 's' } as never;
    },
    decrypt: (async () => {
      if (over.bad) throw new Error('bad key');
      return {} as never;
    }) as never,
    online: () => !over.offline,
  });

  it('checks format, cloud backup, matching id, network, then decrypts the cloud backup', async () => {
    const id = await deriveBackupId(code);
    const shop = { cloudBackupId: id };
    expect(await checkRecoveryCode('1234', shop, deps())).toBe('format');
    expect(await checkRecoveryCode(code, { cloudBackupId: undefined }, deps())).toBe('no-cloud');
    expect(await checkRecoveryCode(code, undefined, deps())).toBe('no-cloud');
    expect(await checkRecoveryCode(generateRecoveryCode(), shop, deps())).toBe('mismatch');
    expect(await checkRecoveryCode(code, shop, deps({ offline: true }))).toBe('offline');
    expect(await checkRecoveryCode(code, shop, deps({ fail: true }))).toBe('failed');
    expect(await checkRecoveryCode(code, shop, deps({ bad: true }))).toBe('wrong');
    expect(await checkRecoveryCode(code.toLowerCase().replace(/-/g, ' '), shop, deps())).toBe('ok');
  });

  it('sets a new PIN only after the code is verified', async () => {
    await saveShop('Ada Store');
    await setPin(await hashPin('salt1', '1111'), 'salt1');
    const shop = { cloudBackupId: await deriveBackupId(code) };
    expect(await resetPinWithRecoveryCode(code, shop, '2222', deps({ bad: true }))).toBe('wrong');
    expect(await resetPinWithRecoveryCode(code, shop, '22', deps())).toBe('bad-pin');
    let s = await getShop();
    expect(await verifyPin(s!.pinSalt!, '1111', s!.pinHash!)).toBe(true);
    expect(await resetPinWithRecoveryCode(code, shop, '2222', deps())).toBe('ok');
    s = await getShop();
    expect(s!.pinSalt).not.toBe('salt1');
    expect(await verifyPin(s!.pinSalt!, '2222', s!.pinHash!)).toBe(true);
    expect(await verifyPin(s!.pinSalt!, '1111', s!.pinHash!)).toBe(false);
  });
});

describe('Forgot PIN: erase and restore from a backup file', () => {
  it('rejects a file that is not a backup (before anything is erased)', async () => {
    expect(await readBackupFile(new Blob(['{"hello":1}']))).toBeNull();
    expect(await readBackupFile(new Blob(['not json']))).toBeNull();
  });

  it('erases the locked book, restores the file and drops its PIN', async () => {
    await saveShop('Old Shop');
    await upsertCustomer({ name: 'Bola' });
    await setPin(await hashPin('s', '1234'), 's');
    const file = new Blob([JSON.stringify(await exportBackup())]);
    const backup = await readBackupFile(file);
    expect(backup?.shop?.pinHash).toBeTruthy();
    store.set('debtbook-locale', 'ha');
    store.set('bashibook-pin-fails', '{"n":7,"until":9}');

    await eraseAndRestore(backup);
    const shop = await getShop();
    expect(shop?.name).toBe('Old Shop');
    expect(shop?.pinHash).toBeUndefined();
    expect(shop?.pinSalt).toBeUndefined();
    expect((await exportBackup()).customers.map((c) => c.name)).toEqual(['Bola']);
    expect(store.get('debtbook-locale')).toBe('ha');
    expect(store.has('bashibook-pin-fails')).toBe(false);
  });

  it('erase with no file leaves an empty phone', async () => {
    await saveShop('Old Shop');
    await setPin(await hashPin('s', '1234'), 's');
    await eraseAndRestore(null);
    expect(await getShop()).toBeUndefined();
  });
});
