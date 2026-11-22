// 앱 아이콘(PNG) 만들기: 초록 바탕에 흰 음표(♫). 실행: npm run icons
// maskable(안드로이드 둥근 아이콘용)은 음표를 가운데 80% 안에 작게 그립니다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

function inNote(x, y) {
  const heads = [[0.34, 0.70], [0.65, 0.62]];
  const rx = 0.115, ry = 0.085, a = -0.38;
  const stemW = 0.04;
  const tops = [0.27, 0.19];
  for (let i = 0; i < 2; i++) {
    const [cx, cy] = heads[i];
    const dx = x - cx, dy = y - cy;
    const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
    if ((u / rx) ** 2 + (v / ry) ** 2 <= 1) return true;
    const sx = cx + 0.105;
    if (x >= sx - stemW && x <= sx && y >= tops[i] && y <= cy - 0.01) return true;
  }
  // 두 음표를 잇는 굵은 빔
  const x1 = heads[0][0] + 0.105 - stemW, x2 = heads[1][0] + 0.105;
  if (x >= x1 && x <= x2) {
    const t = (x - x1) / (x2 - x1);
    const top = tops[0] + (tops[1] - tops[0]) * t;
    if (y >= top && y <= top + 0.085) return true;
  }
  return false;
}

function png(size, pad = 0) {
  const S = 4;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (px + (sx + 0.5) / S) / size, v = (py + (sy + 0.5) / S) / size;
        if (inNote((u - pad) / (1 - 2 * pad), (v - pad) / (1 - 2 * pad))) hit++;
      }
      const f = hit / (S * S);
      const g = py / size; // 위 #2e8a5c → 아래 #1e5b3f
      const bg = [0x2e + (0x1e - 0x2e) * g, 0x8a + (0x5b - 0x8a) * g, 0x5c + (0x3f - 0x5c) * g];
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(bg[c] * (1 - f) + 255 * f);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const n of [180, 192, 512]) {
  writeFileSync(new URL(`icon-${n}.png`, out), png(n));
  console.log('icon-' + n + '.png');
}
writeFileSync(new URL('icon-maskable-512.png', out), png(512, 0.12));
console.log('icon-maskable-512.png');
