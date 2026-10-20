/**
 * Minimal dependency-free PDF writer (PDF 1.4, base-14 Helvetica, WinAnsi).
 * Enough for statements: text, lines, filled rectangles, multiple A4 pages.
 */

export const A4 = { w: 595.28, h: 841.89 };

const HOOKED: Record<string, string> = {
  'ɗ': 'd', 'Ɗ': 'D', 'ƙ': 'k', 'Ƙ': 'K', 'ɓ': 'b', 'Ɓ': 'B', 'ƴ': 'y', 'Ƴ': 'Y',
  '₦': 'NGN ', '–': '-', '—': '-', '−': '-', '‘': "'", '’': "'", '“': '"', '”': '"',
  '…': '...', '•': '-', '·': '-', '─': '-',
};

/**
 * Make text safe for a base-14 font (WinAnsi ≈ Latin-1). The ₦ glyph and the
 * Hausa hooked letters / Yoruba under-dots are not in Helvetica, so we
 * transliterate (₦ → "NGN", ɗ → d, ọ → o) and replace anything else with "?".
 */
export function pdfSafeText(input: string): string {
  let s = '';
  for (const ch of input) s += HOOKED[ch] ?? ch;
  // Strip combining marks (Yoruba tone marks and under-dots) after decomposition.
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c === 9 || c === 10 || c === 13) out += ' ';
    else if (c < 32) continue;
    else if (c <= 126 || (c >= 160 && c <= 255)) out += ch;
    else out += '?';
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

function pdfString(s: string): string {
  let out = '(';
  for (const ch of pdfSafeText(s)) {
    const c = ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += ch;
  }
  return out + ')';
}

// Helvetica advance widths (1/1000 em) for common chars; fallback approximates.
const W: Record<string, number> = {
  ' ': 278, ',': 278, '.': 278, '-': 333, '+': 584, ':': 278, '/': 278, '(': 333, ')': 333,
  N: 722, G: 778, I: 278, i: 222, l: 222, j: 222, t: 278, f: 278, r: 333, m: 833, w: 722,
  W: 944, M: 833,
};
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of pdfSafeText(text)) {
    if (/[0-9]/.test(ch)) w += 556;
    else if (W[ch] != null) w += W[ch];
    else if (/[A-Z]/.test(ch)) w += 700;
    else w += 540;
  }
  return (w * size * (bold ? 1.04 : 1)) / 1000;
}

/** Cut text with "..." so it fits within maxWidth. */
export function fitText(text: string, size: number, maxWidth: number, bold = false): string {
  const safe = pdfSafeText(text);
  if (textWidth(safe, size, bold) <= maxWidth) return safe;
  let s = safe;
  while (s.length > 1 && textWidth(s + '...', size, bold) > maxWidth) s = s.slice(0, -1);
  return s.trimEnd() + '...';
}

type Rgb = [number, number, number];

export class PdfPage {
  ops: string[] = [];
  private n(v: number): string {
    return (Math.round(v * 100) / 100).toString();
  }
  text(x: number, y: number, s: string, size = 10, opts: { bold?: boolean; color?: Rgb; align?: 'left' | 'right' | 'center' } = {}) {
    const w = opts.align && opts.align !== 'left' ? textWidth(s, size, opts.bold) : 0;
    const tx = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    const c = opts.color ?? [0.07, 0.09, 0.15];
    this.ops.push(
      `${c.map((v) => this.n(v)).join(' ')} rg BT /${opts.bold ? 'F2' : 'F1'} ${size} Tf ${this.n(tx)} ${this.n(y)} Td ${pdfString(s)} Tj ET`,
    );
  }
  line(x1: number, y1: number, x2: number, y2: number, color: Rgb = [0.8, 0.84, 0.88], width = 0.6) {
    this.ops.push(`${color.map((v) => this.n(v)).join(' ')} RG ${width} w ${this.n(x1)} ${this.n(y1)} m ${this.n(x2)} ${this.n(y2)} l S`);
  }
  rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.ops.push(`${color.map((v) => this.n(v)).join(' ')} rg ${this.n(x)} ${this.n(y)} ${this.n(w)} ${this.n(h)} re f`);
  }
  /** Draw a module matrix (e.g. a QR code) as filled squares. */
  matrix(x: number, yTop: number, modules: boolean[][], cell: number) {
    const parts: string[] = ['0 0 0 rg'];
    modules.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark) parts.push(`${this.n(x + c * cell)} ${this.n(yTop - (r + 1) * cell)} ${this.n(cell)} ${this.n(cell)} re`);
      }),
    );
    parts.push('f');
    this.ops.push(parts.join('\n'));
  }
}

/** Serialise pages into PDF bytes. All content is ASCII, so offsets = char offsets. */
export function buildPdf(pages: PdfPage[], title = 'Document'): Uint8Array {
  const objs: string[] = [];
  const kids: number[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = `<< /Title ${pdfString(title)} /Producer (BashiBook) >>`;
  let next = 6;
  for (const p of pages) {
    const stream = p.ops.join('\n');
    const pageId = next++;
    const contentId = next++;
    kids.push(pageId);
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Share a file via the Web Share API (level 2, files) where supported,
 * otherwise trigger a download. Returns what happened.
 */
export async function shareOrDownloadFile(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  title: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([bytes], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title });
        return 'shared';
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
        /* fall through to download */
      }
    }
  } catch {
    /* File constructor unsupported — download instead */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
