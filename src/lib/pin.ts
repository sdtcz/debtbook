/** PIN lock helpers — SHA-256(salt + pin), never store plaintext. */

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

export async function hashPin(salt: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(salt + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function verifyPin(
  salt: string,
  pin: string,
  expectedHash: string,
): Promise<boolean> {
  const h = await hashPin(salt, pin);
  return h === expectedHash;
}
