/**
 * Encrypted cloud backup — recovery code is the identity (no email).
 * Server stores only opaque backupId + ciphertext; never the recovery code or plaintext ledger.
 */

import type { BackupPayload } from './types';

/** Exclude ambiguous chars: 0 O 1 I l */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP_COUNT = 8;
const GROUP_SIZE = 4;
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedCloudBackup {
  backupId: string;
  ciphertext: string;
  iv: string;
  salt: string;
  meta: {
    version: 1;
    exportedAt: number;
    algorithm: 'AES-GCM';
    kdf: 'PBKDF2-SHA-256';
    iterations: number;
  };
}

export interface CloudBackupBlob {
  backupId: string;
  ciphertext: string;
  iv: string;
  salt: string;
  meta: EncryptedCloudBackup['meta'];
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Strip separators/spaces; uppercase. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Format normalized code as XXXX-XXXX-… groups for display. */
export function formatRecoveryCode(code: string): string {
  const n = normalizeRecoveryCode(code);
  const parts: string[] = [];
  for (let i = 0; i < n.length; i += GROUP_SIZE) {
    parts.push(n.slice(i, i + GROUP_SIZE));
  }
  return parts.join('-');
}

export function generateRecoveryCode(): string {
  const total = GROUP_COUNT * GROUP_SIZE;
  const bytes = new Uint8Array(total);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (let i = 0; i < total; i++) {
    raw += ALPHABET[bytes[i]! % ALPHABET.length]!;
  }
  return formatRecoveryCode(raw);
}

export function isValidRecoveryCode(code: string): boolean {
  const n = normalizeRecoveryCode(code);
  if (n.length !== GROUP_COUNT * GROUP_SIZE) return false;
  for (const ch of n) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Public opaque id — SHA-256 hex of `debtbook-backup-id:` + normalized code. KEEP salt prefix for existing backups. */
export async function deriveBackupId(recoveryCode: string): Promise<string> {
  const normalized = normalizeRecoveryCode(recoveryCode);
  const data = new TextEncoder().encode(`debtbook-backup-id:${normalized}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

async function deriveAesKey(
  recoveryCode: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCode(recoveryCode);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalized),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBackup(
  payload: BackupPayload,
  recoveryCode: string,
): Promise<EncryptedCloudBackup> {
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error('Invalid recovery code');
  }
  const salt = new Uint8Array(SALT_BYTES);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await deriveAesKey(recoveryCode, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext,
  );

  const backupId = await deriveBackupId(recoveryCode);
  return {
    backupId,
    ciphertext: toBase64(new Uint8Array(cipherBuf)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    meta: {
      version: 1,
      exportedAt: payload.exportedAt,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: PBKDF2_ITERATIONS,
    },
  };
}

export async function decryptBackup(
  encrypted: Pick<EncryptedCloudBackup, 'ciphertext' | 'iv' | 'salt'>,
  recoveryCode: string,
): Promise<BackupPayload> {
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error('Invalid recovery code');
  }
  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ciphertext);
  const key = await deriveAesKey(recoveryCode, salt);

  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    throw new Error('Wrong recovery code or corrupt backup');
  }

  const text = new TextDecoder().decode(plainBuf);
  const data = JSON.parse(text) as BackupPayload;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.customers) ||
    !Array.isArray(data.entries)
  ) {
    throw new Error('Invalid backup payload');
  }
  return data;
}
