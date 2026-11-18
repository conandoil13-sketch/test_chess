// 20×20 월드를 한 장의 도트 텍스처로 생성한다.
// 지형은 칸을 넘어 이어지고, 모든 칸은 성벽으로 나뉜다. 지형·건물은 이동 판정과 무관한 시각 시안이다.
import { hash, fbm, rng, seedOf } from './noise.js';

export const N = 20;        // 칸 수
export const C = 64;        // 한 칸의 텍스처 픽셀
export const W = N * C;     // 텍스처 크기
export const OY = 64;       // 높은 건물이 위로 잘리지 않도록 둔 여백
export const S = 2;         // 텍스처 1픽셀 = 월드 2px

export const BIOME_NAMES = { cyber: '네온 지구', city: '성곽 도시', town: '마을', farm: '경작지', forest: '숲', meadow: '초원', lake: '호수' };

const CENTERS = [[10.3, 10.4, 1.02], [4.4, 4.3, 0.74], [15.7, 15.3, 0.84], [3.6, 15.8, 0.52], [16.8, 7.6, 0.56]];

// ---------- 연속 지형 함수 (칸 단위 좌표) ----------
function riverX(v) { return 6.2 + v * 0.42 + 1.6 * Math.sin(v * 0.42 + 0.8) + 0.6 * Math.sin(v * 1.1); }

export function waterDist(u, v) {
  let d = Math.abs(u - riverX(v)) - (0.3 + 0.07 * Math.sin(v * 0.7 + 1.3));
  const tv = 13.3 + 1.1 * Math.sin(u * 0.6);
  if (u < riverX(tv) + 0.2) d = Math.min(d, Math.abs(v - tv) - 0.15);
  const lx = 15.6, ly = 3.5;
  if (Math.abs(u - lx) < 3 && Math.abs(v - ly) < 2.6) {
    const e = Math.hypot((u - lx) / 1.55, (v - ly) / 1.15) + (fbm(u * 1.4, v * 1.4, 41, 3) - 0.5) * 0.45;
    d = Math.min(d, (e - 1) * 1.2);
  }
  return d;
}

function devAt(u, v) {
  let m = 0;
  for (const [x, y, w] of CENTERS) m = Math.max(m, w * Math.exp(-((u - x) ** 2 + (v - y) ** 2) / 8));
  return m + (fbm(u * 0.35, v * 0.35, 7, 3) - 0.5) * 0.35;
}

function classify(x, y) {
  let wc = 0;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (waterDist(x + (i + 0.5) / 5, y + (j + 0.5) / 5) < 0) wc++;
  const frac = wc / 25;
  if (frac > 0.5) return { b: 'lake', frac };
  const d = devAt(x + 0.5, y + 0.5);
  const m = fbm((x + 0.5) * 0.28, (y + 0.5) * 0.28, 13, 3);
  let b;
  if (d > 0.8) b = 'cyber';
  else if (d > 0.58) b = 'city';
  else if (d > 0.4) b = 'town';
  else if (m > 0.56) b = 'forest';
  else if (m < 0.46) b = 'farm';
  else b = 'meadow';
  return { b, frac };
}

// ---------- 팔레트 ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const pal = (p, t, d) => p[Math.max(0, Math.min(p.length - 1, Math.floor(t * p.length + d)))];

const GRASS = [[34, 54, 40], [42, 66, 44], [52, 79, 49], [64, 93, 55], [79, 108, 61]];
const FOREST = [[22, 38, 31], [28, 47, 35], [35, 57, 39], [44, 68, 44]];
const WATER = [[16, 33, 54], [20, 45, 70], [26, 59, 88], [38, 80, 110], [60, 108, 132]];
const SAND = [[112, 102, 76], [130, 118, 86]];
const STONE = [[58, 58, 66], [68, 68, 76], [79, 78, 86], [90, 89, 96]];
const TECH = [[22, 26, 36], [27, 32, 44], [33, 39, 53]];
const COBBLE = [[98, 95, 92], [112, 108, 102], [124, 120, 112]];
const DIRT = [[86, 70, 50], [98, 80, 57], [110, 90, 64]];
const ASPHALT = [[22, 24, 32], [27, 29, 38]];
const BRIDGE = [[104, 76, 48], [76, 54, 34]];
const CROPS = [
  [[92, 96, 44], [108, 110, 52], [80, 84, 40]],
  [[64, 88, 40], [76, 102, 46], [56, 76, 36]],
  [[128, 102, 54], [144, 116, 60], [110, 88, 46]],
];
const FLOWERS = [[230, 210, 120], [220, 140, 160], [200, 220, 240]];
const CURB = [70, 68, 66];
const NEON_LINE = [70, 210, 235];

const ROOFS = [
  ['#3d4358', '#2c3142', '#566080', '#1a1d28'],
  ['#3f6a6a', '#2d4c4c', '#5a8c88', '#1a2e2e'],
  ['#4a3f5c', '#352c44', '#6a5a88', '#1f1a29'],
  ['#5e3a3c', '#432a2c', '#7c4e50', '#261718'],
];
const WALLS = [['#9a97a6', '#6c6a79'], ['#8a8698', '#5f5c6e'], ['#a8a4a8', '#7a767c'], ['#7d7a8c', '#555264']];
const TREES = [['#3f6b3a', '#2c4f2c', '#5a8a4a'], ['#4b7a3e', '#335a2d', '#6a9c52'], ['#5e6e34', '#434f25', '#7c8c44']];
const PINES = [['#2f5a3c', '#1f402b'], ['#365f3a', '#24462b']];
const NEONS = ['#3ff0ff', '#ff4fd8', '#b4ff4f', '#ffb03f'];
const WARM = '#ffc66b';
const SHADOW = 'rgba(5,7,14,0.42)';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

