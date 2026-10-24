import { isRegionNigeria } from '../i18n';
import { useLocale } from '../hooks/useLocale';

/** Brand taglines (Figma Bro final pack, Oct 2026). Pidgin is for Nigeria only. */
export const TAGLINE = 'Record it. Remind. Get paid.';
export const TAGLINE_NG = 'Write am. Remind am. Collect am.';

export function brandTagline(nigeria = isRegionNigeria()): string {
  return nigeria ? TAGLINE_NG : TAGLINE;
}

interface Props {
  /** White wordmark for dark backgrounds (landing). */
  reverse?: boolean;
  /** Wrap the wordmark in an <h1> (screen title). */
  heading?: boolean;
  class?: string;
}

/** Speech-bubble "B" mark + wordmark + region tagline. Images are tiny SVGs (precached for offline). */
export function BrandLockup({ reverse = false, heading = false, class: cls = '' }: Props) {
  useLocale(); // re-render when the region answer arrives (tagline swap)
  const word = (
    <img
      class="brand-wordmark"
      src={reverse ? '/brand/wordmark-reverse.svg' : '/brand/wordmark.svg'}
      width={132}
      height={26}
      alt="BashiBook"
    />
  );
  return (
    <div class={`brand-lockup${reverse ? ' reverse' : ''}${cls ? ` ${cls}` : ''}`}>
      <img class="brand-mark" src="/icons/icon.svg" width={44} height={44} alt="" />
      <div class="brand-text">
        {heading ? <h1 class="brand-h1">{word}</h1> : word}
        <span class="brand-tagline">{brandTagline()}</span>
      </div>
    </div>
  );
}
