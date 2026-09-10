/** Client helpers for /api/cloud-backup */

import type { CloudBackupBlob, EncryptedCloudBackup } from './cloudBackup';

export class CloudBackupApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CloudBackupApiError';
    this.status = status;
  }
}

export type CloudBackupMetaResponse = {
  backupId: string;
  storedAt?: number;
  meta: EncryptedCloudBackup['meta'] | null;
};

export async function uploadCloudBackup(
  encrypted: EncryptedCloudBackup,
): Promise<{ ok: true; backupId: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new CloudBackupApiError('You are offline — connect to upload cloud backup', 0);
  }
  let res: Response;
  try {
    res = await fetch('/api/cloud-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backupId: encrypted.backupId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        meta: encrypted.meta,
      }),
    });
  } catch {
    throw new CloudBackupApiError('Network error — could not reach cloud backup', 0);
  }

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    backupId?: string;
  };

  if (!res.ok) {
    throw new CloudBackupApiError(
      body.message ||
        (res.status === 501
          ? 'Cloud backup storage is not configured on the server'
          : 'Cloud backup upload failed'),
      res.status,
    );
  }

  return { ok: true, backupId: body.backupId || encrypted.backupId };
}

export async function fetchCloudBackup(
  backupId: string,
): Promise<CloudBackupBlob & { storedAt?: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new CloudBackupApiError('You are offline — connect to restore from cloud', 0);
  }
  let res: Response;
  try {
    res = await fetch(
      `/api/cloud-backup?id=${encodeURIComponent(backupId)}`,
      { method: 'GET' },
    );
  } catch {
    throw new CloudBackupApiError('Network error — could not reach cloud backup', 0);
  }

  const body = (await res.json().catch(() => ({}))) as CloudBackupBlob & {
    ok?: boolean;
    message?: string;
    storedAt?: number;
  };

  if (!res.ok) {
    throw new CloudBackupApiError(
      body.message ||
        (res.status === 404
          ? 'No cloud backup found for this recovery code'
          : res.status === 501
            ? 'Cloud backup storage is not configured on the server'
            : 'Cloud backup download failed'),
      res.status,
    );
  }

  if (!body.ciphertext || !body.iv || !body.salt) {
    throw new CloudBackupApiError('Invalid cloud backup response', res.status);
  }

  return {
    backupId: body.backupId || backupId,
    ciphertext: body.ciphertext,
    iv: body.iv,
    salt: body.salt,
    meta: body.meta,
    storedAt: body.storedAt,
  };
}

/** Cheap “is cloud newer?” check — meta only, no ciphertext. */
export async function fetchCloudBackupMeta(
  backupId: string,
): Promise<CloudBackupMetaResponse> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new CloudBackupApiError('You are offline — connect to check cloud sync', 0);
  }
  let res: Response;
  try {
    res = await fetch(
      `/api/cloud-backup?id=${encodeURIComponent(backupId)}&meta=1`,
      { method: 'GET' },
    );
  } catch {
    throw new CloudBackupApiError('Network error — could not reach cloud backup', 0);
  }

  const body = (await res.json().catch(() => ({}))) as CloudBackupMetaResponse & {
    ok?: boolean;
    message?: string;
  };

  if (!res.ok) {
    throw new CloudBackupApiError(
      body.message ||
        (res.status === 404
          ? 'No cloud backup found for this recovery code'
          : res.status === 501
            ? 'Cloud backup storage is not configured on the server'
            : 'Cloud backup meta failed'),
      res.status,
    );
  }

  return {
    backupId: body.backupId || backupId,
    storedAt: body.storedAt,
    meta: body.meta ?? null,
  };
}