// ---------- 바닥 픽셀 패스 ----------
function paintGround(ctx, cells) {
  const img = ctx.createImageData(W, W);
  const D = img.data;
  for (let gy = 0; gy < W; gy++) {
    const v = gy / C, cy = gy >> 6, ly = gy & 63;
    for (let gx = 0; gx < W; gx++) {
      const u = gx / C, cx = gx >> 6, lx = gx & 63;
      const b = cells[cy][cx].b;
      const dth = BAYER[((gy & 3) << 2) | (gx & 3)];
      const wd = waterDist(u, v);
      const inner = lx > 4 && lx < 60 && ly > 4 && ly < 60;
      const settled = b === 'city' || b === 'cyber' || b === 'town';
      const ax = Math.abs(lx - 31.5), ay = Math.abs(ly - 31.5);
      let road = 0;
      if (settled) { if (ax < 3.5) road = 1; if (ay < 3.5) road = road ? 3 : 2; }
      else if (b === 'meadow' || b === 'farm') { if (ax < 1) road = 1; if (ay < 1) road = road ? 3 : 2; }
      let col;
      if (road) {
        if (wd < 0) col = ((road === 1 ? ly : lx) % 3 === 0) ? BRIDGE[1] : BRIDGE[0];
        else if (b === 'cyber') col = (road === 1 && ax < 0.6 && (ly >> 2) % 2) || (road === 2 && ay < 0.6 && (lx >> 2) % 2) ? NEON_LINE : pal(ASPHALT, hash(gx, gy, 2), dth);
        else if (b === 'city') col = road !== 3 && (road === 1 ? ax : ay) > 2.6 ? CURB : pal(COBBLE, hash(gx >> 1, gy >> 1, 2), dth);
        else col = pal(DIRT, hash(gx, gy, 2) * 0.6 + 0.2, dth);
      } else if (wd < 0) {
        const t = 0.5 + (fbm(u * 2.5, v * 2.5, 3, 2) - 0.5) * 1.1 + Math.max(0, 0.07 + wd) * 6;
        col = pal(WATER, t, dth);
      } else if (wd < 0.05) {
        col = pal(SAND, hash(gx, gy, 5), dth);
      } else {
        const n = fbm(u * 2.2, v * 2.2, 1, 3);
        if (inner && b === 'city') {
          const mortar = ly % 4 === 0 || (lx + ((ly >> 2) & 1) * 3) % 6 === 0;
          col = pal(STONE, n * 0.8 + (mortar ? -0.4 : 0.15), dth);
        } else if (inner && b === 'cyber') {
          const seam = lx % 8 === 0 || ly % 8 === 0;
          col = seam ? (hash(gx, gy, 6) > 0.96 ? [40, 130, 150] : TECH[0]) : pal(TECH, n, dth);
        } else if (inner && b === 'farm') {
          const patch = hash(gx >> 4, gy >> 4, 77);
          const crop = CROPS[Math.floor(patch * 3)];
          const row = (ly + Math.floor(patch * 4)) % 3 === 0;
          col = pal(crop, row ? 0.02 : 0.6 + (n - 0.5), dth);
        } else if (b === 'forest') {
          col = pal(FOREST, n, dth);
        } else {
          col = pal(GRASS, n * 1.15 - 0.08, dth);
          if ((b === 'meadow' || b === 'town') && hash(gx, gy, 9) > 0.993) col = FLOWERS[Math.floor(hash(gx, gy, 10) * 3)];
        }
      }
      const o = (gy * W + gx) * 4;
      D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, OY);
}

// ---------- 오브젝트 그리기 (오블리크 시점: 윗면은 높이만큼 위로) ----------
// 고딕 + 사이버펑크: 회청색 돌, 뾰족 박공·첨탑, 첨두창(1×2)과 네온.
function drawHouse(ctx, b) {
  const { x, y, w, d, h } = b;
  const fy = y + d - h;
  // 지붕(윗면): 슬레이트
  const ry = y - h - 1, rh = d + 1, half = Math.ceil(rh / 2);
  R(ctx, x - 1, ry, w + 2, rh, b.roof[1]);
  R(ctx, x - 1, ry + half, w + 2, rh - half, b.roof[0]);
  R(ctx, x - 1, ry + half - 1, w + 2, 1, b.roof[2]);
  R(ctx, x - 1, ry + rh - 1, w + 2, 1, b.roof[3]);
  // 정면 벽 + 버팀벽 줄
  R(ctx, x, fy, w, h, b.wall[0]);
  R(ctx, x + w - 1, fy, 1, h, b.wall[1]);
  R(ctx, x, y + d - 1, w, 1, b.wall[1]);
  if (w >= 8) R(ctx, x + (w >> 1) - (w & 1 ? 0 : 1) - 2, fy + 1, 1, h - 1, b.wall[1]);
  if (w >= 8) R(ctx, x + (w >> 1) + 2, fy + 1, 1, h - 1, b.wall[1]);
  // 첨두 문
  const dx = x + (w >> 1) - 1;
  R(ctx, dx, y + d - 3, 2, 3, '#14121a');
  R(ctx, dx, y + d - 4, 1, 1, '#14121a');
  // 첨두창(1×2)
  for (const wi of b.wins) R(ctx, wi.x, wi.y, 1, 2, wi.lit ? wi.c : '#23222c');
  // 정면 박공(뾰족 지붕)과 꼭대기 장식
  const gh = Math.min(5, Math.ceil(w / 2));
  for (let k = 0; k < gh; k++) {
    const gw = Math.max(1, w - k * 2), gx = x + ((w - gw) >> 1);
    R(ctx, gx, fy - 1 - k, gw, 1, b.wall[0]);
    R(ctx, gx, fy - 1 - k, 1, 1, b.roof[3]);
    R(ctx, gx + gw - 1, fy - 1 - k, 1, 1, b.roof[3]);
  }
  R(ctx, x + (w >> 1) - (w & 1 ? 0 : 1), fy - 2 - gh, 1, 2, b.roof[2]);
  R(ctx, x + (w >> 1) - (w & 1 ? 0 : 1), fy - gh + 1, 1, 1, b.rose ? '#ffe2a8' : '#2a2833');
  // 모서리 작은 첨탑
  R(ctx, x, fy - 2, 1, 2, b.wall[1]);
  R(ctx, x + w - 1, fy - 2, 1, 2, b.wall[1]);
  R(ctx, x, fy, w, 1, 'rgba(0,0,0,.3)');
}

function drawCyber(ctx, b) {
  const { x, y, w, d, h } = b;
  const fy = y + d - h;
  R(ctx, x, fy, w, h, '#262a3a');
  R(ctx, x + w - 1, fy, 1, h, '#171a24');
  R(ctx, x, fy, 1, h, '#363c53');
  // 버팀벽 갈비(창 사이 어두운 기둥)
  for (let xx = x + 2; xx < x + w - 1; xx += 2) R(ctx, xx, fy + 2, 1, h - 3, '#1b1e2b');
  for (const wi of b.wins) { R(ctx, wi.x, wi.y, 1, 2, '#1c2131'); }
  // 윗면 + 뾰족한 톱니 지붕
  R(ctx, x, y - h, w, d, '#353b52');
  R(ctx, x, y - h, w, 1, '#4f5674');
  for (let i = 0; i < w; i += 2) R(ctx, x + i, fy - 1 - (i % 4 === 0 ? 1 : 0), 1, 1 + (i % 4 === 0 ? 1 : 0), '#5a6182');
  if (w > 5 && b.unit) R(ctx, x + 1, y - h + 1, 2, 2, '#262b3b');
  if (w >= 6) { R(ctx, x + (w >> 1), y - h - 5, 1, 5, '#6a7190'); R(ctx, x + (w >> 1) - 1, y - h - 2, 3, 1, '#4f5674'); }
  R(ctx, x, fy, w, 1, '#20444f');
}

function drawTower(ctx, b) {
  const { x, y, w, d, h } = b;
  const fy = y + d - h;
  if (b.style === 'stone') {
    R(ctx, x, fy, w, h, '#8a8897');
    R(ctx, x + w - 1, fy, 1, h, '#5d5b6a');
    R(ctx, x, fy, 1, h, '#a9a7b5');
    for (let yy = fy + 4; yy < y + d - 3; yy += 6) { R(ctx, x + (w >> 1), yy, 1, 3, '#24222c'); R(ctx, x + (w >> 1), yy - 1, 1, 1, '#4a4856'); }
    R(ctx, x - 1, fy - 1, w + 2, 1, '#6e6c7c');
    // 가파른 첨탑 + 모서리 피너클
    for (let k = 0; ; k++) {
      const off = Math.floor(k / 3), ww = w - off * 2;
      if (ww <= 0) break;
      R(ctx, x + off, fy - 2 - k, ww, 1, b.roof[1]);
      R(ctx, x + off, fy - 2 - k, Math.ceil(ww / 2), 1, b.roof[0]);
    }
    R(ctx, x + (w >> 1), fy - 4 - Math.ceil(w * 1.5), 1, 2, b.roof[2]);
    R(ctx, x - 1, fy - 4, 1, 3, '#a9a7b5');
    R(ctx, x + w, fy - 4, 1, 3, '#5d5b6a');
  } else {
    R(ctx, x, fy, w, h, '#2b3040');
    R(ctx, x + w - 1, fy, 1, h, '#1b1e28');
    R(ctx, x, fy, 1, h, '#3a4058');
    R(ctx, x, y - h, w, d, '#3a4056');
    R(ctx, x + (w >> 1), fy + 2, 1, h - 3, '#1d4a55');
    for (let i = 0; i < w; i += 2) R(ctx, x + i, fy - 2, 1, 2, '#5a6182');
    R(ctx, x + (w >> 1), y - h - 8, 1, 8, '#8a90a8');
    R(ctx, x + (w >> 1) - 1, y - h - 4, 3, 1, '#5a6182');
  }
}

function drawTree(ctx, t) {
  const { x, y, col } = t;
  if (t.kind === 'pine') {
    R(ctx, x, y - 2, 1, 2, '#3b2a1e');
    for (let k = 0; k < 8; k++) {
      const ww = 1 + 2 * Math.floor(k / 2), yy = y - 10 + k;
      R(ctx, x - (ww >> 1), yy, ww, 1, col[1]);
      R(ctx, x - (ww >> 1), yy, Math.ceil(ww / 2), 1, col[0]);
    }
    return;
  }
  const r = t.r, cy = y - 3 - r;
  R(ctx, x, y - 3, 1, 3, '#4a3322');
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (i * i + j * j > r * r + r * 0.6) continue;
    R(ctx, x + i, cy + j, 1, 1, i + j < -r * 0.6 ? col[2] : i + j > r * 0.5 ? col[1] : col[0]);
  }
}

