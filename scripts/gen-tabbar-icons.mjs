#!/usr/bin/env node
// 生成底部 tabBar 的本地单色图标（普通态银灰 / 选中态品牌橙）。
// 仅使用 Node 内置 zlib 编码 PNG，矢量原语光栅化并做覆盖度抗锯齿，便于随时改色重生成。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 81;
const NORMAL = [168, 168, 173]; // #A8A8AD
const ACTIVE = [213, 91, 31]; // #D55B1F

function canvas() {
  return { size: SIZE, px: new Float32Array(SIZE * SIZE) };
}
const blend = (c, x, y, cov) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  if (cov <= 0) return;
  const i = y * SIZE + x;
  c.px[i] = Math.min(1, c.px[i] + cov);
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const length = (x, y) => Math.hypot(x, y);

function fillCircle(c, cx, cy, r, clip) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const py = y + 0.5;
      if (clip && !clip(x + 0.5, py)) continue;
      const d = length(x + 0.5 - cx, py - cy);
      blend(c, x, y, clamp(r + 0.5 - d, 0, 1));
    }
  }
}
function strokeCircle(c, cx, cy, r, w) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = length(x + 0.5 - cx, y + 0.5 - cy);
      blend(c, x, y, clamp(w / 2 + 0.5 - Math.abs(d - r), 0, 1));
    }
  }
}
function strokeSegment(c, ax, ay, bx, by, w) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let t = ((px - ax) * vx + (py - ay) * vy) / len2;
      t = clamp(t, 0, 1);
      const d = length(px - (ax + t * vx), py - (ay + t * vy));
      blend(c, x, y, clamp(w / 2 + 0.5 - d, 0, 1));
    }
  }
}
// 圆角矩形 SDF
function roundRectSdf(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  const outside = length(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}
function strokeRoundRect(c, cx, cy, halfW, halfH, r, w) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = roundRectSdf(x + 0.5, y + 0.5, cx, cy, halfW, halfH, r);
      blend(c, x, y, clamp(w / 2 + 0.5 - Math.abs(d), 0, 1));
    }
  }
}
// 任意多边形填充：边界框内做 4x4 超采样抗锯齿
function fillPolygon(c, pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  const inside = (px, py) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
        }
      }
      blend(c, x, y, hits / 16);
    }
  }
}

const draw = {
  activities() {
    const c = canvas();
    strokeCircle(c, 40.5, 40.5, 25, 4);
    // 非对称罗盘指针：北端长、南端短，避免单色时被看成“禁止驶入”斜杠
    fillPolygon(c, [
      [40, 20],
      [47, 43],
      [33, 43],
    ]);
    fillPolygon(c, [
      [40, 58],
      [44, 39],
      [36, 39],
    ]);
    return c;
  },
  registrations() {
    const c = canvas();
    strokeRoundRect(c, 40.5, 42, 17, 22, 6, 4);
    strokeSegment(c, 32, 35, 49, 35, 3);
    strokeSegment(c, 32, 44, 49, 44, 3);
    strokeSegment(c, 32, 53, 49, 53, 3);
    return c;
  },
  profile() {
    const c = canvas();
    fillCircle(c, 40.5, 30, 11);
    fillCircle(c, 40.5, 70, 21, (_x, py) => py <= 70);
    return c;
  },
};

function encodePng(c, rgb) {
  const [r, g, b] = rgb;
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  let o = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[o++] = 0;
    for (let x = 0; x < SIZE; x++) {
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = Math.round(c.px[y * SIZE + x] * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'miniprogram', 'assets', 'tabbar');
mkdirSync(outDir, { recursive: true });
for (const [name, drawFn] of Object.entries(draw)) {
  const c = drawFn();
  writeFileSync(join(outDir, `${name}.png`), encodePng(c, NORMAL));
  writeFileSync(join(outDir, `${name}-active.png`), encodePng(c, ACTIVE));
  console.log(`generated ${name}.png / ${name}-active.png`);
}
