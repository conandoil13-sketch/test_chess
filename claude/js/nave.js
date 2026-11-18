// 고딕 성당 픽셀 장면. 로딩 화면(관측 성당)과 이동관리국(심사 홀)이 함께 쓴다.
// 화면 크기가 바뀔 때마다 낮은 해상도로 장면 전체를 한 번 광선 투사해 돌·바닥·스테인드글라스 칸을 구워 두고,
// 매 프레임에는 유리 색, 창에서 내려오는 빛줄기와 바닥에 맺히는 색 그림자, 먼지, 촛불만 다시 칠한다.
// 로딩 화면에서는 큰 창 가운데 원창 너머로 정육면체 행성 CB-120이 돌고, 창 쪽을 향한 면의 색이 그 창의 빛 색이 된다.
// 이동관리국에서는 창이 평소 바깥 하늘처럼 보이다가 판정에 따라 초록/빨강 스테인드글라스로 켜진다.
// 촛불·횃불은 pixelfx(MIT, js/vendor/pixelfx)의 효과를 그대로 쓴다.
import { createFrame, createFx, composite, painterFor } from './vendor/pixelfx/core/index.js';
import * as candleFx from './vendor/pixelfx/fx/fire/candle.js';
import * as torchFx from './vendor/pixelfx/fx/fire/torch.js';
import { hash, fbm } from './noise.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const pk = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

// 표면 종류
const K_STONE = 1, K_FLOOR = 2, K_GLASS = 3, K_CLEAR = 4, K_WOOD = 5, K_DARK = 6;
// 창 샘플 결과
const OUT = -1, STONE = 0, LEAD = 8, CLEAR = 7;
let GV = 0; // 창 안 세로 위치(0 아래 ~ 1 꼭대기), 하늘 모드용

// 유리 칸 기본색 (1 테두리, 2 바탕, 3 메달리온, 4 중심, 5 꽃잎, 6 보조, 7 투명)
const PAL_BOOT = [null, [178, 34, 58], [30, 60, 168], [236, 182, 70], [244, 232, 196], [126, 72, 200], [40, 160, 110], [220, 230, 255]];
const PAL_OK = [null, [24, 120, 66], [44, 196, 104], [226, 206, 118], [206, 255, 220], [70, 250, 140], [130, 220, 90], [210, 255, 226]];
const PAL_NO = [null, [140, 16, 34], [236, 46, 64], [255, 150, 56], [255, 186, 170], [255, 84, 84], [190, 56, 36], [255, 206, 196]];
const PAL_SCAN = [null, [40, 118, 160], [70, 190, 236], [200, 240, 255], [232, 250, 255], [127, 233, 255], [60, 160, 200], [222, 250, 255]];
// 정육면체 각 면의 색조 (+x, -x, +y, -y, +z, -z)
const FACE_HUE = [[1, 0.78, 0.38], [0.42, 0.72, 1], [1, 0.46, 0.62], [0.42, 0.95, 0.62], [0.74, 0.52, 1], [1, 0.56, 0.3]];
// 횃불 불꽃 색 (어두운 → 흰): 평소 / 승인 / 거절
const hexRamp = a => a.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const TORCH_FIRE = hexRamp(['#4a1712', '#8a1f17', '#c9281f', '#f2561d', '#ff8a2a', '#ffc23d', '#ffe26b', '#fff3a6', '#ffffff']);
const TORCH_OK = hexRamp(['#0c3418', '#125426', '#1a8238', '#28b850', '#46dc72', '#86f4a0', '#c2ffd0', '#e8fff0', '#ffffff']);
const TORCH_NO = hexRamp(['#3a0610', '#6a0a18', '#a8122a', '#e0203a', '#ff3e4e', '#ff786c', '#ffae9e', '#ffe0d8', '#ffffff']);
const toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
// 로딩 화면 벽돌 줄눈을 흐르는 네온 색
const NEON = [[70, 236, 255], [255, 72, 214], [150, 110, 255]];
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// ---------- 창 모양 ----------
// 뾰족 아치: 폭 w, 아치 시작 높이 hs, 호 반지름 r (원점은 창 아래 가운데)
function pointed(lx, ly, w, hs, r) {
  if (ly < 0 || lx < -w / 2 || lx > w / 2) return false;
  if (ly <= hs) return true;
  const h = ly - hs, o = r - w / 2;
  return (lx + o) * (lx + o) + h * h <= r * r && (lx - o) * (lx - o) + h * h <= r * r;
}
const archRise = (w, r) => Math.sqrt(Math.max(0, r * r - (r - w / 2) ** 2));

// 창살 하나: 테두리 띠, 세로로 쌓인 메달리온, 마름모 납선
function lightPattern(gx, gy, sw, pu, pv) {
  const half = sw / 2, edge = (half - Math.abs(gx)) / pu;
  if (edge < 0.9) return LEAD;
  if (edge < 2.2) return (Math.floor(gy / pv / 3) & 1) ? 6 : 1;
  if (edge < 3) return LEAD;
  const X = gx / pu, Y = gy / pv, swp = sw / pu;
  const P = Math.max(swp * 1.15, 9);
  const my = ((Y % P) + P) % P - P / 2;
  const R = Math.min(swp / 2 - 3.2, P * 0.42);
  const d = Math.hypot(X, my);
  if (R > 2.4 && d < R + 0.5) {
    if (d > R - 0.9) return LEAD;
    const rc = R * 0.42;
    if (d < rc + 0.4) return d > rc - 0.6 ? LEAD : 4;
    return Math.cos(Math.atan2(my, X) * 4) > 0.25 ? 5 : 3;
  }
  const a1 = (X + Y) / 4, a2 = (X - Y) / 4;
  if (a1 - Math.floor(a1) < 0.22 || a2 - Math.floor(a2) < 0.22) return LEAD;
  return 2;
}

// 장미창: 중심(0, cy) 반지름 R. clearCore면 가운데가 투명한 원창
function sampleRose(rose, lx, ly, pu, pv, clearCore) {
  const dx = lx, dy = ly - rose.cy, R = rose.R;
  const d = Math.hypot(dx, dy);
  if (d > R) return OUT;
  const dp = d / pv;
  if (dp > R / pv - 1.8) return STONE;
  const n = rose.n || 12;
  const a = Math.atan2(dy, dx);
  let s = (a / TAU) * n; const si = Math.floor(s); s -= si;
  const spoke = Math.min(s, 1 - s) * TAU * d / n / pu;
  const core = R * (rose.core || 0.56);
  if (clearCore) {
    if (d < core - pv * 0.5) return CLEAR;
    if (d < core + pv * 1.2) return STONE;
  } else if (d < R * 0.24) {
    return d > R * 0.24 - pv * 0.9 ? LEAD : 4;
  }
  if (spoke < (d > R * 0.8 ? 0.6 : 0.85)) return STONE;
  const rOut = R * 0.8;
  if (Math.abs(d - rOut) < pv * 0.6) return LEAD;
  if (d > rOut) return (si & 1) ? 1 : 6;
  const mid = (si + 0.5) * TAU / n, inner = clearCore ? core : R * 0.24;
  const pc = (inner + rOut) / 2, pr = (rOut - inner) * 0.4;
  const pd = Math.hypot(dx - Math.cos(mid) * pc, dy - Math.sin(mid) * pc);
  if (pd < pr) { if (pd > pr - pv * 0.8) return LEAD; return pd < pr * 0.4 ? 4 : 3; }
  return (si & 1) ? 2 : 5;
}

function sampleLancet(win, lx, ly, pu, pv) {
  const { w, hs, r } = win;
  if (!pointed(lx, ly, w, hs, r)) return OUT;
  GV = ly / win.top;
  const b = pu * 1.6, bv = pv * 1.6;
  if (!pointed(lx, ly - bv, w - 2 * b, hs - bv, r - b)) return STONE;
  const iw = w - 2 * b, gy = ly - bv, ihs = hs - bv;
  if (iw / pu >= 12) {
    const mw = pu * 1.4, sw = (iw - mw) / 2, sc = mw / 2 + sw / 2;
    const lt = ihs * 0.97;
    for (const side of [-1, 1]) {
      const gx = lx - side * sc;
      if (pointed(gx, gy, sw, lt, sw * 0.85)) return lightPattern(gx, gy, sw, pu, pv);
    }
    const rr = iw * 0.27, cy = lt + archRise(sw, sw * 0.85) + rr + pv * 0.5;
    const d = Math.hypot(lx / pu, (gy - cy) / pv), rp = rr / pu;
    if (d < rp) {
      if (d > rp - 1) return STONE;
      if (d < rp * 0.36) return d > rp * 0.36 - 0.8 ? LEAD : 4;
      return Math.cos(Math.atan2(gy - cy, lx) * 4) > 0 ? 5 : 6;
    }
    return STONE;
  }
  return lightPattern(lx, gy, iw, pu, pv);
}

