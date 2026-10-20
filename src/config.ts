/**
 * Central public-facing configuration.
 *
 * PUBLIC_APP_URL is the ONE place the canonical user-facing address lives.
 * Pay-me links, share links, the landing QR code and statements derive from it,
 * so switching to a custom domain (e.g. https://bashibook.com) is a one-line
 * change here (or set VITE_PUBLIC_APP_URL at build time).
 */
const envUrl =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_APP_URL;

export const PUBLIC_APP_URL: string = (envUrl || 'https://debtbook-neon.vercel.app').replace(
  /\/+$/,
  '',
);

/** Brand label shown instead of a raw host name in the UI. */
export const PUBLIC_APP_LABEL = 'BashiBook';

/** App version (injected from package.json at build time). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Build stamp (short ISO date) injected at build time. */
export const APP_BUILD: string =
  typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : '';

/** Support contact — leave empty until the owner provides a public WhatsApp/email. */
export const SUPPORT_WHATSAPP = '';
export const SUPPORT_EMAIL = '';

/** Build an absolute public URL for a hash route, e.g. publicUrl('/payme?x=1'). */
export function publicUrl(hashPath = '/'): string {
  const p = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
  return `${PUBLIC_APP_URL}/#${p}`;
}