// 성벽: 회청색 돌, 버팀벽과 첨두 총안, 뾰족한 흉벽. 사이버 구역은 아래에 네온 띠.
const WH = 7;
const WS = { top: '#8b8998', merlon: '#a6a4b3', face: '#4d4b5a', faceHi: '#625f70', rib: '#393745', ribHi: '#5c5a6b', slit: '#1a1922', pin: '#b4b2c0' };
function hWall(ctx, x0, y0, gate, neon) {
  R(ctx, x0, y0 - WH - 1, C, 3, WS.top);
  R(ctx, x0, y0 - WH + 1, C, 1, '#6c6a79');
  for (let i = 0; i < C; i += 4) { R(ctx, x0 + i, y0 - WH - 2, 2, 1, WS.merlon); R(ctx, x0 + i, y0 - WH - 3, 1, 1, WS.merlon); }
  R(ctx, x0, y0 + 2 - WH, C, WH, WS.face);
  R(ctx, x0, y0 + 2 - WH, C, 1, WS.faceHi);
  for (let i = 0; i < C; i += 8) {
    R(ctx, x0 + i, y0 + 2 - WH, 1, WH, WS.ribHi);
    R(ctx, x0 + i + 1, y0 + 2 - WH, 1, WH, WS.rib);
    R(ctx, x0 + i + 4, y0 + 4 - WH, 1, 3, WS.slit);
  }
  for (let i = 0; i < C; i++) if (hash(x0 + i, y0, 3) > 0.84) R(ctx, x0 + i, y0 + 3 - WH + Math.floor(hash(x0 + i, y0, 4) * 5), 1, 1, '#43414f');
  if (neon) R(ctx, x0, y0 + 1, C, 1, '#1f5d68');
  if (gate) {
    const gx = x0 + C / 2 - 4;
    R(ctx, gx - 3, y0 - WH - 5, 14, 5, '#9a98a8');
    R(ctx, gx - 3, y0 - WH - 5, 14, 1, WS.pin);
    R(ctx, gx - 3, y0 - WH, 14, WH + 2, '#5c5a6b');
    R(ctx, gx + 10, y0 - WH, 1, WH + 2, '#403e4c');
    // 양쪽 작은 첨탑
    for (const px of [gx - 3, gx + 10]) { R(ctx, px, y0 - WH - 9, 1, 4, WS.pin); R(ctx, px, y0 - WH - 10, 1, 1, '#d2d0dc'); }
    // 첨두 아치 문
    R(ctx, gx + 1, y0 - 3, 6, 5, '#120f16');
    R(ctx, gx + 2, y0 - 4, 4, 1, '#120f16');
    R(ctx, gx + 3, y0 - 5, 2, 1, '#120f16');
    R(ctx, gx + 3, y0 - WH - 3, 2, 1, '#2a2833');
  }
}
function vWall(ctx, x0, y0, gate, neon) {
  R(ctx, x0 - 1, y0 - WH - 1, 3, C, WS.top);
  R(ctx, x0 + 1, y0 - WH - 1, 1, C, '#6c6a79');
  for (let i = 0; i < C; i += 4) { R(ctx, x0 - 2, y0 - WH - 1 + i, 1, 2, WS.merlon); R(ctx, x0 - 3, y0 - WH - 1 + i, 1, 1, WS.merlon); }
  if (neon) R(ctx, x0, y0 - WH - 1, 1, C, '#1f5d68');
  if (gate) { R(ctx, x0 - 2, y0 - WH - 1 + C / 2 - 4, 5, 8, '#9a98a8'); R(ctx, x0 - 2, y0 - WH - 5 + C / 2 - 4, 1, 4, WS.pin); R(ctx, x0 + 2, y0 - WH - 5 + C / 2 - 4, 1, 4, WS.pin); }
}
// 성벽 교차점 망루: 뾰족 원뿔 지붕의 고딕 포탑
function wallTower(ctx, x0, y0, cyber) {
  const h = WH + 7, x = x0 - 4, y = y0 - 4, w = 8, d = 6;
  const fy = y + d - h;
  R(ctx, x, fy, w, h, '#5c5a6b');
  R(ctx, x + w - 1, fy, 1, h, '#403e4c');
  R(ctx, x, fy, 1, h, '#74727f');
  R(ctx, x - 1, fy - 1, w + 2, 2, '#8b8998');
  R(ctx, x + 3, fy + 4, 2, 4, cyber ? '#1f5d68' : '#1a1922');
  R(ctx, x + 3, fy + 3, 1, 1, cyber ? '#1f5d68' : '#1a1922');
  // 원뿔 첨탑
  const roof = cyber ? ['#2f3446', '#3e4560', '#5a6182'] : ['#3d4358', '#535b76', '#6d7698'];
  for (let k = 0; ; k++) {
    const off = Math.floor(k / 2), ww = w - off * 2;
    if (ww <= 0) break;
    R(ctx, x + off, fy - 2 - k, ww, 1, roof[0]);
    R(ctx, x + off, fy - 2 - k, Math.ceil(ww / 2), 1, roof[1]);
  }
  R(ctx, x + 3, fy - 2 - w - 2, 1, 3, roof[2]);
  if (cyber) R(ctx, x, fy + 1, w, 1, '#1f5d68');
}

