/**
 * Tiny, main-bundle check for "running inside the Google Play app" (Trusted Web Activity, app.bashibook.twa).
 * The heavy Play Billing code lives in lib/playBilling (lazy). The website never sets these hints.
 */
export const PLAY_PACKAGE = 'app.bashibook.twa';
const KEY = 'bashibook-play-twa';

/**
 * True when the TWA launched this tab (Android sets document.referrer to android-app://<package> on
 * launch). Remembered in sessionStorage, which is per tab, so a reload inside the app keeps it and the
 * same site in a Chrome tab (which shares localStorage with the TWA) never sees it.
 */
export function playAppHint(
  doc: Pick<Document, 'referrer'> | undefined = typeof document !== 'undefined' ? document : undefined,
  ss: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined,
): boolean {
  try {
    if (doc?.referrer?.startsWith(`android-app://${PLAY_PACKAGE}`)) {
      ss?.setItem(KEY, '1');
      return true;
    }
    return ss?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Worth loading lib/playBilling at all: TWA hint, or the browser has the Digital Goods API. */
export function mayHavePlayBilling(w: object | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
  return playAppHint() || (!!w && 'getDigitalGoodsService' in w);
}
