/**
 * Spec 4 share picture: 1080×1350 PNG drawn on the phone (lazy chunk, loaded on tap).
 * Layout follows proto/04-card.css. Order: share the file → share/copy the text → download the picture.
 */
import { shareOrCopyText } from './statement';

export interface WeekPicture {
  kicker: string;
  shop: string;
  bigLabel: string;
  big: string;
  lines: { text: string; overdue?: boolean }[];
  footer: string;
}

const W = 1080;
const H = 1350;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, sans-serif";
const MARK = [
  ['M0 0h512v512H0z', '#0f766e'],
  ['M188 120h136a68 68 0 0 1 68 68v100a68 68 0 0 1-68 68H236l-70 56a9 9 0 0 1-14-8l6-50a68 68 0 0 1-38-66V188a68 68 0 0 1 68-68z', '#fbbf24'],
  ['M219 162h33c37 0 60 13 60 41 0 15-9 26-24 31 19 4 31 17 31 37 0 30-25 47-68 47h-32zm14 32v38h18c13 0 21-7 21-19 0-12-8-19-22-19zm0 63v31h21c15 0 23-6 23-16 0-9-8-15-23-15z', '#134e4a'],
] as const;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function drawWeek(canvas: HTMLCanvasElement, p: WeekPicture): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#134e4a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(251,191,36,.15)';
  ctx.beginPath();
  ctx.arc(W - 80, 80, 260, 0, Math.PI * 2);
  ctx.fill();
  const x = 76;
  const max = W - x * 2;
  let y = 120;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#99f6e4';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(p.kicker.toUpperCase(), x, y);
  y += 84;
  ctx.fillStyle = '#fff';
  ctx.font = `800 68px ${FONT}`;
  for (const l of wrap(ctx, p.shop, max).slice(0, 2)) {
    ctx.fillText(l, x, y);
    y += 76;
  }
  y += 40;
  ctx.fillStyle = '#99f6e4';
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(p.bigLabel, x, y);
  y += 120;
  ctx.fillStyle = '#fbbf24';
  ctx.font = `900 128px ${FONT}`;
  ctx.fillText(p.big, x, y, max);
  y += 92;
  ctx.font = `500 46px ${FONT}`;
  for (const item of p.lines) {
    ctx.fillStyle = item.overdue ? '#fca5a5' : '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(x, y - 36, 36, 36, 12);
    ctx.fill();
    ctx.fillStyle = '#ecfdf5';
    for (const l of wrap(ctx, item.text, max - 68)) {
      ctx.fillText(l, x + 68, y);
      y += 60;
    }
    y += 32;
  }
  const fy = H - 76;
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(x, fy - 72, max, 2);
  ctx.save();
  ctx.translate(x, fy - 46);
  ctx.scale(60 / 512, 60 / 512);
  for (const [d, fill] of MARK) {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(d));
  }
  ctx.restore();
  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = '#ccfbf1';
  ctx.fillText(p.footer, x + 80, fy);
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'right';
  ctx.fillText('bashibook.app', W - x, fy);
}

export async function weekPng(p: WeekPicture): Promise<File | null> {
  try {
    const canvas = document.createElement('canvas');
    drawWeek(canvas, p);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    return blob ? new File([blob], 'bashibook-week.png', { type: 'image/png' }) : null;
  } catch {
    return null;
  }
}

export async function shareWeek(
  p: WeekPicture,
  text: string,
  title: string,
): Promise<'share' | 'clipboard' | 'download' | 'none'> {
  const file = await weekPng(p);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title });
      return 'share';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'none';
    }
  }
  const r = await shareOrCopyText(text, title);
  if (r !== 'none') return r;
  if (!file) return 'none';
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'download';
}
