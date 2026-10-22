/** Dates follow the phone's own locale (order, month names), not a fixed en-NG. */
export function deviceLocale(langs?: readonly string[]): string | undefined {
  const list = langs ?? (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const tag of list) {
    if (!tag) continue;
    try {
      return Intl.DateTimeFormat.supportedLocalesOf([tag]).length ? tag : undefined;
    } catch {
      /* invalid tag: try the next one */
    }
  }
  return undefined;
}