// 발착장: 팔각 석조 단, 안쪽 금속 링과 방사형 홈, 네 방위의 작은 첨탑
function drawPad(ctx, cx, cy, accent, side) {
  for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) {
    const oct = Math.abs(dx) + Math.abs(dy);
    if (oct > 16) continue;
    const d = Math.hypot(dx, dy);
    const edge = oct >= 15 || Math.abs(dx) === 11 || Math.abs(dy) === 11;
    let col;
    if (edge) col = dy < 0 || dx < 0 ? '#8b8998' : '#5c5a6b';
    else if (oct >= 13 || Math.abs(dx) >= 10 || Math.abs(dy) >= 10) col = (dx + dy) & 1 ? '#4d4b5a' : '#55536a';
    else if (d > 8.6) col = '#23222c';
    else if (d > 6.6 && d < 8) col = '#3d4456';
    else if (d < 3.2) col = '#14121a';
    else col = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy) ? '#3a3846' : '#2a2f3b';
    R(ctx, cx + dx, cy + dy, 1, 1, col);
  }
  // 착륙 표식 (승급소 쪽 화살표)
  const dir = side === 'top' ? -1 : 1;
  for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2]]) R(ctx, cx + dx, cy + dir * (-5 - dy), 1, 1, accent);
  R(ctx, cx - 1, cy - 1, 3, 3, '#0d0b12');
}
// 발착장 옆 고딕 관제탑(원뿔 지붕, 빛나는 슬릿, 패드 쪽 다리)
function drawGantry(ctx, x, by) {
  const h = 14, fy = by - h;
  R(ctx, x - 4, fy + 4, 4, 1, '#8b8998');
  R(ctx, x - 4, fy + 5, 4, 1, '#403e4c');
  R(ctx, x, fy, 4, h, '#5c5a6b');
  R(ctx, x, fy, 1, h, '#74727f');
  R(ctx, x + 3, fy, 1, h, '#403e4c');
  R(ctx, x + 1, fy + 4, 2, 4, '#1a1922');
  R(ctx, x + 1, fy + 10, 2, 2, '#1a1922');
  R(ctx, x - 1, fy - 1, 6, 1, '#8b8998');
  R(ctx, x, fy - 3, 4, 2, '#3d4358'); R(ctx, x, fy - 3, 2, 2, '#535b76');
  R(ctx, x + 1, fy - 6, 2, 3, '#3d4358'); R(ctx, x + 1, fy - 6, 1, 3, '#535b76');
  R(ctx, x + 1, fy - 9, 1, 3, '#a6a4b3');
}

