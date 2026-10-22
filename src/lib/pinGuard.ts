/**
 * "Ask PIN before deleting": an optional extra check (only when a PIN is set)
 * before removing a customer, deleting an entry, or erasing this phone.
 *
 * Pages call `await guardDelete()`; a host mounted once in main.tsx shows the
 * PIN pad and resolves true (PIN correct) or false (cancelled).
 */
import type { ShopProfile } from './types';

export type PinGuardShop = Pick<ShopProfile, 'pinHash' | 'pinSalt' | 'pinBeforeDelete'> | null | undefined;

/** True when the setting is on AND a PIN exists (no PIN = nothing to ask). */
export function shouldAskPinBeforeDelete(shop: PinGuardShop): boolean {
  return Boolean(shop?.pinBeforeDelete && shop.pinHash && shop.pinSalt);
}

/** What the PIN is for: shown as the prompt's title. */
export type PinRequestKind = 'delete' | 'export';

export interface PinRequest {
  salt: string;
  hash: string;
  kind: PinRequestKind;
  resolve: (ok: boolean) => void;
}

type Listener = (req: PinRequest | null) => void;
let listener: Listener | null = null;
let pending: PinRequest | null = null;

/** Called by the host component. */
export function subscribePinRequests(fn: Listener): () => void {
  listener = fn;
  if (pending) fn(pending);
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Ask for the PIN (resolves false if no host is mounted or the user cancels). */
export function requestPin(salt: string, hash: string, kind: PinRequestKind = 'delete'): Promise<boolean> {
  if (pending) pending.resolve(false);
  return new Promise<boolean>((resolve) => {
    const req: PinRequest = {
      salt,
      hash,
      kind,
      resolve: (ok) => {
        if (pending === req) pending = null;
        listener?.(null);
        resolve(ok);
      },
    };
    pending = req;
    if (listener) listener(req);
    else req.resolve(false);
  });
}

/**
 * Gate a destructive action. Pass the shop (or a loader). Returns true when the
 * action may go ahead: setting off / no PIN, or the correct PIN was entered.
 */
export async function guardDelete(
  shop: PinGuardShop | (() => Promise<PinGuardShop>),
): Promise<boolean> {
  const s = typeof shop === 'function' ? await shop() : shop;
  if (!shouldAskPinBeforeDelete(s)) return true;
  return requestPin(s!.pinSalt as string, s!.pinHash as string);
}

type ShopArg = PinGuardShop | (() => Promise<PinGuardShop>);
const load = async (shop: ShopArg): Promise<PinGuardShop> => (typeof shop === 'function' ? shop() : shop);
const hasPin = (s: PinGuardShop): boolean => Boolean(s?.pinHash && s.pinSalt);

/**
 * Gate any download of book data (backup file, CSV). When a PIN is set it is ALWAYS asked,
 * whatever "Ask PIN before deleting" says, so a phone left logged out or unlocked cannot
 * leak the book through a download.
 */
export async function guardExport(shop: ShopArg): Promise<boolean> {
  const s = await load(shop);
  if (!hasPin(s)) return true;
  return requestPin(s!.pinSalt as string, s!.pinHash as string, 'export');
}

/**
 * "Erase this phone" (after its first confirm). Returns:
 *  - 'download': no PIN, or the right PIN: download a backup file, then erase;
 *  - 'skip': PIN not given, but erasing is allowed: erase WITHOUT a download
 *    (only after `confirmNoBackup()`; nothing leaks);
 *  - 'cancel': stop. Also when "Ask PIN before deleting" is on, since the erase itself needs the PIN.
 */
export async function guardEraseDownload(
  shop: ShopArg,
  confirmNoBackup: () => boolean,
): Promise<'download' | 'skip' | 'cancel'> {
  const s = await load(shop);
  if (!hasPin(s)) return 'download';
  if (await requestPin(s!.pinSalt as string, s!.pinHash as string, 'export')) return 'download';
  if (s!.pinBeforeDelete) return 'cancel';
  return confirmNoBackup() ? 'skip' : 'cancel';
}