function sampleGreat(win, lx, ly, pu, pv) {
  const { w, hs, r } = win;
  if (!pointed(lx, ly, w, hs, r)) return OUT;
  GV = ly / win.top;
  const b = pu * 2.2, bv = pv * 2.2;
  if (!pointed(lx, ly - bv, w - 2 * b, hs - bv, r - b)) return STONE;
  const rose = sampleRose(win.rose, lx, ly, pu, pv, true);
  if (rose !== OUT) return rose;
  const iw = w - 2 * b, n = iw / pu > 44 ? 4 : 2, mw = pu * 1.8, sw = (iw - (n - 1) * mw) / n;
  const gy = ly - bv;
  for (let k = 0; k < n; k++) {
    const gx = lx - (-iw / 2 + sw / 2 + k * (sw + mw));
    if (pointed(gx, gy, sw, win.lightTop, sw * 0.9)) return lightPattern(gx, gy, sw, pu, pv);
  }
  // 창살 위와 장미창 사이: 작은 삼엽 창들
  const tre = win.lightTop + archRise(sw, sw * 0.9);
  for (let k = 0; k < n - 1; k++) {
    const cx = -iw / 2 + sw + mw / 2 + k * (sw + mw);
    const d = Math.hypot((lx - cx) / pu, (gy - tre) / pv), rp = Math.min(sw / pu * 0.38, 5);
    if (d < rp) return d > rp - 0.9 ? LEAD : (k & 1 ? 5 : 3);
  }
  return STONE;
}

function sampleWin(win, lx, ly, pu, pv) {
  if (win.type === 'great') return sampleGreat(win, lx, ly, pu, pv);
  if (win.type === 'rose') { GV = ly / (win.rose.cy + win.rose.R); return sampleRose(win.rose, lx, ly, pu, pv, false); }
  return sampleLancet(win, lx, ly, pu, pv);
}

function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

// 월드 텍스처 대체: 생성 전 임시 지형
function fallbackTex() {
  const T = 64, d = new Uint8ClampedArray(T * T * 3);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = fbm(x / 12, y / 12, 7, 4);
    const c = n < 0.42 ? [26, 59, 88] : n < 0.46 ? [112, 102, 76] : n < 0.62 ? [52, 79, 49] : [35, 57, 39];
    d.set(c, (y * T + x) * 3);
  }
  return d;
}