// ---------- 생성 ----------
export function generateWorld(canvas) {
  canvas.width = W;
  canvas.height = W + OY;
  const ctx = canvas.getContext('2d');
  const cells = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) row.push(classify(x, y));
    cells.push(row);
  }
  paintGround(ctx, cells);

  const lights = [], objs = [], shadows = [];
  const lr = rng(2026);
  const light = (L) => { L.p = lr(); L.w ??= 1; L.h ??= 1; lights.push(L); };
  const landOK = (gx, gy, m) => waterDist(gx / C, gy / C) > m;
  const LOT = [8, 18, 36, 46];
  const shadowBox = (x, y, w, d, h) => shadows.push(c => R(c, x + 1, y + 1, w + Math.min(h * 0.5, 10), d + 1, SHADOW));

  const addHouse = (r, x, y, w, d, h, wall, roof, neonP = 0) => {
    const b = { x, y, w, d, h, wall: wall || pick(r, WALLS), roof: roof || pick(r, ROOFS), wins: [], rose: r() < 0.45 };
    const fy = y + d - h;
    const winC = () => (r() < 0.72 ? WARM : r() < 0.6 ? '#bfefff' : '#ff9be8');
    if (h >= 5) for (const wx of [x + 1, x + w - 2]) b.wins.push({ x: wx, y: fy + 1, lit: r() < 0.5, c: winC() });
    if (h >= 9) for (const wx of [x + 1, x + w - 2]) b.wins.push({ x: wx, y: fy + 5, lit: r() < 0.35, c: winC() });
    b.wins.filter(wi => wi.lit).forEach(wi => light({ type: 'win', x: wi.x, y: wi.y, h: 2, c: wi.c }));
    const gh = Math.min(5, Math.ceil(w / 2));
    if (b.rose) light({ type: 'win', x: x + (w >> 1) - (w & 1 ? 0 : 1), y: fy - gh + 1, c: '#ffe2a8' });
    if (r() < neonP) light({ type: 'neon', x: x + w, y: fy + 1, w: 1, h: Math.min(4, h - 2), c: pick(r, NEONS) });
    return b;
  };
  const addCyber = (r, x, y, w, d, h) => {
    const b = { x, y, w, d, h, wins: [], unit: r() < 0.6 };
    const fy = y + d - h;
    const tint = r() < 0.7 ? '#7fe9ff' : pick(r, ['#ff8fe6', '#ffd27f', '#c3a6ff']);
    for (let yy = fy + 3; yy < y + d - 2; yy += 3)
      for (let xx = x + 1; xx < x + w - 1; xx += 2)
        if (r() < 0.55) {
          b.wins.push({ x: xx, y: yy });
          light({ type: 'cwin', x: xx, y: yy, h: 2, c: r() < 0.85 ? tint : '#ffd27f' });
        }
    light({ type: 'neon', x, y: fy, w, h: 1, c: pick(r, NEONS) });
    return b;
  };
  const addTower = (r, x, y, w, h, style) => {
    const b = { x, y, w, d: w, h, style, roof: pick(r, ROOFS) };
    const fy = y + w - h;
    if (style === 'cyber') {
      light({ type: 'beacon', x: x + (w >> 1), y: y - h - 8, c: '#ff3b4a' });
      light({ type: 'neon', x: x + (w >> 1), y: fy + 2, w: 1, h: h - 3, c: pick(r, NEONS) });
    } else if (r() < 0.6) light({ type: 'win', x: x + (w >> 1), y: fy + 4, h: 3, c: r() < 0.7 ? WARM : '#bfefff' });
    return b;
  };

  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const { b } = cells[cy][cx];
    const r = rng(seedOf(cx, cy, 99));
    const ox = cx * C, oy = cy * C;
    if (b === 'lake') {
      for (let k = 0; k < 6; k++) {
        const bx = ox + 12 + Math.floor(r() * 40), by = oy + 12 + Math.floor(r() * 40);
        if (waterDist(bx / C, by / C) < -0.12) {
          objs.push({ k: by, f: c => { R(c, bx - 2, by, 5, 1, '#5a3e28'); R(c, bx - 1, by + 1, 3, 1, '#3a281a'); R(c, bx, by - 3, 1, 3, '#8a7a66'); } });
          light({ type: 'win', x: bx, y: by - 4, c: WARM });
          break;
        }
      }
      continue;
    }
    const dens = { cyber: [0.86, 0.5], city: [0.78, 0.32], town: [0.42, 0.06], farm: [0, 0], forest: [0, 0], meadow: [0, 0] }[b];
    let large = r() < dens[1] ? Math.floor(r() * 4) : -1;
    const edge = cy === 0 ? 'top' : cy === N - 1 ? 'bottom' : null;
    if ((edge === 'top' && large < 2) || (edge === 'bottom' && large >= 2)) large = -1;
    let barn = b === 'farm' && r() < 0.65 ? Math.floor(r() * 16) : -1;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const q = (j >> 1) * 2 + (i >> 1);
      if (edge && (i === 1 || i === 2) && (edge === 'top' ? j <= 1 : j >= 2)) continue; // 발착장 자리
      const lx = ox + LOT[i], ly = oy + LOT[j];
      if (q === large) {
        if ((i & 1) === 0 && (j & 1) === 0 && landOK(lx + 10, ly + 10, 0.2)) {
          if (b === 'cyber' || (b === 'city' && r() < 0.3)) {
            const h1 = 9 + Math.floor(r() * 4);
            const base = addCyber(r, lx + 1, ly + 1, 18, 18, h1);
            const mid = addCyber(r, lx + 4, ly + 4 - h1, 12, 12, 12 + Math.floor(r() * 8));
            const top = addCyber(r, lx + 7, ly + 7 - h1 - mid.h, 6, 6, 8 + Math.floor(r() * 8));
            light({ type: 'beacon', x: lx + 10, y: top.y - top.h - 1, c: '#ff3b4a' });
            shadowBox(lx + 1, ly + 1, 18, 18, h1 + mid.h + top.h);
            objs.push({ k: ly + 19, f: c => { drawCyber(c, base); drawCyber(c, mid); drawCyber(c, top); } });
          } else {
            const spire = addTower(r, lx + 13, ly + 1, 6, 26 + Math.floor(r() * 10), 'stone');
            spire.roof = ROOFS[0];
            const hall = addHouse(r, lx + 1, ly + 6, 16, 12, 11 + Math.floor(r() * 3), ['#a9a7b6', '#73717f'], ROOFS[0]);
            light({ type: 'win', x: lx + 7, y: hall.y + hall.d - hall.h + 2, w: 2, h: 3, c: '#ffb36b' });
            if (b === 'city') light({ type: 'neon', x: lx + 1, y: hall.y + hall.d - 1, w: 16, h: 1, c: pick(r, NEONS) });
            shadowBox(lx + 1, ly + 1, 18, 17, 30);
            objs.push({ k: ly + 18, f: c => { drawTower(c, spire); drawHouse(c, hall); } });
          }
        }
        continue;
      }
      if (!landOK(lx + 5, ly + 5, 0.1)) continue;
      const lot = j * 4 + i;
      if (lot === barn) {
        const hb = addHouse(r, lx + 1, ly + 2, 9, 7, 6, ['#7a5a4c', '#57402f'], ROOFS[3]);
        shadowBox(hb.x, hb.y, hb.w, hb.d, hb.h);
        objs.push({ k: hb.y + hb.d, f: c => drawHouse(c, hb) });
        continue;
      }
      if (b === 'farm') {
        if (r() < 0.12) { const hx = lx + 3 + Math.floor(r() * 4), hy = ly + 5 + Math.floor(r() * 3); objs.push({ k: hy, f: c => { R(c, hx, hy - 2, 3, 2, '#c9a54a'); R(c, hx, hy - 3, 2, 1, '#e3c463'); } }); }
        continue;
      }
      if (r() < dens[0]) {
        const roll = r();
        let kind;
        if (b === 'cyber') kind = roll < 0.55 ? 'cyber' : roll < 0.85 ? 'tower' : 'house';
        else if (b === 'city') kind = roll < 0.68 ? 'house' : roll < 0.84 ? 'tower' : 'cyber';
        else kind = roll < 0.9 ? 'house' : 'tower';
        if (kind === 'house') {
          const w = 7 + Math.floor(r() * 3), d = 6 + Math.floor(r() * 3);
          const h = b === 'town' ? 5 + Math.floor(r() * 3) : 6 + Math.floor(r() * 6);
          const hb = addHouse(r, lx + ((10 - w) >> 1), ly + 1 + ((9 - d) >> 1), w, d, h, null, null, b === 'city' ? 0.3 : b === 'cyber' ? 0.6 : 0.04);
          shadowBox(hb.x, hb.y, w, d, h);
          objs.push({ k: hb.y + d, f: c => drawHouse(c, hb) });
        } else if (kind === 'cyber') {
          const w = 7 + Math.floor(r() * 3), d = 6 + Math.floor(r() * 3);
          const h = b === 'cyber' ? 12 + Math.floor(r() * 16) : 9 + Math.floor(r() * 8);
          const cb = addCyber(r, lx + ((10 - w) >> 1), ly + 1, w, d, h);
          shadowBox(cb.x, cb.y, w, d, h);
          objs.push({ k: cb.y + d, f: c => drawCyber(c, cb) });
        } else {
          const style = b === 'cyber' || r() < 0.25 ? 'cyber' : 'stone';
          const tb = addTower(r, lx + 3, ly + 3, 5, 16 + Math.floor(r() * 14), style);
          shadowBox(tb.x, tb.y, 5, 5, tb.h);
          objs.push({ k: tb.y + 5, f: c => drawTower(c, tb) });
        }
      } else {
        const trees = b === 'forest' ? 2 + Math.floor(r() * 2) : (b === 'meadow' ? (r() < 0.28 ? 1 : 0) : (r() < 0.3 ? 1 : 0));
        for (let t = 0; t < trees; t++) {
          const tx = lx + 1 + Math.floor(r() * 8), ty = ly + 3 + Math.floor(r() * 7);
          if (!landOK(tx, ty, 0.02)) continue;
          const tree = b === 'forest' && r() < 0.6
            ? { x: tx, y: ty, kind: 'pine', col: pick(r, PINES) }
            : { x: tx, y: ty, kind: 'round', r: 2 + Math.floor(r() * 2), col: pick(r, TREES) };
          shadows.push(c => R(c, tx - 1, ty - 1, 5, 2, SHADOW));
          objs.push({ k: ty, f: c => drawTree(c, tree) });
        }
      }
    }
  }

  // 양 끝 줄 발착장 (승급소행 우주선) — 시각 시안
  const pads = [];
  const decals = [];
  for (let x = 0; x < N; x++) {
    for (const side of ['top', 'bottom']) {
      const px = x * C + 32, py = side === 'top' ? 16 : (N - 1) * C + 46;
      const accent = side === 'top' ? '#bfe9ff' : '#c79bff';
      pads.push({ x: px, y: py, side, col: x });
      decals.push(c => drawPad(c, px, py, accent, side));
      // 네 방위 작은 첨탑과 관제탑은 세워진 물체라 깊이 정렬에 넣는다
      for (const [dx, dy] of [[0, -11], [-11, 0], [11, 0], [0, 11]]) objs.push({ k: py + dy, f: c => { R(c, px + dx, py + dy - 4, 1, 4, '#a6a4b3'); R(c, px + dx, py + dy - 5, 1, 1, '#d2d0dc'); } });
      objs.push({ k: py - 7, f: c => drawGantry(c, px + 10, py - 7) });
      light({ type: 'win', x: px + 11, y: py - 17, w: 2, h: 4, c: accent });
      light({ type: 'beacon', x: px + 11, y: py - 31, c: side === 'top' ? '#bfe9ff' : '#c79bff' });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        light({ type: 'pad', k, x: Math.round(px + Math.cos(a) * 9.5), y: Math.round(py + Math.sin(a) * 9.5), c: accent });
      }
    }
  }

  // 성벽 · 성문 · 망루
  const isSettled = b => b === 'city' || b === 'cyber' || b === 'town';
  const wr = rng(77);
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) {
    const a = y > 0 ? cells[y - 1][x].b : null, bb = y < N ? cells[y][x].b : null;
    const neon = a === 'cyber' || bb === 'cyber';
    const gate = a && bb && a !== 'lake' && bb !== 'lake';
    const x0 = x * C, y0 = y * C;
    shadows.push(c => R(c, x0, y0 + 2, C, 2, SHADOW));
    objs.push({ k: y0 + 2, f: c => hWall(c, x0, y0, gate, neon) });
    if (neon) light({ type: 'wallneon', x: x0, y: y0 + 1, w: C, h: 1, c: '#3ff0ff' });
    for (let i = 4; i < C; i += 8) if (wr() < (neon ? 0.55 : 0.22)) light({ type: 'win', x: x0 + i, y: y0 + 4 - WH, h: 3, c: neon ? '#7fe9ff' : '#ffb36b' });
    if (gate) light({ type: 'win', x: x0 + C / 2 - 1, y: y0 - WH - 3, w: 2, h: 1, c: neon ? '#7fe9ff' : '#ffe2a8' });
    if (gate && (isSettled(a) || isSettled(bb))) {
      light({ type: 'torch', x: x0 + 25, y: y0 - 3, c: '#ff9a3a' });
      light({ type: 'torch', x: x0 + 38, y: y0 - 3, c: '#ff9a3a' });
    }
  }
  for (let x = 0; x <= N; x++) for (let y = 0; y < N; y++) {
    const a = x > 0 ? cells[y][x - 1].b : null, bb = x < N ? cells[y][x].b : null;
    const neon = a === 'cyber' || bb === 'cyber';
    const gate = a && bb && a !== 'lake' && bb !== 'lake';
    const x0 = x * C, y0 = y * C;
    shadows.push(c => R(c, x0 + 2, y0, 2, C, SHADOW));
    objs.push({ k: y0 + C, f: c => vWall(c, x0, y0, gate, neon) });
    if (neon) light({ type: 'wallneon', x: x0, y: y0 - WH - 1, w: 1, h: C, c: '#3ff0ff' });
  }
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    let cyber = false;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (cells[y + dy]?.[x + dx]?.b === 'cyber') cyber = true;
    const x0 = x * C, y0 = y * C;
    objs.push({ k: y0 + 3, f: c => wallTower(c, x0, y0, cyber) });
    if (cyber && wr() < 0.6) light({ type: 'beacon', x: x0 - 1, y: y0 - 2 - WH - 7 - 8, c: '#ff3b4a' });
    else if (wr() < 0.35) light({ type: 'win', x: x0 - 1, y: y0 - 2 - WH - 7 + 3 + 4, h: 3, c: cyber ? '#7fe9ff' : '#ffb36b' });
  }

  ctx.save();
  ctx.translate(0, OY);
  decals.forEach(f => f(ctx));
  shadows.forEach(f => f(ctx));
  objs.sort((p, q) => p.k - q.k).forEach(o => o.f(ctx));
  ctx.restore();

  for (const L of lights) {
    const n = parseInt(L.c.slice(1), 16);
    L.rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const sparkles = [];
  const sr = rng(5);
  for (let i = 0; i < 6000 && sparkles.length < 900; i++) {
    const gx = Math.floor(sr() * W), gy = Math.floor(sr() * W);
    if (waterDist(gx / C, gy / C) < -0.03) sparkles.push({ x: gx, y: gy, p: sr() });
  }
  return { cells, lights, sparkles, pads };
}

