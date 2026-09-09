/**
 * Generate simple solid-teal PNGs using only Node builtins (zlib + CRC).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(size, path) {
  const TEAL = [15, 118, 110];
  const LIGHT = [236, 253, 245];
  const GOLD = [251, 191, 36];
  const pixels = Buffer.alloc(size * size * 4);

  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];
    pixels[i + 3] = 255;
  };

  const fillRect = (x0, y0, w, h, rgb) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) set(x, y, rgb);
  };
  const fillCircle = (cx, cy, r, rgb) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) set(x, y, rgb);
  };

  fillRect(0, 0, size, size, TEAL);
  const pad = Math.round(size * 0.18);
  fillRect(pad, pad, size - pad * 2, size - pad * 2, LIGHT);
  const lx = pad + Math.round(size * 0.06);
  let ly = pad + Math.round(size * 0.12);
  fillRect(lx, ly, Math.round(size * 0.35), Math.round(size * 0.05), TEAL);
  ly += Math.round(size * 0.12);
  fillRect(lx, ly, Math.round(size * 0.5), Math.round(size * 0.035), [153, 246, 228]);
  ly += Math.round(size * 0.09);
  fillRect(lx, ly, Math.round(size * 0.42), Math.round(size * 0.035), [153, 246, 228]);
  const cx = Math.round(size * 0.7);
  const cy = Math.round(size * 0.7);
  const r = Math.round(size * 0.16);
  fillCircle(cx, cy, r, GOLD);
  fillRect(cx - Math.round(r * 0.35), cy - Math.round(r * 0.45), Math.round(r * 0.18), Math.round(r * 0.9), TEAL);
  fillRect(cx + Math.round(r * 0.18), cy - Math.round(r * 0.45), Math.round(r * 0.18), Math.round(r * 0.9), TEAL);
  fillRect(cx - Math.round(r * 0.35), cy - Math.round(r * 0.1), Math.round(r * 0.7), Math.round(r * 0.18), TEAL);

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log('wrote', path, png.length, 'bytes');
}

writePng(192, join(outDir, 'icon-192.png'));
writePng(512, join(outDir, 'icon-512.png'));
writePng(180, join(outDir, 'apple-touch-icon.png'));
