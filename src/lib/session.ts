/**
 * Sign-in / sign-out for BashiBook.
 *
 * BashiBook has no username/password account: "signing in" on a phone means
 * opening the shop book on this device (Setup), optionally unlocking encrypted
 * cloud sync with the recovery code, and (for Pro checkout) remembering the
 * receipt email. Signing out therefore:
 *   - locks cloud sync on this device (removes the stored recovery code),
 *   - forgets the remembered checkout email and any session-scoped values,
 *   - shows the signed-out welcome screen until the owner signs back in.
 * The offline ledger is kept unless the owner explicitly chooses to erase it,
 * in which case a JSON backup is downloaded first.
 */

import { getDb, resetDbCache } from '../db/schema';
import { downloadJson, exportBackup } from './backup';
import { tryAutoPush } from './deviceSync';
import { lockSyncOnDevice } from './syncUnlock';

export const SIGNED_OUT_KEY = 'bashibook-signed-out';
const DB_NAME = 'debtbook'; // KEEP: IndexedDB name (see db/schema.ts)
/** Session-ish keys cleared on sign-out (device prefs like language are kept). */
const SESSION_KEYS = ['bashibook-pay-email'];
/** Keys kept when erasing the device (language preference only). */
const KEEP_ON_ERASE = ['debtbook-locale', 'bashibook-region'];

export function isSignedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function setSignedOut(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIGNED_OUT_KEY, '1');
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignore private mode */
  }
}

function clearSessionKeys(): void {
  try {
    for (const k of SESSION_KEYS) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

/** Sign out but keep the ledger on this phone. */
export async function signOutKeepData(): Promise<void> {
  // Best effort: push any pending changes to cloud while still unlocked.
  try {
    await tryAutoPush();
  } catch {
    /* offline or not enabled — local data is kept anyway */
  }
  try {
    await lockSyncOnDevice();
  } catch {
    /* db unavailable — nothing to lock */
  }
  clearSessionKeys();
  setSignedOut(true);
}

/** Sign back in on this device (PIN, if set, is still required by the app). */
export function signIn(): void {
  setSignedOut(false);
}

/**
 * Sign out AND erase this device. Downloads a JSON backup first so nothing is
 * lost silently, tries a final cloud push, then deletes the local database.
 */
export async function signOutAndErase(): Promise<{ backupDownloaded: boolean }> {
  let backupDownloaded = false;
  try {
    const data = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`bashibook-backup-before-signout-${stamp}.json`, data);
    backupDownloaded = true;
  } catch {
    backupDownloaded = false;
  }
  try {
    await tryAutoPush();
  } catch {
    /* ignore */
  }
  // Give the browser a moment to start the backup download before wiping.
  await new Promise((r) => setTimeout(r, 600));
  await eraseThisDevice();
  return { backupDownloaded };
}

/**
 * Delete the local book and app keys (language and region kept). No export and no cloud push:
 * also used by "Forgot PIN?", where the locked book must not be opened.
 */
export async function eraseThisDevice(): Promise<void> {
  try {
    await lockSyncOnDevice();
  } catch {
    /* ignore */
  }
  try {
    const db = await getDb();
    db.close();
  } catch {
    /* ignore */
  }
  resetDbCache();
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  try {
    const keep = new Map<string, string>();
    for (const k of KEEP_ON_ERASE) {
      const v = localStorage.getItem(k);
      if (v !== null) keep.set(k, v);
    }
    localStorage.clear();
    sessionStorage.clear();
    keep.forEach((v, k) => localStorage.setItem(k, v));
  } catch {
    /* ignore */
  }
}
