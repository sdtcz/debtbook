import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { encodeQr, qrSvgPath, type QrEcl } from './qr';
import { PUBLIC_APP_URL } from '../config';

function decode(text: string, ecl: QrEcl = 'M') {
  const qr = encodeQr(text, ecl);
  const scale = 4;
  const border = 4;
  const px = (qr.size + border * 2) * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + border) * scale + dy) * px + (x + border) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  const res = jsQR(data, px, px);
  return { qr, text: res?.data ?? null };
}

describe('encodeQr', () => {
  it('encodes the public app URL so a scanner reads it back', () => {
    const url = `${PUBLIC_APP_URL}/`;
    const { qr, text } = decode(url);
    expect(text).toBe(url);
    expect(qr.version).toBeLessThanOrEqual(3);
  });

  it('round-trips a range of lengths and versions (incl. version info >= 7)', () => {
    for (const len of [1, 10, 20, 40, 80, 120, 180, 250, 400]) {
      const s = 'https://x.co/#/payme?' + 'ab9Z-'.repeat(Math.ceil(len / 5)).slice(0, len);
      const { text, qr } = decode(s);
      expect(text, `len ${len} v${qr.version}`).toBe(s);
    }
  });

  it('works for every error-correction level and UTF-8 text', () => {
    for (const ecl of ['L', 'M', 'Q', 'H'] as const) {
      expect(decode('Mama Ngozi · ₦5,000 shop', ecl).text).toBe('Mama Ngozi · ₦5,000 shop');
    }
  });

  it('size follows version and svg path covers dark modules', () => {
    const qr = encodeQr('hello');
    expect(qr.size).toBe(qr.version * 4 + 17);
    const path = qrSvgPath(qr);
    expect(path.startsWith('M4 4h7')).toBe(true); // top-left finder row
  });

  it('throws when data is too long', () => {
    expect(() => encodeQr('x'.repeat(4000))).toThrow();
  });
});
