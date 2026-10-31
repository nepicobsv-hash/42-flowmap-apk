// Minimal PNG icon generator (no deps): deep-space bg + translucent bubbles,
// one gold-ringed bubble. Outputs icon.png, splash-icon.png (same art),
// android-icon-foreground.png (transparent bg, bubbles in the safe zone).
import zlib from 'node:zlib';
import { writeFile } from 'node:fs/promises';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// deterministic PRNG for stars
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function render(size, { withBg }) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const ia = a / 255, oa = px[i + 3] / 255;
    const na = ia + oa * (1 - ia);
    if (na <= 0) return;
    px[i] = Math.round((r * ia + px[i] * oa * (1 - ia)) / na);
    px[i + 1] = Math.round((g * ia + px[i + 1] * oa * (1 - ia)) / na);
    px[i + 2] = Math.round((b * ia + px[i + 2] * oa * (1 - ia)) / na);
    px[i + 3] = Math.round(na * 255);
  };
  if (withBg) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = y / size;
      set(x, y, Math.round(5 + 5 * t), Math.round(9 + 9 * t), Math.round(20 + 28 * t), 255);
    }
    for (let s = 0; s < size * 1.2; s++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      const a = 90 + Math.floor(rand() * 140);
      set(x, y, 255, 255, 255, a);
      if (rand() > 0.8) set(x + 1, y, 255, 255, 255, Math.floor(a / 2));
    }
  }
  const S = size / 1024;
  const bubbles = [
    { x: 400, y: 430, r: 235, c: [127, 208, 255], a: 200, ring: true },
    { x: 660, y: 330, r: 120, c: [255, 157, 92], a: 190 },
    { x: 700, y: 560, r: 150, c: [155, 53, 255], a: 160 },
    { x: 300, y: 660, r: 100, c: [48, 223, 255], a: 170 },
    { x: 560, y: 720, r: 70, c: [255, 77, 121], a: 180 },
    { x: 210, y: 300, r: 60, c: [0, 217, 139], a: 170 },
  ];
  for (const b of bubbles) {
    const cx = b.x * S, cy = b.y * S, cr = b.r * S;
    const x0 = Math.max(0, Math.floor(cx - cr - 8)), x1 = Math.min(size - 1, Math.ceil(cx + cr + 8));
    const y0 = Math.max(0, Math.floor(cy - cr - 8)), y1 = Math.min(size - 1, Math.ceil(cy + cr + 8));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= cr) {
        const hl = Math.max(0, 1 - Math.hypot(x - (cx - cr * 0.35), y - (cy - cr * 0.35)) / (cr * 0.9));
        set(x, y,
          Math.min(255, b.c[0] + hl * 70), Math.min(255, b.c[1] + hl * 70), Math.min(255, b.c[2] + hl * 70),
          Math.round(b.a * (0.75 + 0.25 * (1 - d / cr))));
      } else if (b.ring && d <= cr + 7 * S) {
        set(x, y, 245, 197, 66, 255);
      }
    }
    if (b.ring) { // ★ badge dot in gold at top-right of the ringed bubble
      const bx = cx + cr * 0.74, by = cy - cr * 0.74, br = cr * 0.3;
      for (let y = Math.floor(by - br); y <= by + br; y++) for (let x = Math.floor(bx - br); x <= bx + br; x++) {
        if (Math.hypot(x - bx, y - by) <= br) set(x, y, 245, 197, 66, 255);
      }
    }
  }
  return encodePNG(size, size, px);
}

const dir = new URL('../assets/', import.meta.url);
await writeFile(new URL('icon.png', dir), render(1024, { withBg: true }));
await writeFile(new URL('splash-icon.png', dir), render(1024, { withBg: false }));
await writeFile(new URL('android-icon-foreground.png', dir), render(1024, { withBg: false }));
console.log('icons written');