export function createNave(canvas, { scene = 'boot', getState = () => 'idle' } = {}) {
  const ctx = canvas.getContext('2d');
  const isBoot = scene === 'boot';
  let tex = fallbackTex();
  let G = null; // 현재 해상도의 구운 장면
  let raf = 0, running = false, last = 0, t0 = performance.now();
  let rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const live = { mix: 0, pal: PAL_SCAN.map(c => c && c.slice()), level: 0.3, torch: TORCH_FIRE.map(c => c.slice()) };

  // ---------- 장면 배치 ----------
  function layout() {
    const vw = innerWidth, vh = innerHeight;
    const scale = Math.max(2, Math.round(vh / (isBoot ? 250 : 290)));
    const W = Math.ceil(vw / scale), H = Math.ceil(vh / scale);
    const S = { W, H, scale, cx: W / 2 };
    if (isBoot) {
      S.f = H * 1.0; S.vy = H * 0.5; S.Zb = 2.6; S.Yf = 0.55;
      S.X0 = clamp((W / 2) * 0.9 / S.f, 0.62, 1.7);
      S.Ys = 0.95; S.Ya = S.Ys + S.X0 * 1.1;
      S.ribZ = [1.05, 1.55, 2.08, S.Zb];
      S.piers = [1.05, 1.55, 2.08, S.Zb - 0.05].flatMap(z => [[-S.X0 + 0.04, z, 0.075], [S.X0 - 0.04, z, 0.075]]);
      const gw = Math.min(1.04, S.X0 * 1.4), gr = gw * 0.82;
      const great = { type: 'great', plane: 'back', c: 0, y0: -0.3, w: gw, r: gr, D: [0, 0, -1], Ld: norm3([0.2, -0.66, -0.72]) };
      great.hs = 0.78; great.top = great.hs + archRise(gw, gr);
      great.rose = { cy: great.hs + gw * 0.08, R: gw * 0.43, n: 12, core: 0.64 };
      great.lightTop = great.rose.cy - great.rose.R - 0.14;
      const wins = [great];
      const bays = [[1.05, 1.55], [1.55, 2.08], [2.08, S.Zb]];
      for (const side of [-1, 1]) {
        bays.forEach(([a, b], i) => {
          const w = (b - a) * 0.56, c = (a + b) / 2;
          const L = norm3([-side, -0.62, -0.42]);
          const D = norm3([side * 0.85, 0.25, -0.5]);
          const lw = { type: 'lancet', plane: side < 0 ? 'L' : 'R', c, y0: -0.08, w, r: w * 0.9, hs: 0.5, D, Ld: L, bay: i };
          lw.top = lw.hs + archRise(w, lw.r);
          wins.push(lw);
          const rr = w * 0.34;
          wins.push({ type: 'rose', plane: lw.plane, c, y0: lw.y0 + lw.top + 0.03, rose: { cy: rr, R: rr, n: 8 }, D, Ld: L, top: rr * 2 });
        });
      }
      S.wins = wins;
      // 신도석·제단 상자
      const boxes = [];
      const Y0 = -S.Yf;
      for (const side of [-1, 1]) {
        const xa = side < 0 ? -S.X0 + 0.14 : 0.2, xb = side < 0 ? -0.2 : S.X0 - 0.14;
        for (let z = 1.0; z < S.Zb - 0.72; z += 0.19) {
          boxes.push({ x0: xa, x1: xb, y0: Y0, y1: Y0 + 0.24, z0: z, z1: z + 0.026, m: 'pew' });
          boxes.push({ x0: xa, x1: xb, y0: Y0 + 0.1, y1: Y0 + 0.135, z0: z - 0.1, z1: z, m: 'seat' });
          const xe = side < 0 ? xb : xa;
          boxes.push({ x0: xe - 0.018, x1: xe + 0.018, y0: Y0, y1: Y0 + 0.29, z0: z - 0.12, z1: z + 0.03, m: 'pewend' });
        }
      }
      const sx = Math.min(0.66, S.X0 - 0.1);
      boxes.push({ x0: -sx, x1: sx, y0: Y0, y1: Y0 + 0.05, z0: S.Zb - 0.56, z1: S.Zb, m: 'step' });
      boxes.push({ x0: -sx + 0.1, x1: sx - 0.1, y0: Y0, y1: Y0 + 0.1, z0: S.Zb - 0.46, z1: S.Zb, m: 'step' });
      boxes.push({ x0: -0.3, x1: 0.3, y0: Y0 + 0.1, y1: Y0 + 0.32, z0: S.Zb - 0.32, z1: S.Zb - 0.14, m: 'altar' });
      S.boxes = boxes;
      S.courses = [-0.315, S.Ys - 0.03];
      S.arcade = { y0: -S.Yf + 0.02, y1: -0.335, w: 0.15 };
      // 작은 촛불들 (제단 위, 촛대, 벽 봉헌대)
      const fl = [];
      for (const x of [-0.24, -0.16, -0.08, 0.08, 0.16, 0.24]) fl.push({ x, y: Y0 + 0.32, z: S.Zb - 0.23, stick: 0.05 + (Math.abs(x) < 0.1 ? 0.03 : 0) });
      for (const side of [-1, 1]) {
        for (const dz of [-0.03, 0, 0.03]) fl.push({ x: side * 0.46, y: Y0 + 0.36 + (dz === 0 ? 0.04 : 0), z: S.Zb - 0.4 + dz, stick: 0.03 });
        for (const z of [1.3, 1.82]) for (let k = 0; k < 5; k++) fl.push({ x: side * (S.X0 - 0.06), y: Y0 + 0.22 + (k % 2) * 0.03, z: z - 0.1 + k * 0.05, stick: 0.012 });
      }
      S.flames = fl;
      S.fx = [
        { mod: candleFx, x: W * 0.08, y: H * 0.74, seed: 2, stand: true },
        { mod: candleFx, x: W * 0.92, y: H * 0.74, seed: 5, stand: true },
      ];
    } else {
      S.f = H * 1.05; S.vy = H * 0.44; S.Zb = 1.5;
      S.X0 = (W / 2) * S.Zb / S.f * 0.86;
      S.Yf = 0.31; S.Ys = (S.vy - H * 0.1) * S.Zb / S.f; S.Ya = S.Ys + S.X0 * 0.75;
      S.ribZ = [0.75, 1.12, S.Zb];
      const toX = fx => (fx * W - S.cx) * S.Zb / S.f, toY = fy => (S.vy - fy * H) * S.Zb / S.f;
      S.piers = [];
      for (const fx of [0.035, 0.13, 0.22, 0.78, 0.87, 0.965]) S.piers.push([toX(fx), S.Zb + 0.01, 0.022]);
      S.piers.push([-S.X0 + 0.03, S.Zb - 0.03, 0.05], [S.X0 - 0.03, S.Zb - 0.03, 0.05]);
      const wins = [];
      const y0 = toY(0.55), ytop = toY(0.14);
      for (const fx of [0.083, 0.175, 0.825, 0.917]) {
        const w = Math.max(0.062 * W, 30) * S.Zb / S.f, r = w * 0.85, rise = archRise(w, r);
        const lw = { type: 'lancet', plane: 'back', c: toX(fx), y0, w, r, hs: ytop - y0 - rise, D: [0, 0, -1], Ld: norm3([(0.5 - fx) * 1.15, -0.85, -0.6]) };
        lw.top = lw.hs + rise;
        wins.push(lw);
      }
      for (const fx of [0.255, 0.745]) {
        const R = 0.046 * H * S.Zb / S.f;
        wins.push({ type: 'rose', plane: 'back', c: toX(fx), y0: toY(0.2) - R, rose: { cy: R, R, n: 10 }, D: [0, 0, -1], Ld: norm3([(0.5 - fx) * 0.4, -0.6, -1]), top: 2 * R });
      }
      S.wins = wins;
      S.boxes = [];
      S.courses = [toY(0.122), toY(0.565)];
      S.arcade = { y0: toY(0.665), y1: toY(0.575), w: 0.042 * W * S.Zb / S.f };
      // 창턱마다 봉헌 촛불
      S.flames = [];
      for (const lw of wins.filter(w => w.type === 'lancet')) for (let k = 0; k < 4; k++) S.flames.push({ x: lw.c + (k - 1.5) * lw.w * 0.24, y: lw.y0 - 0.012 + (k % 2) * 0.006, z: S.Zb - 0.02, stick: 0.01 + (k % 2) * 0.006 });
      S.fx = [
        { mod: torchFx, x: W * 0.255, y: H * 0.53, seed: 3 },
        { mod: torchFx, x: W * 0.745, y: H * 0.53, seed: 8 },
      ];
    }
    return S;
  }

  // ---------- 굽기 ----------
  function build() {
    const S = layout();
    const { W, H, f, cx, vy, X0, Yf, Zb, Ys, Ya } = S;
    const N = W * H;
    const base = new Float32Array(N * 3), kind = new Uint8Array(N), depth = new Float32Array(N);
    const surf = new Uint8Array(N); // 빛 받는 면 종류: 1 바닥 2 왼벽 3 오른벽 4 뒷벽 5 기타
    const gi = [], gw = [], gc = [], gt = [], gv = [], ci = [], mor = [], morU = [];
    const prof = X => (Ya - Ys) * Math.pow(Math.max(0, 1 - Math.abs(X) / X0), 0.62);
    const back = S.wins.filter(w => w.plane === 'back'), lw = S.wins.filter(w => w.plane === 'L'), rw = S.wins.filter(w => w.plane === 'R');

    const setc = (i, r, g, b) => { base[i * 3] = r; base[i * 3 + 1] = g; base[i * 3 + 2] = b; };

    for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
      const i = sy * W + sx;
      const dx = (sx + 0.5 - cx) / f, dy = (vy - sy - 0.5) / f;
      let t = Zb, type = 4;
      if (dx !== 0) { const ts = X0 / Math.abs(dx); if (ts < t) { t = ts; type = dx < 0 ? 2 : 3; } }
      if (dy < 0) { const tf = Yf / -dy; if (tf < t) { t = tf; type = 1; } }
      if (dy > 0 && dy * t > Ys + (type === 4 ? prof(dx * t) : 0)) {
        let a = Ys / dy, b = t;
        for (let k = 0; k < 22; k++) { const m = (a + b) / 2; if (dy * m - Ys - prof(dx * m) > 0) b = m; else a = m; }
        t = b; type = 6;
      }
      // 기둥
      let pier = null;
      for (const p of S.piers) {
        const A = dx * dx + 1, B = -2 * (dx * p[0] + p[1]), C = p[0] * p[0] + p[1] * p[1] - p[2] * p[2];
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        const tp = (-B - Math.sqrt(disc)) / (2 * A);
        if (tp > 0.2 && tp < t) { const Y = dy * tp; if (Y > -Yf && Y < Ys + 0.03) { t = tp; type = 5; pier = p; } }
      }
      // 상자
      let box = null, bn = 0;
      for (const bx of S.boxes) {
        let tmin = 0.2, tmax = t, ax = -1;
        const ox = [dx, dy, 1], lo = [bx.x0, bx.y0, bx.z0], hi = [bx.x1, bx.y1, bx.z1];
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const d = ox[k];
          if (Math.abs(d) < 1e-9) { if (0 < lo[k] || 0 > hi[k]) { ok = false; break; } continue; }
          let ta = lo[k] / d, tb = hi[k] / d, sgn = -1;
          if (ta > tb) { const q = ta; ta = tb; tb = q; sgn = 1; }
          if (ta > tmin) { tmin = ta; ax = k * 2 + (sgn > 0 ? 1 : 0); }
          if (tb < tmax) tmax = tb;
          if (tmin > tmax) { ok = false; break; }
        }
        if (ok && ax >= 0 && tmin < t) { t = tmin; type = 7; box = bx; bn = ax; }
      }

      const X = dx * t, Y = dy * t, Z = t;
      depth[i] = Z;
      const pv = Z / f;
      const amb = (0.5 + 0.32 * clamp(Z / Zb)) * (1 - 0.4 * clamp((Y - 0.25) / 1.1)) * clamp(Z / 0.85, 0.32, 1);
      let r = 0, g = 0, b = 0, k = K_STONE;

      if (type === 4 || type === 2 || type === 3) {
        // 벽 + 창
        const wins = type === 4 ? back : type === 2 ? lw : rw;
        const u = type === 4 ? X : Z;
        const pu = type === 4 ? pv : (Z * Z) / (f * X0);
        let code = OUT, win = -1;
        for (const w of wins) {
          const c = sampleWin(w, u - w.c, Y - w.y0, pu, pv);
          if (c !== OUT) { code = c; win = S.wins.indexOf(w); break; }
        }
        if (code === OUT) {
          const sk = stoneK(u, Y, pu, pv, type);
          if (sk < 0) { r = 16; g = 15; b = 22; } else { r = 46 * sk; g = 44 * sk; b = 58 * sk; }
          const dk = decor(S, u, Y, pu, pv);
          if (dk === 1) { r = 96; g = 92; b = 112; }
          else if (dk === 2) { r = 66; g = 63; b = 80; }
          else if (dk === 3) { r *= 0.42; g *= 0.42; b *= 0.5; }
          else if (dk === 4) { r = 10; g = 9; b = 15; }
          const ao = 0.62 + 0.38 * clamp((Y + Yf) / 0.14);
          r *= amb * ao; g *= amb * ao; b *= amb * ao;
          surf[i] = type === 4 ? 4 : type;
          if (isBoot && sk < 0 && dk === 0) {
            // 줄눈 픽셀을 기억해 두고 매 프레임 네온 빛을 흘린다
            const bw = type === 4 ? 0.15 : 0.13, row = Math.floor(Y / 0.07), fv = Y / 0.07 - row;
            const horiz = fv < pv / 0.07 * 0.9;
            const col = Math.floor((u + (row & 1) * bw * 0.5) / bw);
            mor.push(i, horiz ? row : col, horiz ? 1 : 0, type);
            morU.push(horiz ? u : Y);
          }
        } else if (code === STONE) {
          // 창 장식(트레이서리): 밝은 돌, 위·왼쪽 모서리 하이라이트
          const hl = hash(Math.floor(u / pu), Math.floor(Y / pv), 3) > 0.7 ? 1.08 : 1;
          r = 74 * hl * amb * 1.15; g = 71 * hl * amb * 1.15; b = 90 * hl * amb * 1.15;
          surf[i] = 5;
        } else if (code === LEAD) {
          r = 9; g = 8; b = 13; k = K_DARK;
        } else if (code === CLEAR) {
          k = K_CLEAR; ci.push(i);
        } else {
          k = K_GLASS;
          gi.push(i); gw.push(win); gc.push(code); gv.push(GV);
          gt.push(0.86 + 0.2 * hash(Math.floor(u / pu), Math.floor(Y / pv), 11) + 0.06 * Math.sin((u / pu + Y / pv) * 0.7));
        }
      } else if (type === 1) {
        // 체스판 대리석 바닥
        k = K_FLOOR; surf[i] = 1;
        const ts = 0.21, tx = Math.floor(X / ts), tz = Math.floor(Z / ts);
        const fx = X / ts - tx, fz = Z / ts - tz;
        const grout = fx < (pv / ts) * 0.9 || fz < (pv * pv * f / Yf / ts) * 0.0 + (pv / ts) * 0.35;
        const light = ((tx + tz) & 1) === 0;
        const vein = fbm(X * 7 + tx * 3, Z * 7, light ? 21 : 22, 3);
        const vk = Math.abs(vein - 0.5) < 0.035 ? 1 : 0;
        if (light) { r = 72 + vk * 30; g = 68 + vk * 28; b = 86 + vk * 30; } else { r = 18 + vk * 16; g = 17 + vk * 14; b = 25 + vk * 20; }
        if (grout) { r *= 0.55; g *= 0.55; b *= 0.6; }
        // 가운데 통로 깔개(짙은 붉은 천)
        if (isBoot && Math.abs(X) < 0.12 && Z < Zb - 0.56) {
          const edge = Math.abs(X) > 0.1;
          r = edge ? 150 : 70; g = edge ? 112 : 18; b = edge ? 52 : 28;
          if (!edge && hash(Math.floor(X / pv), Math.floor(Z * 40), 5) > 0.8) { r *= 1.15; }
          k = K_STONE;
        }
        const ao = (0.72 + 0.28 * clamp((X0 - Math.abs(X)) / 0.14)) * (0.75 + 0.25 * clamp((Zb - Z) / 0.12));
        r *= amb * ao * 1.05; g *= amb * ao * 1.05; b *= amb * ao * 1.05;
      } else if (type === 6) {
        // 리브 볼트
        surf[i] = 5;
        const rwid = pv * 1.7;
        let rib = Math.abs(X) < rwid;
        for (let q = 0; q < S.ribZ.length; q++) {
          const z1 = S.ribZ[q];
          if (Math.abs(Z - z1) < rwid * 1.2) rib = true;
          const z0 = q ? S.ribZ[q - 1] : z1 - 0.5;
          if (Z > z0 && Z < z1) {
            const u = (Z - z0) / (z1 - z0);
            if (Math.abs(X - X0 * (2 * u - 1)) < rwid * 1.6 || Math.abs(X - X0 * (1 - 2 * u)) < rwid * 1.6) rib = true;
            if (Math.hypot(X / pv, (Z - (z0 + z1) / 2) / pv) < 2.6) { r = 196; g = 150; b = 70; }
          }
        }
        if (r === 0) {
          if (rib) { r = 84; g = 80; b = 100; }
          else {
            const course = Math.floor((Y - Ys) / 0.06), fv = (Y - Ys) / 0.06 - course;
            const sk = fv < pv / 0.06 ? 0.6 : 0.85 + 0.2 * hash(Math.floor(Z / 0.12), course, 9);
            r = 30 * sk; g = 28 * sk; b = 42 * sk;
          }
          r *= amb; g *= amb; b *= amb;
        }
      } else if (type === 5) {
        // 다발 기둥: 세로 홈, 주두, 주초
        surf[i] = 5;
        const ang = Math.atan2(X - pier[0], Z - pier[1]);
        const toCenter = -Math.sign(pier[0]) * Math.sin(ang) * 0.6 - Math.cos(ang) * 0.5;
        let lk = 0.55 + 0.45 * clamp(toCenter + 0.3);
        const flute = Math.cos(ang * 10);
        lk *= flute > 0.6 ? 1.18 : flute < -0.6 ? 0.78 : 1;
        lk += BAYER[((sy & 3) << 2) | (sx & 3)] * 0.12;
        lk = Math.round(lk * 5) / 5;
        let cr = 60, cg = 58, cb = 74;
        if (Y > Ys - 0.07) { cr = 96; cg = 90; cb = 108; if (hash(sx, sy, 4) > 0.6) lk *= 0.8; }
        else if (Y < -Yf + 0.06) { cr = 52; cg = 50; cb = 64; }
        r = cr * lk * amb * 1.25; g = cg * lk * amb * 1.25; b = cb * lk * amb * 1.25;
      } else if (type === 7) {
        // 상자: 나무 신도석, 돌 계단, 제단
        surf[i] = bn === 3 ? 1 : 5;
        const top = bn === 3, front = bn === 4, m = box.m;
        let cr, cg, cb;
        if (m === 'step') { [cr, cg, cb] = top ? [70, 68, 86] : [42, 40, 54]; }
        else if (m === 'altar') {
          if (top) [cr, cg, cb] = [196, 190, 176];
          else if (front) {
            const ux = (X - box.x0) / (box.x1 - box.x0), uy = (Y - box.y0) / (box.y1 - box.y0);
            const band = ux < 0.07 || ux > 0.93 || uy > 0.86 || uy < 0.08;
            const cross = (Math.abs(ux - 0.5) < 0.03 && uy > 0.25 && uy < 0.75) || (Math.abs(uy - 0.56) < 0.045 && Math.abs(ux - 0.5) < 0.12);
            [cr, cg, cb] = band || cross ? [204, 160, 72] : [112, 22, 38];
          } else [cr, cg, cb] = [60, 14, 24];
        } else {
          const grain = (Math.floor((Y - box.y0) / 0.045) & 1) ? 0.9 : 1;
          if (top) [cr, cg, cb] = [96, 62, 40];
          else if (front) [cr, cg, cb] = [58, 36, 26];
          else [cr, cg, cb] = [44, 28, 20];
          cr *= grain; cg *= grain; cb *= grain;
          if (m === 'pewend' && Y > box.y1 - 0.02) { cr *= 1.3; cg *= 1.3; cb *= 1.3; }
          k = K_WOOD;
        }
        r = cr * amb; g = cg * amb; b = cb * amb;
      }
      // 먼 곳일수록 보랏빛 공기
      const hz = 0.24 * clamp(Z / Zb) ** 2;
      r += (34 - r) * hz; g += (30 - g) * hz; b += (52 - b) * hz;
      setc(i, r, g, b);
      kind[i] = k;
    }

    // 원창 너머 별
    const stars = new Float32Array(ci.length);
    ci.forEach((i, n) => { const h = hash(i % W, (i / W) | 0, 77); stars[n] = h > 0.975 ? (h - 0.975) * 40 : 0; });

    const G0 = {
      S, W, H, N, base, kind, depth, surf,
      gi: Int32Array.from(gi), gw: Int16Array.from(gw), gc: Uint8Array.from(gc), gt: Float32Array.from(gt), gv: Float32Array.from(gv),
      ci: Int32Array.from(ci), stars,
      mor: Int32Array.from(mor), morU: Float32Array.from(morU),
      Lr: new Float32Array(N), Lg: new Float32Array(N), Lb: new Float32Array(N),
      frame: createFrame(W, H), img: new ImageData(W, H),
    };
    G0.shafts = S.wins.map(w => bakeShaft(G0, w));
    G0.winScreen = S.wins.map(w => {
      const mid = w.type === 'rose' ? w.y0 + w.rose.cy : w.y0 + w.top * 0.55;
      const z = w.plane === 'back' ? Zb : w.c;
      const x = w.plane === 'back' ? w.c : w.plane === 'L' ? -X0 : X0;
      return { x: cx + f * x / z, y: vy - f * mid / z, r: f * (w.top || 0.3) / z * 0.75 };
    });
    // 원창(행성 자리) 화면 위치
    const great = S.wins.find(w => w.type === 'great');
    if (great) {
      const R = great.rose.R * great.rose.core * f / Zb;
      G0.planet = { x: cx + f * great.c / Zb, y: vy - f * (great.y0 + great.rose.cy) / Zb, R };
    }
    G0.motes = Array.from({ length: isBoot ? 190 : 130 }, (_, n) => ({
      x: (hash(n, 1, 5) * 2 - 1) * X0, y: -Yf + hash(n, 2, 5) * (Ys + Yf), z: 0.45 + hash(n, 3, 5) * (Zb - 0.5),
      p: hash(n, 4, 5) * TAU, s: 0.4 + hash(n, 5, 5),
    }));
    G0.fx = S.fx.map(o => ({ ...o, inst: createFx(o.mod, { x: Math.round(o.x), y: Math.round(o.y), seed: o.seed }) }));
    return G0;
  }

  // 벽 장식: 1 밝은 몰딩, 2 기둥·아치 테, 3 오목한 그늘, 4 깊은 홈
  function decor(S, u, Y, pu, pv) {
    for (const yc of S.courses || []) {
      const d = (Y - yc) / pv;
      if (d > -1 && d < 1.2) return 1;
      if (d >= -2.6 && d <= -1) return 3;
    }
    const A = S.arcade;
    if (A && Y > A.y0 && Y < A.y1) {
      const lx = ((u % A.w) + A.w * 1.5) % A.w - A.w / 2, ly = Y - A.y0;
      const aw = A.w * 0.72, hs = (A.y1 - A.y0) * 0.5, r = aw * 0.85;
      if (pointed(lx, ly, aw, hs, r)) {
        if (!pointed(lx, ly - pv * 1.4, aw - pu * 2.8, hs - pv * 1.4, r - pu * 1.4)) return 2;
        return (ly / pv < 2) ? 4 : 3;
      }
      if (Math.abs(Math.abs(lx) - A.w / 2) < pu * 1.2 || Math.abs(lx) > A.w / 2 - pu * 0.2) return 2;
      if ((A.y1 - Y) / pv < 1.5) return 1;
    }
    return 0;
  }

  // 돌 블록 무늬 (음수면 줄눈)
  function stoneK(u, v, pu, pv, type) {
    const bh = 0.07, bw = type === 4 ? 0.15 : 0.13;
    const row = Math.floor(v / bh), off = (row & 1) * bw * 0.5;
    const col = Math.floor((u + off) / bw);
    const fu = (u + off) / bw - col, fv = v / bh - row;
    if (fv < pv / bh * 0.9 || fu < pu / bw * 0.9) return -1;
    let k = 0.8 + 0.32 * hash(col, row, type);
    if (fv > 1 - pv / bh * 1.2) k *= 1.12;
    k *= 0.92 + 0.14 * hash(Math.floor(u / pu), Math.floor(v / pv), 7);
    return k;
  }

  // 창 하나의 빛줄기(공기 중)와 바닥·벽에 맺히는 색 그림자를 미리 계산한다
  function bakeShaft(G0, win) {
    const { S, W, H, depth, surf } = G0;
    const { f, cx, vy, X0, Yf, Zb } = S;
    const Ld = win.Ld;
    // 창 평면으로 되짚어 가기
    const plane = win.plane;
    const back = (Q0, Q1, Q2) => {
      let s;
      if (plane === 'back') s = (Zb - Q2) / -Ld[2];
      else if (plane === 'L') s = (Q0 + X0) / Ld[0];
      else s = (Q0 - X0) / Ld[0];
      return s;
    };
    const pu0 = plane === 'back' ? Zb / f : win.c / f, pv0 = pu0;
    const strand = u => 0.62 + 0.38 * Math.sin(u * 61 + win.c * 9) * Math.sin(u * 23 - 1.3);
    const len = Math.max(0.6, (Yf + win.y0 + (win.top || 0.4)) / -Ld[1]);
    // 화면 범위
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    const corners = [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1], [0, 1]];
    for (const [a, bb] of corners) {
      const wl = win.type === 'rose' ? win.rose.R * 2 : win.w;
      const u = win.c + a * wl, yy = win.y0 + bb * (win.top || win.rose.R * 2);
      const P = plane === 'back' ? [u, yy, Zb] : [plane === 'L' ? -X0 : X0, yy, u];
      for (let s = 0; s <= len * 1.05; s += len / 6) {
        const Q = [P[0] + Ld[0] * s, P[1] + Ld[1] * s, Math.max(0.3, P[2] + Ld[2] * s)];
        if (Q[1] < -Yf - 0.02) break;
        const sx = cx + f * Q[0] / Q[2], sy = vy - f * Q[1] / Q[2];
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    }
    x0 = clamp(Math.floor(x0) - 2, 0, W - 1); x1 = clamp(Math.ceil(x1) + 2, 0, W - 1);
    y0 = clamp(Math.floor(y0) - 2, 0, H - 1); y1 = clamp(Math.ceil(y1) + 2, 0, H - 1);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const acc = new Float32Array(bw * bh * 8);
    const M = 14;
    // 공기 중 빛줄기: 2×2 묶음으로 시선을 따라 걸으며 창을 통과한 빛을 모은다
    for (let by = y0; by <= y1; by += 2) for (let bx = x0; bx <= x1; bx += 2) {
      const i = by * W + bx;
      const dx = (bx + 1 - cx) / f, dy = (vy - by - 1) / f;
      let tmax = depth[i];
      if (bx + 1 < W) tmax = Math.min(tmax, depth[i + 1]);
      if (by + 1 < H) tmax = Math.min(tmax, depth[i + W]);
      const z0 = 0.35, dz = (tmax - z0) / M;
      if (dz <= 0) continue;
      const loc = new Float32Array(8);
      let any = false;
      for (let m = 0; m < M; m++) {
        const z = z0 + (m + 0.5) * dz;
        const Q0 = dx * z, Q1 = dy * z;
        const s = back(Q0, Q1, z);
        if (s < 0.02) continue;
        const P0 = Q0 - s * Ld[0], P1 = Q1 - s * Ld[1], P2 = z - s * Ld[2];
        const u = plane === 'back' ? P0 : P2;
        if (plane !== 'back' && (P2 < 0.3 || P2 > Zb)) continue;
        let c = sampleWin(win, u - win.c, P1 - win.y0, pu0, pv0);
        if (c <= 0) continue;
        if (c === LEAD) c = 2;
        const fall = clamp(1.15 - s / (len * 1.15));
        loc[c] += dz * fall * strand(u);
        any = true;
      }
      if (!any) continue;
      for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
        const px = bx + ox, py = by + oy;
        if (px > x1 || py > y1) continue;
        const j = ((py - y0) * bw + (px - x0)) * 8;
        for (let c = 1; c < 8; c++) acc[j + c] += loc[c] * (isBoot ? 2.0 : 3.2);
      }
    }
    // 표면에 맺히는 색 그림자 (창살 무늬가 그대로 비친다)
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const i = py * W + px, st = surf[i];
      if (!st) continue;
      let facing = st === 1 ? -Ld[1] : st === 2 ? -Ld[0] : st === 3 ? Ld[0] : st === 4 ? 0 : 0.45;
      if (facing <= 0.05) continue;
      const z = depth[i], Q0 = (px + 0.5 - cx) / f * z, Q1 = (vy - py - 0.5) / f * z;
      const s = back(Q0, Q1, z);
      if (s < 0.06) continue;
      const P0 = Q0 - s * Ld[0], P1 = Q1 - s * Ld[1], P2 = z - s * Ld[2];
      const u = plane === 'back' ? P0 : P2;
      const c = sampleWin(win, u - win.c, P1 - win.y0, pu0 * 1.4, pv0 * 1.4);
      if (c <= 0 || c === LEAD) continue;
      acc[((py - y0) * bw + (px - x0)) * 8 + c] += 0.95 * facing * clamp(1.25 - s / (len * 1.3));
    }
    // 희소 배열로 정리
    const idx = [], cls = [], wgt = [];
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const j = ((py - y0) * bw + (px - x0)) * 8;
      for (let c = 1; c < 8; c++) if (acc[j + c] > 0.01) { idx.push(py * W + px); cls.push(c); wgt.push(acc[j + c]); }
    }
    return { idx: Int32Array.from(idx), cls: Uint8Array.from(cls), wgt: Float32Array.from(wgt) };
  }

  // ---------- 행성 ----------
  function rotation(t) {
    const spin = t * 0.00021, tilt = 30 * Math.PI / 180, wob = 0.55 * Math.sin(spin * 0.37 + 1);
    const cy = Math.cos(spin), sy = Math.sin(spin), cz = Math.cos(tilt), sz = Math.sin(tilt), cw = Math.cos(wob), sw = Math.sin(wob);
    // R = Rz(tilt) * Rx(wob) * Ry(spin)
    const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    const Rx = [1, 0, 0, 0, cw, -sw, 0, sw, cw];
    const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
    return mul(Rz, mul(Rx, Ry));
  }
  function mul(a, b) {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  }

  function drawPlanet(G0, t, out) {
    const P = G0.planet;
    if (!P) return;
    const R = rot, s = P.R / 1.62; // 정육면체가 원창 안에 들어가고 둘레로 우주가 조금 보이게
    const Lv = norm3([-0.35, 0.5, -0.8]);
    const T = 64;
    for (let n = 0; n < G0.ci.length; n++) {
      const i = G0.ci[n], sx = i % G0.W, sy = (i / G0.W) | 0;
      // 우주 바탕
      const ny = (sy - P.y) / P.R, nx = (sx - P.x) / P.R;
      let r = 8 + 10 * clamp(1 - Math.hypot(nx + 0.3, ny + 0.2)), g = 6 + 6 * clamp(1 - Math.hypot(nx - 0.4, ny)), b = 20 + 22 * clamp(1 - Math.hypot(nx, ny + 0.4));
      const st = G0.stars[n];
      if (st) { const tw = 0.6 + 0.4 * Math.sin(t * 0.003 + i); r += 200 * st * tw; g += 200 * st * tw; b += 220 * st * tw; }
      // 정육면체: 직교 투영 광선을 행성 좌표로 돌려 상자와 교차
      const ox = (sx + 0.5 - P.x) / s, oy = -(sy + 0.5 - P.y) / s;
      // 행성 좌표 = R^T * (ox, oy, -4), 방향 = R^T * (0,0,1)
      const o0 = R[0] * ox + R[3] * oy - R[6] * 4, o1 = R[1] * ox + R[4] * oy - R[7] * 4, o2 = R[2] * ox + R[5] * oy - R[8] * 4;
      const d0 = R[6], d1 = R[7], d2 = R[8];
      let tmin = -1e9, tmax = 1e9, ax = -1;
      const O = [o0, o1, o2], D = [d0, d1, d2];
      let hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(D[k]) < 1e-9) { if (Math.abs(O[k]) > 1) { hit = false; break; } continue; }
        let ta = (-1 - O[k]) / D[k], tb = (1 - O[k]) / D[k];
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > tmin) { tmin = ta; ax = k; }
        if (tb < tmax) tmax = tb;
      }
      if (hit && tmin <= tmax && ax >= 0) {
        const p = [O[0] + D[0] * tmin, O[1] + D[1] * tmin, O[2] + D[2] * tmin];
        const sgn = p[ax] > 0 ? 1 : -1, face = ax * 2 + (sgn > 0 ? 0 : 1);
        let u = p[(ax + 1) % 3], v = p[(ax + 2) % 3];
        // 면마다 방향을 돌려 같은 지표가 다르게 보이게
        for (let q = 0; q < face % 4; q++) { const w = u; u = -v; v = w; }
        const tu = clamp(Math.floor((u + 1) / 2 * T), 0, T - 1), tv = clamp(Math.floor((1 - (v + 1) / 2) * T), 0, T - 1);
        const ti = (tv * T + tu) * 3;
        let cr = tex[ti], cg = tex[ti + 1], cb = tex[ti + 2];
        const hue = FACE_HUE[face];
        cr *= 0.55 + 0.6 * hue[0]; cg *= 0.55 + 0.6 * hue[1]; cb *= 0.55 + 0.6 * hue[2];
        // 체스판 칸
        const cu = Math.floor((u + 1) * 10), cv = Math.floor((v + 1) * 10);
        if ((cu + cv) & 1) { cr *= 0.88; cg *= 0.88; cb *= 0.88; }
        // 면 법선(화면 좌표)
        const n0 = R[ax] * sgn, n1 = R[3 + ax] * sgn, n2 = R[6 + ax] * sgn;
        const lam = Math.max(0, n0 * Lv[0] + n1 * Lv[1] + n2 * Lv[2]);
        let k = 0.42 + 0.95 * lam + BAYER[((sy & 3) << 2) | (sx & 3)] * 0.16;
        k = Math.round(k * 4) / 4;
        cr *= k; cg *= k; cb *= k;
        // 모서리: 성벽 같은 밝은 테
        const edge = Math.max(Math.abs(u), Math.abs(v));
        if (edge > 1 - 1.1 / s) { cr = 130 * k + 40; cg = 126 * k + 40; cb = 150 * k + 50; }
        else if (edge > 1 - 2.2 / s) { cr *= 0.7; cg *= 0.7; cb *= 0.78; }
        r = cr; g = cg; b = cb;
      }
      out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
    }
  }

  // ---------- 줄눈 네온 경로 ----------
  // 세로 줄눈을 한 단(0.07) 내려가고, 가로 줄눈에서 반 장(가끔 몇 장) 옆으로 옮겨 다음 세로 줄눈으로 내려간다.
  function spawnRunner(S, R, ts) {
    const h = k => hash(R.n, Math.floor(ts * 10), k);
    const wsel = h(1);
    R.wall = wsel < 0.4 ? 4 : wsel < 0.7 ? 2 : 3;
    const bh = 0.07, bw = R.wall === 4 ? 0.15 : 0.13;
    const lo = R.wall === 4 ? -S.X0 : 0.9, hi = R.wall === 4 ? S.X0 : S.Zb - 0.05;
    let row = Math.floor((0.25 + h(2) * (S.Ys - 0.3)) / bh);
    const off = r => (r & 1) * bw * 0.5;
    let u = Math.round((lo + h(3) * (hi - lo) + off(row)) / bw) * bw - off(row);
    const pts = [[u, (row + 1) * bh]];
    let k = 4;
    while (row * bh > -S.Yf + 0.02) {
      pts.push([u, row * bh]);
      // 옆으로: 반 장 + 가끔 몇 장 더
      let dir = hash(R.n, k++, Math.floor(ts)) < 0.5 ? -1 : 1;
      if (u + dir * bw < lo) dir = 1; else if (u + dir * bw > hi) dir = -1;
      const extra = hash(R.n, k++, 7) < 0.25 ? 1 + Math.floor(hash(R.n, k++, 8) * 2) : 0;
      u += dir * (bw * 0.5 + extra * bw);
      pts.push([u, row * bh]);
      row--;
    }
    // 누적 거리
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]));
    R.path = pts; R.acc = acc; R.len = acc[acc.length - 1];
    R.t0 = ts; R.v = 0.16 + h(5) * 0.1; R.trail = 0.3 + h(6) * 0.14;
    R.col = Math.floor(h(7) * 3);
  }
  function pathAt(R, d) {
    const P = R.path, A = R.acc;
    let i = 1;
    while (i < A.length - 1 && A[i] < d) i++;
    const seg = A[i] - A[i - 1] || 1, f = (d - A[i - 1]) / seg;
    return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f];
  }
  function wallToScreen(S, wall, u, Y) {
    const { f, cx, vy, X0, Zb } = S;
    if (wall === 4) return [Math.floor(cx + f * u / Zb), Math.floor(vy - f * Y / Zb)];
    if (u < 0.3) return null;
    return [Math.floor(cx + (wall === 2 ? -1 : 1) * f * X0 / u), Math.floor(vy - f * Y / u)];
  }

  // ---------- 매 프레임 ----------
  function stateTargets(t) {
    const st = getState();
    let pal = PAL_SCAN, mix = 0, level = 0.32, blink = 1;
    if (st === 'approved') { pal = PAL_OK; mix = 1; level = 1.05; }
    else if (st === 'denied') { pal = PAL_NO; mix = 1; level = 1.1; blink = Math.floor(t / 275) % 2 ? 1 : 0.28; }
    else if (st === 'scanning') { pal = PAL_SCAN; mix = 0.4; level = 0.55 + 0.15 * Math.sin(t * 0.012); }
    return { st, pal, mix, level, blink };
  }

  function render(t) {
    const G0 = G;
    if (!G0) return;
    const { S, W, H, N, base, kind, Lr, Lg, Lb, frame } = G0;
    const nw = S.wins.length;
    // 창마다 빛 세기·색
    const wl = [];
    let hall = null;
    if (isBoot) {
      rot = rotation(t);
      const Nf = FACE_N.map(n => [rot[0] * n[0] + rot[1] * n[1] + rot[2] * n[2], rot[3] * n[0] + rot[4] * n[1] + rot[5] * n[2], rot[6] * n[0] + rot[7] * n[1] + rot[8] * n[2]]);
      for (let w = 0; w < nw; w++) {
        const D = S.wins[w].D;
        let sum = 0; const tint = [0, 0, 0];
        for (let q = 0; q < 6; q++) {
          // 화면 좌표에서 카메라 쪽은 -z
          const d = Math.max(0, Nf[q][0] * D[0] + Nf[q][1] * D[1] + Nf[q][2] * D[2]);
          const wq = d ** 4;
          sum += wq; tint[0] += wq * FACE_HUE[q][0]; tint[1] += wq * FACE_HUE[q][1]; tint[2] += wq * FACE_HUE[q][2];
        }
        for (let c = 0; c < 3; c++) tint[c] /= sum || 1;
        const I = 0.22 + 1.25 * clamp((sum - 1 / 3) * 1.5);
        const breathe = 0.9 + 0.1 * Math.sin(t * 0.0011 + w * 1.7);
        wl.push({ I: I * breathe, tint, pal: PAL_BOOT });
      }
    } else {
      hall = stateTargets(t);
      const k = 0.08;
      live.mix += (hall.mix - live.mix) * k * 2;
      live.level += (hall.level - live.level) * k * 2;
      for (let c = 1; c < 8; c++) for (let q = 0; q < 3; q++) live.pal[c][q] += (hall.pal[c][q] - live.pal[c][q]) * k * 2.5;
      for (let w = 0; w < nw; w++) wl.push({ I: live.level * hall.blink, tint: [1, 1, 1], pal: live.pal });
    }

    // 빛줄기 누적
    Lr.fill(0); Lg.fill(0); Lb.fill(0);
    const cr = new Float32Array(8), cg = new Float32Array(8), cb = new Float32Array(8);
    for (let w = 0; w < nw; w++) {
      const L = wl[w], sh = G0.shafts[w];
      const kk = (isBoot ? 0.62 : 0.7) * L.I;
      for (let c = 1; c < 8; c++) {
        let p = L.pal[c];
        if (!isBoot) {
          // 평소엔 하늘빛(차가운 흰빛), 판정이 나면 유리 색
          const sky = [150, 190, 230];
          p = [sky[0] + (p[0] - sky[0]) * live.mix, sky[1] + (p[1] - sky[1]) * live.mix, sky[2] + (p[2] - sky[2]) * live.mix];
        }
        const sat = isBoot ? 0.65 : 0.85;
        cr[c] = (p[0] / 255 * sat + 1 - sat) * L.tint[0] * kk;
        cg[c] = (p[1] / 255 * sat + 1 - sat) * L.tint[1] * kk;
        cb[c] = (p[2] / 255 * sat + 1 - sat) * L.tint[2] * kk;
      }
      const { idx, cls, wgt } = sh;
      for (let j = 0; j < idx.length; j++) {
        const i = idx[j], c = cls[j], v = wgt[j];
        Lr[i] += cr[c] * v; Lg[i] += cg[c] * v; Lb[i] += cb[c] * v;
      }
    }

    // 합성
    const C = frame.color;
    frame.light.fill(0);
    const out = base; // 읽기 전용
    for (let i = 0; i < N; i++) {
      const k = kind[i];
      let r = out[i * 3], g = out[i * 3 + 1], b = out[i * 3 + 2];
      if (k !== K_GLASS && k !== K_CLEAR) {
        const lr = Lr[i], lg = Lg[i], lb = Lb[i];
        const e = lr > lg ? (lr > lb ? lr : lb) : (lg > lb ? lg : lb);
        if (e > 0.05) {
          const sx = i % W, sy = (i / W) | 0;
          // 빛을 몇 단계로 끊어 도트 빛줄기처럼 만든다 (경계에서만 디더)
          const ed = e + BAYER[((sy & 3) << 2) | (sx & 3)] * 0.05;
          const q = ed < 0.12 ? 0 : ed < 0.26 ? 0.16 : ed < 0.45 ? 0.32 : ed < 0.7 ? 0.52 : ed < 1 ? 0.78 : 1.05;
          const m = q / e;
          r += lr * m * (95 + r * 1.3); g += lg * m * (95 + g * 1.3); b += lb * m * (95 + b * 1.3);
        }
      }
      C[i] = pk(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b);
    }
    // 벽돌 줄눈을 따라 사다리 타듯 위에서 아래로 내려오는 네온 (로딩 화면)
    if (isBoot && G0.mor.length) {
      const pp = painterFor(frame), ts = t / 1000;
      const mask = G0.morMask || (G0.morMask = (() => { const m = new Uint8Array(N); for (let n = 0; n < G0.mor.length; n += 4) m[G0.mor[n]] = 1; return m; })());
      const runners = G0.runners || (G0.runners = Array.from({ length: 52 }, (_, n) => ({ n, next: n * 0.15, path: null })));
      for (const R of runners) {
        if (!R.path) {
          if (ts < R.next) continue;
          // 기둥·창에 가려 안 보이는 경로는 버리고 다시 뽑는다
          for (let tries = 0; tries < 10; tries++) {
            spawnRunner(S, R, ts + tries * 0.37);
            let vis = 0;
            for (let q = 0; q < 12; q++) {
              const pq = pathAt(R, R.len * q / 11), sq = wallToScreen(S, R.wall, pq[0], pq[1]);
              if (sq && sq[0] >= 0 && sq[1] >= 0 && sq[0] < W && sq[1] < H && mask[sq[1] * W + sq[0]]) vis++;
            }
            if (vis >= 6) break;
          }
          R.t0 = ts;
        }
        const head = (ts - R.t0) * R.v;
        if (head - R.trail > R.len) { R.path = null; R.next = ts + 0.2 + hash(R.n, Math.floor(ts), 95) * 1.2; continue; }
        const nc = NEON[R.col];
        let hp = null;
        for (let d = 0; d <= R.trail; d += 0.0028) {
          const sd = head - d;
          if (sd < 0 || sd > R.len) continue;
          const q = pathAt(R, sd), sp = wallToScreen(S, R.wall, q[0], q[1]);
          if (!sp) continue;
          const sx = sp[0], sy = sp[1];
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const i = sy * W + sx;
          if (!mask[i]) continue;
          const k = 1 - d / R.trail, hot = d < 0.006;
          const c = C[i], br = c & 255, bg = (c >>> 8) & 255, bb = (c >>> 16) & 255;
          const a = 0.2 + 0.75 * k * k;
          C[i] = pk(hot ? 235 : br + (nc[0] - br) * a, hot ? 250 : bg + (nc[1] - bg) * a, hot ? 255 : bb + (nc[2] - bb) * a);
          pp.add(sx, sy, pk(nc[0], nc[1], nc[2]), 0.2 * k);
          if (!hp) hp = [sx, sy];
        }
        if (hp) pp.glow(hp[0] + 0.5, hp[1] + 0.5, 5, pk(nc[0], nc[1], nc[2]), 0.32);
      }
    }
    // 유리
    const { gi, gw, gc, gt, gv } = G0;
    for (let n = 0; n < gi.length; n++) {
      const i = gi[n], w = gw[n], c = gc[n], L = wl[w];
      const p = L.pal[c];
      let r, g, b;
      if (isBoot) {
        const lv = (0.2 + 0.88 * L.I) * gt[n];
        r = p[0] * lv * (0.45 + 0.7 * L.tint[0]); g = p[1] * lv * (0.45 + 0.7 * L.tint[1]); b = p[2] * lv * (0.45 + 0.7 * L.tint[2]);
      } else {
        const sx = i % W, sy = (i / W) | 0, y = gv[n];
        // 하늘인 척: 위는 짙은 남색, 아래는 청록 지평
        let skr = 12 + 16 * (1 - y), skg = 16 + 52 * (1 - y) ** 2, skb = 44 + 46 * (1 - y);
        if (hash(sx, sy, 41) > 0.985) { skr = 200; skg = 210; skb = 230; }
        let m = live.mix;
        if (hall.st === 'scanning') {
          const band = Math.abs(((t * 0.0007) % 1) - y);
          if (band < 0.08) m = Math.max(m, 0.9 - band * 8);
        }
        const lv = (0.25 + 0.85 * L.I) * gt[n];
        r = skr + (p[0] * lv - skr) * m; g = skg + (p[1] * lv - skg) * m; b = skb + (p[2] * lv - skb) * m;
      }
      C[i] = pk(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255));
    }
    // 원창 너머 행성
    if (isBoot && G0.ci.length) {
      const tmp = G0.tmp || (G0.tmp = new Float32Array(N * 3));
      drawPlanet(G0, t, tmp);
      for (const i of G0.ci) C[i] = pk(clamp(tmp[i * 3], 0, 255), clamp(tmp[i * 3 + 1], 0, 255), clamp(tmp[i * 3 + 2], 0, 255));
    }

    const p = painterFor(frame);
    // 창 둘레 돌에 번지는 빛
    for (let w = 0; w < nw; w++) {
      const L = wl[w], ws = G0.winScreen[w], pc = L.pal[isBoot ? 3 : 2];
      const tint = L.tint, mx = isBoot ? 1 : live.mix;
      const col = pk((pc[0] * mx + 150 * (1 - mx)) * tint[0], (pc[1] * mx + 190 * (1 - mx)) * tint[1], (pc[2] * mx + 230 * (1 - mx)) * tint[2]);
      p.glow(ws.x, ws.y, ws.r * 1.2, col, 0.07 * L.I);
    }
    if (isBoot && G0.planet) {
      const P = G0.planet, tt = wl[0].tint;
      p.glow(P.x, P.y, P.R * 1.6, pk(255 * tt[0], 255 * tt[1], 255 * tt[2]), 0.16);
    }
    // 먼지: 빛줄기를 지날 때만 반짝인다
    const { f, cx, vy } = S;
    for (const m of G0.motes) {
      const x = m.x + Math.sin(t * 0.00023 * m.s + m.p) * 0.08, y = m.y + Math.sin(t * 0.00017 * m.s + m.p * 2) * 0.05 + ((t * 0.00001 * m.s) % 0.3) - 0.15, z = m.z;
      const sx = Math.floor(cx + f * x / z), sy = Math.floor(vy - f * y / z);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const i = sy * W + sx;
      if (G0.depth[i] < z || kind[i] === K_GLASS) continue;
      const e = Math.max(Lr[i], Lg[i], Lb[i]);
      if (e < 0.1) continue;
      const kk = Math.min(1, e * 1.6);
      const r = 150 + 105 * kk, cr2 = Lr[i] / e, cg2 = Lg[i] / e, cb2 = Lb[i] / e;
      C[i] = pk(Math.min(255, r * (0.55 + 0.45 * cr2)), Math.min(255, r * (0.55 + 0.45 * cg2)), Math.min(255, r * (0.55 + 0.45 * cb2)));
      if (z < 1.1 && sx + 1 < W) C[i + 1] = C[i];
      p.glow(sx + 0.5, sy + 0.5, 3, C[i], 0.3 * kk);
    }
    // 작은 촛불들
    for (let n = 0; n < S.flames.length; n++) {
      const fl = S.flames[n];
      const sx = Math.floor(cx + f * fl.x / fl.z), sy = Math.floor(vy - f * fl.y / fl.z);
      if (sx < 1 || sy < 3 || sx >= W - 1 || sy >= H - 1) continue;
      const stickPx = Math.max(1, Math.round(f * fl.stick / fl.z));
      for (let q = 1; q <= stickPx; q++) if (sy + q < H) C[(sy + q) * W + sx] = pk(214, 204, 180);
      const fl2 = Math.sin(t * 0.013 + n * 2.3) + Math.sin(t * 0.031 + n);
      C[sy * W + sx] = pk(255, 236, 170);
      C[(sy - 1) * W + sx] = fl2 > -0.6 ? pk(255, 170, 60) : pk(255, 236, 170);
      if (fl2 > 0.9) C[(sy - 2) * W + sx] = pk(240, 110, 40);
      p.glow(sx + 0.5, sy, 7 + fl2, pk(255, 170, 80), 0.22);
    }
    // 큰 촛대 / 횃불 (pixelfx)
    const dt = Math.min(0.1, (t - (render.last || t)) / 1000);
    render.last = t;
    for (const o of G0.fx) {
      if (o.stand) {
        // 쇠 촛대 기둥
        const x = Math.round(o.x), y0 = Math.round(o.y) + 4;
        for (let y = y0; y < H; y++) {
          const cap = (y - y0) % 26 < 2;
          for (let dx = -1; dx <= 1; dx++) C[y * W + x + dx] = pk(cap ? 70 : dx < 0 ? 46 : 22, cap ? 64 : dx < 0 ? 40 : 20, cap ? 58 : dx < 0 ? 40 : 26);
          if (cap) { C[y * W + x - 2] = pk(40, 36, 36); C[y * W + x + 2] = pk(30, 26, 28); }
        }
        for (let dx = -4; dx <= 4; dx++) C[(y0 - 1) * W + x + dx] = pk(120, 92, 40);
      }
      if (!isBoot && o.mod === torchFx) {
        // 판정에 따라 횃불 불꽃 색이 바뀐다: 평소 주황, 승인 초록, 거절 빨강
        const target = hall.st === 'approved' ? TORCH_OK : hall.st === 'denied' ? TORCH_NO : TORCH_FIRE;
        if (o === G0.fx[0]) for (let q = 0; q < 9; q++) for (let c = 0; c < 3; c++) live.torch[q][c] += (target[q][c] - live.torch[q][c]) * 0.15;
        o.inst.options.palette = live.torch.map(toHex);
      }
      o.inst.update(dt);
      o.inst.draw(frame);
    }
    composite(frame, G0.img.data, null);
    ctx.putImageData(G0.img, 0, 0);
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    render(now - t0);
  }

  function resize() {
    G = build();
    canvas.width = G.W; canvas.height = G.H;
    canvas.style.width = G.W * G.S.scale + 'px';
    canvas.style.height = G.H * G.S.scale + 'px';
  }
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (running) resize(); else G = null; }, 180); };
  addEventListener('resize', onResize);

  // 월드 지표를 64×64로 줄여 정육면체 면 텍스처로 쓴다
  function setTexture(src, oy = 0, size = src.width) {
    let cur = document.createElement('canvas');
    cur.width = cur.height = size;
    cur.getContext('2d').drawImage(src, 0, oy, size, size, 0, 0, size, size);
    while (cur.width > 64) {
      const n = document.createElement('canvas');
      n.width = n.height = Math.max(64, cur.width >> 1);
      const x = n.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    const d = cur.getContext('2d').getImageData(0, 0, 64, 64).data, out = new Uint8ClampedArray(64 * 64 * 3);
    for (let i = 0; i < 64 * 64; i++) { out[i * 3] = d[i * 4] * 1.25; out[i * 3 + 1] = d[i * 4 + 1] * 1.25; out[i * 3 + 2] = d[i * 4 + 2] * 1.25; }
    tex = out;
  }

  function start() {
    if (running) return;
    running = true;
    if (!G || G.W !== Math.ceil(innerWidth / G.S.scale)) resize();
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  start();
  return { setTexture, start, stop, planetAt: () => G && G.planet && { x: G.planet.x * G.S.scale, y: G.planet.y * G.S.scale, r: G.planet.R * G.S.scale } };
}
