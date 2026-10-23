/** True when the phone asks to save data (Chrome "Lite"/Data Saver header, or prefers-reduced-data). */
export function wantsSaveData(): boolean {
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (c?.saveData) return true;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches;
  } catch {
    return false;
  }
}

/** Adds html.save-data so CSS can drop animation, blur and decorative backgrounds. */
export function applySaveData(): boolean {
  const on = wantsSaveData();
  try {
    document.documentElement.classList.toggle('save-data', on);
  } catch {
    /* no DOM (tests) */
  }
  return on;
}
