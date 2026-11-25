// @ts-check
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../icons/', import.meta.url));
const BG = [0x0f, 0x31, 0x22];
const DISC = [0xf2, 0xee, 0xdd];
const DOT = [0xcf, 0x46, 0x31];
const SS = 4;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** @param {number} S @param {number} discFrac @returns {Buffer} */
function png(S, discFrac) {
  const rd = discFrac * S, rt = 0.12 * rd, c = S / 2;
  const raw = Buffer.alloc(S * (1 + S * 4));
  for (let y = 0; y < S; y++) {
    const row = y * (1 + S * 4);
    raw[row] = 0;
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS - c, py = y + (sy + 0.5) / SS - c;
        const d2 = px * px + py * py;
        const col = d2 <= rt * rt ? DOT : d2 <= rd * rd ? DISC : BG;
        r += col[0]; g += col[1]; b += col[2];
      }
      const n = SS * SS, o = row + 1 + x * 4;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(out + 'icon-192.png', png(192, 0.34));
writeFileSync(out + 'icon-512.png', png(512, 0.34));
writeFileSync(out + 'icon-maskable-512.png', png(512, 0.26));
writeFileSync(out + 'apple-touch-icon-180.png', png(180, 0.34));