export function drawFx(ctx, world, t) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(0, OY);
  ctx.globalCompositeOperation = 'lighter';
  for (const L of world.lights) {
    let a;
    switch (L.type) {
      case 'win': a = 0.6 + 0.25 * Math.sin(t * 0.0011 + L.p * 40); break;
      case 'cwin': a = 0.55 + 0.4 * Math.sin(t * 0.0017 + L.p * 90); break;
      case 'neon': a = hash(Math.floor(t / 90), Math.floor(L.p * 1e5), 5) > 0.975 ? 0.12 : 0.9; break;
      case 'pad': { const ph = ((t * 0.0011 - L.k / 8) % 1 + 1) % 1; a = ph < 0.16 ? 1 : 0.14; break; }
      case 'wallneon': a = 0.28 + 0.08 * Math.sin(t * 0.003 + L.p * 30); break;
      case 'beacon': a = (t * 0.001 + L.p * 1.6) % 1.6 < 0.28 ? 1 : 0.06; break;
      case 'torch': a = 0.62 + 0.22 * Math.sin(t * 0.021 + L.p * 20) + 0.14 * Math.sin(t * 0.037 + L.p * 7); break;
      default: a = 1;
    }
    ctx.fillStyle = `rgba(${L.rgb},${a * 0.1})`;
    ctx.fillRect(L.x - 3, L.y - 3, L.w + 6, L.h + 6);
    ctx.fillStyle = `rgba(${L.rgb},${a * 0.24})`;
    ctx.fillRect(L.x - 1, L.y - 1, L.w + 2, L.h + 2);
    ctx.fillStyle = `rgba(${L.rgb},${a})`;
    ctx.fillRect(L.x, L.y, L.w, L.h);
  }
  for (const s of world.sparkles) {
    const a = Math.sin(t * 0.0021 + s.p * 60);
    if (a > 0.86) {
      ctx.fillStyle = `rgba(170,220,255,${(a - 0.86) * 5})`;
      ctx.fillRect(s.x, s.y, 2, 1);
    }
  }
  ctx.restore();
}

export function cellLabel(world, x, y) {
  const { b, frac } = world.cells[y][x];
  return BIOME_NAMES[b] + (frac > 0 && b !== 'lake' ? ' · 강변' : '') + (y === 0 || y === N - 1 ? ' · 승급소 발착장' : '');
}
