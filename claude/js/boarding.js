// 승급소 탑승장 (아트만). 하늘이 트인 체스판 갑판 끝에 고딕 첨탑 로켓이 서 있고,
// 앞에는 레이저 관문과 그 양옆을 지키는 나이트 둘. 판정 로직은 boarding-gate.js 에 따로 있고 여기서는 쓰지 않는다.
// 사용 예:
//   import { createBoarding } from './boarding.js';
//   const scene = createBoarding(canvas, { theme: 'white', zoom: 2, getState: () => 'idle' });
//   // getState(): 'idle' | 'checking' | 'granted' | 'denied'  — 관문·눈빛·유도등 색만 바뀐다
//   scene.setTheme('black'); scene.destroy();
// 쓰는 pixelfx: weather/shooting-stars(하늘), weather/fog(갑판 안개), scifi/laser-grid(관문), scifi/teleporter-pad(통과 빛기둥)
// 그림 문법은 Lemo-Opuscar 의 pixel-rpg·hd-2d 스타일에서 빌렸다: 4×4 Bayer 디더 단계, 정수 픽셀, 큰 차가운 바탕 + 작고 따뜻한(여기선 하늘빛) 실광원, 숨쉬는 불빛.
import { createFrame, clearFrame, createFx, composite, painterFor, hex } from './vendor/pixelfx/core/index.js';
import * as starsFx from './vendor/pixelfx/fx/weather/shooting-stars.js';
import * as fogFx from './vendor/pixelfx/fx/weather/fog.js';
import * as gateFx from './vendor/pixelfx/fx/scifi/laser-grid.js';
import * as padFx from './vendor/pixelfx/fx/scifi/teleporter-pad.js';
import { hash, fbm } from './noise.js';

export const W = 480, H = 270;
const HOR = 126, F = 200, WD = 1.55, Z_END = 7.2, CX = 240;   // 지평선, 초점거리, 갑판 반폭, 갑판 끝 깊이
// 관문: 지나가는 말 키보다 크게. 기둥 ±70, 높이 147 (원래 효과의 1.45배·2.3배)
const GATE_Y = 262, GATE_KX = 1.45, GATE_KY = 2.3, GATE_PX = Math.round(48 * GATE_KX), GATE_TOP = GATE_Y + Math.round(-64 * GATE_KY);
// 관문 두께: 앞판에서 0.32만큼 안쪽(깊이)으로 들어간 뒤판. 소실점(CX, HOR) 쪽으로 KB배 줄어든다
const GATE_Z = F / (GATE_Y - HOR), GATE_KB = GATE_Z / (GATE_Z + 0.32);
const GBY = Math.round(HOR + (GATE_Y - HOR) * GATE_KB), GB_PX = Math.round(48 * GATE_KX * GATE_KB), GB_TOP = GBY + Math.round(-64 * GATE_KY * GATE_KB);
const KNIGHT = new URL('../assets/sprites/knight/full/', import.meta.url);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y, k) => k * 16 > BAYER[(y & 3) * 4 + (x & 3)];
const rgb = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const mixc = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// 상태별 빛 색 (관문 레이저 램프, 유도등)
const STATE = {
  idle: { laser: ['#04121a', '#08283a', '#0e4a66', '#1a86b0', '#3cc8f0', '#9ae8ff', '#e0f8ff', '#ffffff'], run: '#5ad8ff', speed: 0.5 },
  checking: { laser: ['#1a1004', '#3a2408', '#6a400c', '#b87414', '#f0aa30', '#ffd27a', '#fff0cc', '#ffffff'], run: '#ffc04a', speed: 1.4 },
  granted: { laser: ['#04180c', '#08321a', '#0e5a2e', '#1a9a50', '#3ce07a', '#9affb8', '#e0ffe8', '#ffffff'], run: '#5aff98', speed: 2.6 },
  denied: { laser: ['#1a0408', '#4a0a12', '#8a1020', '#d01c2a', '#ff4a4a', '#ff9a90', '#ffe4e0', '#ffffff'], run: '#ff5a5a', speed: 0.9 },
};
const STONE_METAL = ['#0c0b12', '#1e1c28', '#34303f', '#4e495c', '#6e6880', '#9a94aa'];

// 테마별 돌·로켓 색
const THEME = {
  white: {
    rocket: ['#f4f0e4', '#dcd5c3', '#b9b19e', '#8e8776', '#625c50', '#3c3832'],
    sqL: '#575170', sqD: '#2d2a3c', rail: ['#8a84a0', '#5e5874', '#3a364c'],
  },
  black: {
    rocket: ['#a8a8c0', '#7c7c94', '#5c5c72', '#44445a', '#2e2e40', '#1c1c28'],
    sqL: '#4a4660', sqD: '#211f2c', rail: ['#6e6a86', '#4a4660', '#2c293c'],
  },
};
const INK = [18, 16, 26];

// 깊이 z, 가로 wx(월드) → 화면 좌표
const sx = (wx, z) => CX + wx * F / z;
const sy = (z, up = 0) => HOR + (F - up * F) / z;   // up: 바닥에서 위로 올린 높이(월드)
const POSTS = []; for (let z = 1.6; z <= Z_END + 0.01; z += 0.7) POSTS.push(z);
const RUN = []; for (let z = 1.9; z <= Z_END - 0.2; z += 0.42) RUN.push(z);

export function createBoarding(canvas, { theme = 'white', zoom = 2, getState = () => 'idle', isActive = () => true } = {}) {
  const getZoom = typeof zoom === 'function' ? zoom : () => zoom;
  const low = canvasOf(W, H), lc = low.getContext('2d');
  const over = canvasOf(W, H), oc = over.getContext('2d');
  const back = createFrame(W, H), front = createFrame(W, H);
  const imgB = new ImageData(W, H), imgF = new ImageData(W, H);
  let bg = null, ctx = null, Z = 0, raf = 0, last = 0, clock = 0, state = 'idle';
  let knight = null;            // { data, parts: {name: canvas} }
  const fx = {
    stars: createFx(starsFx, { x: CX, y: 150, seed: 9 }),
    fogL: createFx(fogFx, { x: 160, y: 214, seed: 5, palette: ['#0a0a14', '#14142a', '#1e1e3c', '#2c2c52', '#3e3e6a', '#585886', '#7e7eaa', '#b4b4d8'], light: 0.6 }),
    fogR: createFx(fogFx, { x: 480, y: 214, seed: 5, palette: ['#0a0a14', '#14142a', '#1e1e3c', '#2c2c52', '#3e3e6a', '#585886', '#7e7eaa', '#b4b4d8'], light: 0.6 }),
    gate: null, pad: null,
  };
  function makeStateFx(st) {
    const S = STATE[st] || STATE.idle;
    fx.gate = createFx(gateFx, { x: CX, y: GATE_Y, seed: 31, palette: S.laser, metal: STONE_METAL, open: st === 'granted', light: 0.8, kx: GATE_KX, ky: GATE_KY });
    fx.gateBack = createFx(gateFx, { x: CX, y: GBY, seed: 47, palette: S.laser, metal: STONE_METAL, open: st === 'granted', light: 0.45, kx: GATE_KX * GATE_KB, ky: GATE_KY * GATE_KB });
    fx.pad = st === 'granted' ? createFx(padFx, { x: CX, y: 206, seed: 26, palette: STATE.granted.laser, metal: STONE_METAL }) : null;
  }
  makeStateFx('idle');

  // ---------------- 정적 배경 굽기 ----------------
  function bake() {
    const T = THEME[theme];
    const buf = new Uint32Array(W * H);
    const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c[0] | (c[1] << 8) | (c[2] << 16) | 0xff000000; };
    const get = (x, y) => { const v = buf[y * W + x]; return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; };

    // 하늘: 위는 깊은 남색, 지평선 쪽으로 보랏빛 — 단계는 Bayer 로만 잇는다
    const SKY = ['#06050d', '#0a0918', '#100e24', '#181532', '#221d42', '#2e2652', '#3c3160'].map(rgb);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = Math.pow(y / HOR, 1.5) * (SKY.length - 1), i = Math.min(SKY.length - 1, Math.floor(f));
      put(x, y, SKY[Math.min(SKY.length - 1, i + (dith(x, y, f - i) ? 1 : 0))]);
    }
    // 은하 띠(옅은 보랏빛 먼지) + 고정 별
    for (let y = 0; y < HOR; y++) for (let x = 0; x < W; x++) {
      const d = Math.abs((y - 40) - (x - 240) * 0.28) / 30;
      if (d < 1) {
        const n = fbm(x / 26, y / 14, 3, 3);
        const k = (1 - d) * (1 - d) * clamp((n - 0.35) * 2);
        if (dith(x, y, k * 0.55)) put(x, y, mixc(get(x, y), [92, 74, 128], 0.35));
      }
      const h = hash(x, y, 17);
      if (h < 0.0016) put(x, y, h < 0.0005 ? [236, 236, 255] : [150, 150, 196]);
    }
    // 고리 가스 행성(왼쪽 위): 위도 띠 + 소용돌이, 왼쪽 위에서 오는 빛, 디더 명암 경계, 대기 테두리,
    // 여러 겹의 고리(가운데 틈), 고리가 행성에 드리운 그림자, 행성이 고리 뒤쪽에 드리운 그림자
    const GX0 = 82, GY0 = 46, GR = 24, TILT = -0.32, FLAT = 0.3;
    const GP = ['#0e1a2a', '#16283c', '#1f3a50', '#2c5266', '#3f6e7a', '#5c8c88', '#86ac98', '#b8ccaa', '#e2e4c4'].map(rgb);
    const RINGS = [[30, 33, 0.55], [33.5, 38, 0.85], [39.5, 43, 0.7], [43, 45, 0.4]];   // [안, 밖, 밝기]
    const ringAt = (dx, dy) => {
      const u = dx * Math.cos(TILT) + dy * Math.sin(TILT), v = (-dx * Math.sin(TILT) + dy * Math.cos(TILT)) / FLAT;
      const r = Math.hypot(u, v);
      for (const [r0, r1, k] of RINGS) if (r >= r0 && r < r1) return { r, v, k, u };
      return null;
    };
    const LX = -0.62, LY = -0.5, LZ = 0.6;
    const onPlanet = (dx, dy) => dx * dx + dy * dy <= GR * GR;
    const planetShade = (dx, dy) => {
      const nz = Math.sqrt(Math.max(0, GR * GR - dx * dx - dy * dy)) / GR, nx = dx / GR, ny = dy / GR;
      return clamp(nx * LX + ny * LY + nz * LZ);
    };
    const ringPx = (x, y, dx, dy, R) => {
      // 행성 그림자: 빛 반대쪽 뒤로 떨어진다
      let k = R.k * (0.75 + 0.25 * Math.sin(R.r * 2.3));
      const sdx = dx + 6, sdy = dy + 5;
      if (R.v < 0 && onPlanet(sdx * 0.8, sdy * 0.8)) k *= 0.3;
      const lit = clamp(0.35 + 0.5 * (-R.u / 45) + 0.35);
      const f = clamp(k * lit) * 4;
      const C = [[38, 32, 52], [74, 62, 92], [120, 104, 136], [170, 152, 174], [214, 200, 206]];
      const i = Math.floor(f);
      put(x, y, C[Math.min(4, i + (dith(x, y, f - i) ? 1 : 0))]);
    };
    for (let y = -30; y <= 30; y++) for (let x = -50; x <= 50; x++) {
      const R = ringAt(x, y);
      if (R && R.v < 0 && !onPlanet(x, y)) ringPx(GX0 + x, GY0 + y, x, y, R);   // 고리 뒤쪽 절반
    }
    // 대기 번짐(행성 둘레 한 겹 옅은 빛, 빛 쪽만)
    for (let y = -GR - 2; y <= GR + 2; y++) for (let x = -GR - 2; x <= GR + 2; x++) {
      const d = Math.hypot(x, y);
      if (d > GR && d < GR + 2.2 && (x * LX + y * LY) / d > 0.1 && dith(x, y, (GR + 2.2 - d) / 2.2 * 0.7)) put(GX0 + x, GY0 + y, [84, 130, 140]);
    }
    for (let y = -GR; y <= GR; y++) for (let x = -GR; x <= GR; x++) {
      if (!onPlanet(x, y)) continue;
      const lat = y / GR, sh = planetShade(x, y);
      // 위도 띠: 소용돌이로 흔들리는 경계
      const wob = fbm((x + 40) / 9, y / 3.2, 31, 3) * 2.2 + Math.sin(x * 0.35 + y) * 0.15;
      const band = Math.sin(lat * 9.5 + wob) * 0.5 + 0.5;
      let base = 0.26 + band * 0.55 + (Math.abs(lat) > 0.75 ? -0.14 : 0) + (fbm(x / 4, y / 1.6, 33, 2) - 0.5) * 0.18;
      // 큰 폭풍 눈 하나
      const sx_ = x + 8, sy_ = y - 7, se = (sx_ * sx_) / 30 + (sy_ * sy_) / 6;
      if (se < 1) base += 0.18 * (1 - se) * (Math.sin(Math.atan2(sy_, sx_) * 2 + se * 6) * 0.5 + 0.5);
      let f = clamp(base * (0.15 + 1.05 * sh)) * (GP.length - 1);
      // 가장자리 어둡게
      const rim = Math.hypot(x, y) / GR;
      if (rim > 0.92) f -= (rim - 0.92) * 12 * (1 - sh);
      // 고리 그림자: 고리 앞쪽 바로 아래 띠
      const S2 = ringAt(x - 3, y - 6);
      if (S2 && S2.v > 0) f *= 0.45;
      f = clamp(f, 0, GP.length - 1);
      const i = Math.floor(f);
      let c = GP[Math.min(GP.length - 1, i + (dith(x, y, f - i) ? 1 : 0))];
      if (rim > 0.95 && sh > 0.45) c = mixc(c, [200, 236, 220], 0.45);   // 밝은 쪽 대기 테두리
      put(GX0 + x, GY0 + y, c);
    }
    for (let y = -30; y <= 30; y++) for (let x = -50; x <= 50; x++) {
      const R = ringAt(x, y);
      if (R && R.v >= 0) ringPx(GX0 + x, GY0 + y, x, y, R);   // 고리 앞쪽 절반
    }
    // 멀리 작은 얼음 행성(초승달처럼 한쪽만 밝다)
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
      if (x * x + y * y > 25.5) continue;
      const sh = clamp((-x * 0.7 - y * 0.4) / 5 + 0.25);
      const C = [[22, 28, 46], [44, 62, 92], [96, 132, 170], [180, 214, 236]];
      const f = sh * 3, i = Math.floor(f);
      put(186 + x, 22 + y, C[Math.min(3, i + (dith(x, y, f - i) ? 1 : 0))]);
    }

    // 저 멀리 떠 있는 승급소(작은 섬 + 첨탑 실루엣, 하늘빛 창)
    const SX0 = 404, SY0 = 60;
    for (let y = 0; y < 16; y++) {
      const hw = Math.round(17 * (1 - y / 16) ** 1.3 + (hash(y, 3, 2) * 2 | 0));
      for (let x = -hw; x <= hw; x++) put(SX0 + x, SY0 + y, y === 0 ? [88, 82, 112] : x > hw * 0.4 ? [26, 23, 38] : [40, 36, 56]);
    }
    const tower = (x0, top, w) => { for (let y = top; y < SY0; y++) for (let x = 0; x < w; x++) put(x0 + x, y, x === 0 ? [92, 86, 118] : [44, 40, 60]); for (let k = 0; k < 6; k++) for (let x = Math.floor(k / 2); x < w - Math.floor(k / 2); x++) put(x0 + x, top - 6 + k, [60, 56, 80]); };
    tower(SX0 - 3, SY0 - 22, 7); tower(SX0 - 12, SY0 - 10, 4); tower(SX0 + 8, SY0 - 13, 4);
    for (const [x, y] of [[SX0, SY0 - 18], [SX0, SY0 - 12], [SX0 - 11, SY0 - 6], [SX0 + 9, SY0 - 8], [SX0 + 1, SY0 - 5]]) put(x, y, [120, 220, 255]);

    // 갑판 아래로 깔린 구름 바다
    for (let y = HOR; y < H; y++) for (let x = 0; x < W; x++) {
      const v = (y - HOR) / (H - HOR);
      const n = fbm(x / (40 - v * 18), (y - HOR) / (6 + v * 10), 4, 21);
      const base = [mixc([46, 38, 76], [24, 20, 44], v), mixc([70, 60, 106], [38, 32, 64], v), mixc([110, 98, 150], [62, 54, 96], v)];
      const f = clamp((n - 0.3) * 2.4) * 2, i = Math.floor(f);
      let c = base[Math.min(2, i + (dith(x, y, f - i) ? 1 : 0))];
      if (y < HOR + 2) c = mixc(c, [120, 104, 160], 0.45);
      put(x, y, c);
    }

    // 체스판 갑판
    const L = rgb(T.sqL), D = rgb(T.sqD), FOGC = [50, 44, 80];
    const TS = 0.388;
    for (let y = Math.ceil(sy(Z_END)); y < H; y++) {
      const z = F / (y + 0.5 - HOR);
      for (let x = 0; x < W; x++) {
        const wx = (x + 0.5 - CX) * z / F;
        if (Math.abs(wx) > WD) continue;
        const odd = (Math.floor(wx / TS + 100) + Math.floor(z / TS)) & 1;
        let c = odd ? L : D;
        // 칸 사이 줄눈
        const gx = Math.abs(((wx / TS) % 1 + 1) % 1 - 0.5) > 0.47, gz = Math.abs(((z / TS) % 1 + 1) % 1 - 0.5) > 0.47 - z * 0.004;
        if (gx || gz) c = mixc(c, INK, 0.45);
        // 대리석 결
        if (hash(Math.floor(wx * 60), Math.floor(z * 40), 5) < 0.06) c = mixc(c, [200, 196, 220], odd ? 0.12 : 0.05);
        // 멀수록 안개 색으로
        const fk = clamp((z - 2.2) / (Z_END - 2.2)) * 0.75;
        c = dith(x, y, fk) ? mixc(c, FOGC, 0.55) : c;
        // 가운데 유도로: 조금 밝은 띠
        if (Math.abs(wx) < 0.36 && Math.abs(wx) > 0.3) c = mixc(c, INK, 0.5);
        put(x, y, c);
      }
    }
    // 갑판 가장자리 돌 테두리
    for (let y = Math.ceil(sy(Z_END)); y < H; y++) {
      const z = F / (y + 0.5 - HOR);
      for (const s of [-1, 1]) {
        const x0 = sx(s * WD, z), w = Math.max(1, 0.06 * F / z);
        for (let k = 0; k < w; k++) put(x0 + (s < 0 ? -k : k), y, k === 0 ? rgb(T.rail[0]) : rgb(T.rail[2]));
      }
    }

    // 발사대: 팔각 석조 단 (갑판 끝)
    const PADY = Math.round(sy(Z_END)) - 1, R = rgb(T.rail[0]), Rm = rgb(T.rail[1]), Rd = rgb(T.rail[2]);
    for (let y = PADY - 8; y <= PADY + 4; y++) {
      const top = y <= PADY;
      const dy = top ? (y - (PADY - 4)) / 4 : 0;
      const hw = top ? Math.round(44 - Math.max(0, Math.abs(dy) - 0.4) * 22) : 44 - (y - PADY);
      for (let x = -hw; x <= hw; x++) {
        let c = top ? (Math.abs(x) > hw - 1 || y === PADY - 8 ? INK : y < PADY - 5 ? R : Rm) : (y === PADY + 4 || Math.abs(x) === hw ? INK : Rd);
        if (!top && y === PADY + 2 && x % 8 === 0) c = [90, 210, 255];
        put(CX + x, y, c);
      }
    }

    // 로켓: 고딕 대성당 첨탑을 세운 모양. 아래 → 위로
    //   기단(넓은 몸통 + 바깥 버팀벽 기둥과 공중 버팀벽) → 1단(첨두창 둘 + 박공) → 2단(장미창 + 박공)
    //   → 3단 팔각 등탑(투각 첨두창 셋) → 크로켓이 줄지은 투각 첨탑 → 십자 꼭대기 장식
    //   단마다 처마 띠와 모서리 작은 첨탑. 빛은 왼쪽 위.
    const RK = T.rocket.map(rgb), BASE = PADY - 6, GLOW = [96, 206, 246], GLOW2 = [200, 246, 255], VOID = [30, 40, 62];
    const shadeAt = (x, y, nx) => { const f = clamp(1.4 + nx * 2.4, 0, RK.length - 1); const i = Math.floor(f); return RK[Math.min(RK.length - 1, i + (dith(x + 7, y, f - i) ? 1 : 0))]; };
    const col = (y0, y1, hwAt) => {   // 가운데 기둥 하나를 위아래로 채운다
      for (let y = y0; y <= y1; y++) {
        const hw = hwAt(y), r = Math.round(hw);
        for (let x = -r - 1; x <= r + 1; x++) put(CX + x, y, Math.abs(x) > r ? INK : shadeAt(x, y, x / Math.max(1, hw)));
      }
    };
    const box = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, x === x0 || x === x1 || y === y0 ? INK : shadeAt(x, y, ((x - x0) / Math.max(1, x1 - x0)) * 2 - 1)); };
    const pinnacle = (x, top, base, w = 1) => {   // 작은 첨탑: 꼭지 → 크로켓 달린 뿔 → 몸
      const L = Math.max(4, Math.round((base - top) * 0.55));
      for (let y = top; y <= base; y++) {
        const hw = y < top + L ? Math.floor((y - top) / L * (w + 1)) : w;
        for (let i = -hw - 1; i <= hw + 1; i++) put(x + i, y, Math.abs(i) > hw ? INK : i < 0 ? RK[0] : i === 0 ? RK[1] : RK[3]);
        if (y > top + 2 && y < top + L && (y - top) % 3 === 0) { put(x - hw - 2, y, RK[1]); put(x + hw + 2, y + 1, RK[3]); }
      }
      put(x, top - 1, RK[0]); put(x, top - 2, INK);
    };
    const cornice = (y, hw) => {   // 처마 띠 + 난간 구멍
      for (let x = -hw - 2; x <= hw + 2; x++) {
        const edge = Math.abs(x) === hw + 2;
        put(CX + x, y - 1, INK); put(CX + x, y, edge ? INK : x < 0 ? RK[0] : RK[2]); put(CX + x, y + 1, edge ? INK : (x & 1) ? RK[4] : RK[2]); put(CX + x, y + 2, INK);
      }
    };
    const lancet = (cx, y0, y1, w, fill = GLOW) => {   // 첨두창: 위가 뾰족, 가운데 멀리언
      for (let y = y0; y <= y1; y++) {
        const t = y - y0, hw = t < w ? Math.floor(t * w / w / 1.2) : w;
        for (let x = -hw - 1; x <= hw + 1; x++) {
          const edge = Math.abs(x) > hw || y === y1;
          put(cx + x, y, edge ? INK : x === 0 && w >= 2 && t > w ? RK[4] : (t < 3 ? GLOW2 : fill));
        }
      }
    };
    const gable = (cx, baseY, hw, h) => {   // 박공(뾰족 삼각 지붕) + 크로켓 + 꼭대기 장식
      for (let j = 0; j <= h; j++) {
        const w = Math.round(hw * (1 - j / h)), y = baseY - j;
        for (const s of [-1, 1]) { put(cx + s * w, y, INK); put(cx + s * (w - 1), y, s < 0 ? RK[0] : RK[2]); }
        if (j % 3 === 1 && w > 1) { put(cx - w - 1, y, RK[1]); put(cx + w + 1, y, RK[3]); }
      }
      put(cx, baseY - h - 1, RK[0]); put(cx, baseY - h - 2, RK[0]); put(cx - 1, baseY - h - 1, INK); put(cx + 1, baseY - h - 1, INK);
    };

    // 공중 버팀벽 + 바깥 기둥 (몸통 뒤)
    for (const s of [-1, 1]) {
      const px = CX + s * 30;
      box(px - 3, px + 3, 124, BASE);                                  // 바깥 버팀벽 기둥
      for (let y = 128; y < BASE - 2; y += 7) put(px + (s < 0 ? -1 : 1), y, INK);
      pinnacle(px, 100, 124, 2);
      // 공중 버팀벽: 기둥 꼭대기에서 몸통으로 비스듬히, 아래는 뾰족 아치로 뚫린다
      for (let k = 0; k <= 16; k++) {
        const x = px - s * k, yTop = Math.round(122 - k * 1.3);
        for (let j = 0; j < 6; j++) put(x, yTop + j, j === 0 || j === 5 ? INK : j === 1 ? (s < 0 ? RK[0] : RK[2]) : s < 0 ? RK[1] : RK[3]);
        if (k % 4 === 2) { put(x, yTop - 1, s < 0 ? RK[0] : RK[2]); put(x, yTop - 2, INK); }   // 버팀벽 등 위 크로켓
      }
      // 아래 지느러미: 몸통에서 바깥 기둥 발까지, 뾰족 아치 두 개로 뚫린 판
      for (let y = 128; y <= BASE; y++) {
        const out = 14 + (y - 128) / (BASE - 128) * 13;
        for (let x = 15; x <= out; x++) {
          const ax = x - 15, ay = y - 128;
          const arch = (ax > 1 && ax < 6 && ay > 6 + Math.abs(ax - 3.5) * 1.2 && y < BASE - 2) || (ax > 7 && ax < 11 && ay > 10 + Math.abs(ax - 9) * 1.2 && y < BASE - 2);
          if (arch) continue;
          put(CX + s * x, y, x >= out - 1 || y === BASE ? INK : s < 0 ? RK[2] : RK[4]);
        }
      }
      box(CX + s * 20 - 2, CX + s * 20 + 2, 132, BASE);                // 안쪽 낮은 기둥
      pinnacle(CX + s * 20, 120, 132, 1);
    }
    // 기단 (넓은 몸통)
    col(118, BASE, () => 14);
    for (const xo of [-9, -3, 3, 9]) lancet(CX + xo, 126, 144, 1, [60, 150, 200]);
    cornice(117, 14);
    // 1단
    col(92, 116, () => 12);
    lancet(CX - 5, 99, 114, 2); lancet(CX + 5, 99, 114, 2);
    gable(CX - 5, 99, 4, 6); gable(CX + 5, 99, 4, 6);
    cornice(91, 12);
    for (const s of [-1, 1]) pinnacle(CX + s * 14, 78, 92, 1);
    // 2단: 장미창 + 큰 박공
    col(66, 90, () => 10.5);
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
      const d = Math.hypot(x, y);
      if (d > 7.2) continue;
      const a = Math.atan2(y, x), petal = Math.cos(a * 6) * 0.5 + 0.5;
      const c = d > 6.3 ? INK : d < 1.4 ? GLOW2 : (d > 2.2 && d < 2.9) || (Math.abs(Math.sin(a * 6)) < 0.25 && d > 2.9) ? [44, 62, 92] : d > 4.6 + petal * 1.2 ? RK[3] : petal > 0.5 ? GLOW : [70, 160, 210];
      put(CX + x, 80 + y, c);
    }
    gable(CX, 72, 9, 9);
    cornice(65, 10);
    for (const s of [-1, 1]) pinnacle(CX + s * 12, 52, 66, 1);
    // 3단 팔각 등탑: 투각 첨두창 셋
    col(46, 64, () => 8);
    for (const xo of [-4, 0, 4]) lancet(CX + xo, 50, 62, 1, VOID.map((v, i) => Math.round(v * 0.4 + GLOW[i] * 0.6)));
    for (const xo of [-4, 0, 4]) gable(CX + xo, 50, 2, 3);
    cornice(45, 8);
    for (const s of [-1, 1]) pinnacle(CX + s * 9, 32, 46, 0);
    // 투각 첨탑: 크로켓 줄 + 가로 띠 + 작은 빛 구멍
    col(12, 44, y => 8 * Math.pow((y - 12) / 32, 1.25));
    for (let y = 14; y < 44; y++) {
      const hw = Math.round(8 * Math.pow((y - 12) / 32, 1.25));
      if (y % 4 === 0 && hw > 0) { put(CX - hw - 2, y, RK[0]); put(CX - hw - 3, y, INK); put(CX + hw + 2, y + 1, RK[3]); put(CX + hw + 3, y + 1, INK); }
      if (y % 8 === 4 && hw > 1) for (let x = -hw; x <= hw; x++) put(CX + x, y, INK);
      if (y % 8 === 0 && hw > 2) { put(CX - 1, y + 1, GLOW); put(CX + 1, y + 1, [60, 150, 200]); }
    }
    // 꼭대기 십자 장식
    for (let y = 3; y < 12; y++) put(CX, y, y < 5 ? GLOW2 : RK[1]);
    for (let x = -2; x <= 2; x++) put(CX + x, 6, x < 0 ? RK[0] : RK[2]);
    put(CX - 3, 6, INK); put(CX + 3, 6, INK); put(CX, 2, INK);
    // 분사구 셋
    for (const xo of [-8, 0, 8]) for (let y = BASE + 1; y <= BASE + 4; y++) for (let x = -2 - (y - BASE) / 2; x <= 2 + (y - BASE) / 2; x++) put(CX + xo + x, y, Math.abs(x) >= 2 + (y - BASE) / 2 - 0.6 ? INK : [40, 38, 52]);

    // 정비 탑(오른쪽): 격자 기둥 + 로켓으로 뻗은 팔
    const GX = 284, GT = 30;
    for (let y = GT; y <= PADY; y++) {
      for (const x of [GX, GX + 12]) { put(x, y, [70, 66, 90]); put(x + 1, y, [34, 32, 46]); }
      const seg = (y - GT) % 12;
      put(GX + 1 + seg, y, [56, 52, 74]); put(GX + 12 - seg, y, [40, 38, 54]);
    }
    for (let x = GX - 2; x <= GX + 14; x++) { put(x, GT - 1, INK); put(x, GT, [90, 86, 112]); }
    for (const ay of [60, 108]) for (let x = CX + 15; x < GX; x++) { put(x, ay, [80, 76, 100]); put(x, ay + 1, [34, 32, 46]); if (x % 4 === 0) put(x, ay + 2, [34, 32, 46]); }

    // 난간: 기둥 + 작은 첨탑 + 위·아래 가로대 + 촘촘한 동자
    const rail = (z, s) => [sx(s * WD, z), sy(z), F / z];
    for (const s of [-1, 1]) {
      for (let z = POSTS[0]; z < Z_END; z += 0.1) {
        const [x, y, k] = rail(z, s), h = 0.2 * k;
        for (let j = 1; j < h; j++) put(x, y - j, j < 2 ? Rd : Rm);
      }
      for (let i = 0; i < POSTS.length - 1; i++) {
        const [x0, y0, k0] = rail(POSTS[i], s), [x1, y1, k1] = rail(POSTS[i + 1], s);
        const n = Math.ceil(Math.abs(x1 - x0)) + 1;
        for (let j = 0; j <= n; j++) {
          const u = j / n, x = x0 + (x1 - x0) * u, k = k0 + (k1 - k0) * u, yb = y0 + (y1 - y0) * u;
          put(x, yb - 0.24 * k, R); put(x, yb - 0.24 * k + 1, Rd);
        }
      }
      for (const z of POSTS) {
        const [x, y, k] = rail(z, s), w = Math.max(1, Math.round(0.07 * k)), h = Math.round(0.3 * k), sp = Math.round(0.14 * k);
        for (let j = 0; j < h; j++) for (let i = -w; i <= w; i++) put(x + i, y - j, Math.abs(i) === w ? INK : i < 0 ? R : Rm);
        for (let j = 0; j < sp; j++) { const hw = Math.round(w * (1 - j / sp)); for (let i = -hw; i <= hw; i++) put(x + i, y - h - j, Math.abs(i) === hw ? INK : i < 0 ? R : Rm); }
      }
    }
    return buf;
  }

  // ---------------- 나이트 파츠 ----------------
  async function loadKnight() {
    const base = new URL(`${theme}/`, KNIGHT);
    const data = await (await fetch(new URL('parts.json', base))).json();
    const parts = {};
    await Promise.all(data.layers.map(name => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { parts[name] = im; res(); };
      im.onerror = rej;
      im.src = new URL(`${name}.png`, base).href;
    })));
    knight = { data, parts };
  }
  const breathAt = (t, cycle, delay) => { const p = (((t / cycle) - delay) % 1 + 1) % 1; return 0.5 - 0.5 * Math.cos(p * Math.PI * 2); };
  // 왼쪽 나이트는 오른쪽(관문)을 보고, 오른쪽 나이트는 좌우를 뒤집어 왼쪽을 본다
  const SPOTS = [{ x: -6, flip: false, phase: 0 }, { x: W + 6, flip: true, phase: 1.7 }];
  function drawKnights(t) {
    if (!knight) return;
    const { data, parts } = knight, top = H - data.h + 4;
    for (const sp of SPOTS) {
      lc.save();
      if (sp.flip) { lc.translate(sp.x, 0); lc.scale(-1, 1); } else lc.translate(sp.x, 0);
      for (const name of data.layers) {
        const b = data.breath.parts[name] || { amp: 0, delay: 0 };
        const dy = -Math.round(breathAt(t + sp.phase, data.breath.cycle, b.delay) * b.amp);
        lc.drawImage(parts[name], 0, top + dy);
      }
      lc.restore();
    }
  }
  function eyeAt(sp) {
    const { data } = knight, top = H - data.h + 4;
    const e = data.eyes[Math.floor(data.eyes.length / 2)] || [102, 22];
    return [sp.flip ? sp.x - e[0] - 1 : sp.x + e[0], top + e[1]];
  }

  // ---------------- 프레임마다 ----------------
  const vap = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  function drawBack(p, t, dt, st) {
    const S = STATE[st] || STATE.idle;
    fx.stars.draw(back);
    // 로켓 장미창·창 빛, 분사구 대기 불빛
    const q = painterFor(back);
    const pulse = 0.75 + 0.25 * Math.sin(t * 1.3);
    q.glow(CX + 0.5, 80.5, 14, hex('#5ad8ff'), 0.35 * pulse);
    q.glow(CX - 5, 106, 6, hex('#5ad8ff'), 0.2);
    q.glow(CX + 5, 106, 6, hex('#5ad8ff'), 0.2);
    q.glow(CX + 0.5, 56, 7, hex('#5ad8ff'), 0.2 * pulse);
    q.glow(CX + 0.5, 5, 4, hex('#c8f6ff'), 0.4 + 0.2 * Math.sin(t * 2.3));
    const BASEY = Math.round(sy(Z_END)) - 3;
    for (const xo of [-8, 0, 8]) q.glow(CX + xo + 0.5, BASEY + 3, 5, hex('#3aa8ff'), 0.3 + 0.1 * Math.sin(t * 9 + xo));
    // 정비 탑 꼭대기 경고등(빨강, 1.2초마다)
    const bl = (t % 1.2) < 0.18;
    q.px(290, 27, bl ? hex('#ffffff') : hex('#7a1a22'));
    if (bl) q.glow(290.5, 27.5, 9, hex('#ff3a4a'), 0.6);
    // 발사대 김: 분사구 옆으로 기어 나와 퍼지는 증기
    if (rnd() < dt * 9) for (const s of [-1, 1]) vap.push({ x: CX + s * (10 + rnd() * 4), y: BASEY + 2, vx: s * (6 + rnd() * 10), vy: -(1 + rnd() * 3), r: 1.5 + rnd(), age: 0, life: 2.2 + rnd() * 1.6 });
    for (let i = vap.length - 1; i >= 0; i--) {
      const v = vap[i];
      v.age += dt; v.x += v.vx * dt; v.y += v.vy * dt; v.vx *= 1 - dt * 0.6; v.vy -= dt * 0.8; v.r += dt * 2.2;
      if (v.age > v.life) { vap.splice(i, 1); continue; }
      const k = 1 - v.age / v.life;
      q.disc(v.x, v.y, v.r, hex(v.age < 0.4 ? '#e8f0ff' : '#b4bcd6'), 0.42 * k);
    }
    // 난간 등불(하늘빛, 숨쉬듯 깜빡)
    POSTS.forEach((z, i) => {
      if (i % 2) return;
      for (const s of [-1, 1]) {
        const k = F / z, x = sx(s * WD, z), y = sy(z) - 0.3 * k - 0.14 * k - 1;
        const fl = 0.8 + 0.2 * Math.sin(t * 3.1 + i * 1.7 + s) * Math.sin(t * 5.3 + i);
        q.px(x, y, hex('#e0f8ff'));
        q.glow(x + 0.5, y + 0.5, 3 + k * 0.08, hex('#5ad8ff'), 0.45 * fl);
        q.glow(x + 0.5, sy(z) + 1, 2 + k * 0.12, hex('#3a90c0'), 0.12 * fl);   // 바닥에 비친 빛
      }
    });
    // 유도등: 갑판 가운데 두 줄, 로켓 쪽으로 흐르는 물결
    const run = hex(S.run);
    RUN.forEach((z, i) => {
      const wave = Math.pow(0.5 + 0.5 * Math.cos((i * 0.55 - t * S.speed * 4)), 6);
      for (const s of [-1, 1]) {
        const x = sx(s * 0.33, z), y = sy(z);
        q.px(x, y, wave > 0.5 ? hex('#ffffff') : run);
        q.glow(x + 0.5, y + 0.5, 2 + 26 / z, run, 0.08 + 0.42 * wave);
      }
    });
    fx.fogL.draw(back, 'back'); fx.fogR.draw(back, 'back');
    if (fx.pad) fx.pad.draw(back);
    fx.gateBack.draw(back);
    drawGateDepth(painterFor(back), t, st);
    fx.gate.draw(back);
    drawGateArch(painterFor(back), t, st);
  }
  // 관문 위 뾰족 아치(크로켓·꼭대기 장식) + 이맛돌의 폰 문장 + 지나가는 말을 훑는 검사 막
  const PAWN_ICON = ['..###..', '..###..', '...#...', '..###..', '.#####.', '..###..', '..###..', '.#####.', '#######'];
  // 관문의 두께: 기둥 안쪽 면, 아치 밑면(리브), 바닥 문턱, 그리고 앞→뒤로 지나가는 검사 막
  function drawGateDepth(q, t, st) {
    const S = STATE[st] || STATE.idle, T = THEME[theme], lit = hex(S.run), ink = hex('#121018');
    const st0 = rgb(T.rail[0]), st1 = rgb(T.rail[1]), st2 = rgb(T.rail[2]);
    const shade = (k) => { const c = k < 0.5 ? mixc(st2, st1, k * 2) : mixc(st1, st0, (k - 0.5) * 2); return hex('#' + c.map(v => v.toString(16).padStart(2, '0')).join('')); };
    const ys = GATE_TOP + 2, a = GATE_PX, RISE = 76, off = (a * a - RISE * RISE) / (2 * a), R = a - off;
    const tf = (x, y, k) => [CX + (x - CX) * k, HOR + (y - HOR) * k];
    const lerp = (u, v, k) => u + (v - u) * k;
    // 바닥 문턱: 앞선과 뒷선 사이 금속판, 가로 격자, 가운데 빛 줄
    const fh = a - 4, bh = GB_PX - 3;
    for (let y = GBY; y <= GATE_Y; y++) {
      const k = (y - GBY) / Math.max(1, GATE_Y - GBY), hw = lerp(bh, fh, k);
      for (let x = Math.round(CX - hw); x <= Math.round(CX + hw); x++) {
        const edge = Math.abs(x - CX) > hw - 1;
        q.px(x, y, edge ? ink : (y - GBY) % 4 === 0 ? hex('#121018') : (x - CX) % 9 === 0 ? hex('#2a2836') : hex('#1c1a26'));
      }
      if (y === GATE_Y || y === GBY) for (let x = Math.round(CX - hw); x <= Math.round(CX + hw); x += 2) q.dot(x, y, lit, 0.7);
    }
    for (let y = GBY; y <= GATE_Y; y += 1) q.dot(CX, y, lit, 0.5), q.dot(CX - 1, y, lit, 0.25), q.dot(CX + 1, y, lit, 0.25);
    // 기둥 안쪽 면: 앞 기둥 안쪽 모서리 → 뒤 기둥 안쪽 모서리
    for (const s of [-1, 1]) {
      const xf = CX + s * (a - 4), xb = CX + s * (GB_PX - 3);
      const n = Math.abs(xb - xf);
      for (let i = 0; i <= n; i++) {
        const k = i / n, x = Math.round(lerp(xf, xb, k));
        const y0 = Math.round(lerp(GATE_TOP + 4, GB_TOP + 4, k)), y1 = Math.round(lerp(GATE_Y, GBY, k));
        const tone = 0.62 - k * 0.5;   // 앞쪽이 밝고 안으로 갈수록 그늘
        for (let y = y0; y <= y1; y++) {
          let c = shade(tone);
          if (i === 0 || i === n) c = ink;
          else if ((y - y0) % 14 === 0) c = shade(tone - 0.25);          // 석재 줄눈 (원근을 따라 기울어진다)
          q.px(x, y, c);
        }
        // 가운데 높이를 따라 달리는 발광 띠
        const ym = Math.round(lerp(lerp(GATE_TOP + 4, GATE_Y, 0.5), lerp(GB_TOP + 4, GBY, 0.5), k));
        q.dot(x, ym, lit, 0.55); q.dot(x, ym + 1, lit, 0.25);
      }
      q.glow(xf, (GATE_TOP + GATE_Y) / 2, 6, lit, 0.15);
    }
    // 아치 밑면: 앞 아치 안쪽 곡선과 뒤 아치 안쪽 곡선 사이를 리브로 채운다
    for (const side of [-1, 1]) {
      const cx = CX + side * off;
      for (let ang = 0; ang <= Math.PI * 0.72; ang += 0.006) {
        const ux = side < 0 ? -Math.cos(ang) : Math.cos(ang), uy = -Math.sin(ang);
        const x = cx + ux * R, y = ys + uy * R;
        if (side < 0 ? x > CX : x < CX) continue;
        const [bx, by] = tf(x, y, GATE_KB);
        const rib = Math.abs(((ang / 0.16) % 1) - 0.5) > 0.42;
        const tone = rib ? 0.05 : 0.3 - ang * 0.12;
        const L = Math.ceil(Math.hypot(bx - x, by - y));
        for (let j = 0; j <= L; j++) { const k = j / L; q.px(x + (bx - x) * k, y + (by - y) * k, shade(Math.max(0, tone - k * 0.25))); }
        q.dot(bx, by, lit, 0.6);   // 뒤쪽 테두리 빛
      }
    }
    // 검사 막: 관문 입구 모양의 빛 테가 앞판에서 뒤판으로 지나간다 (거절이면 앞판에 붉은 막)
    if (st === 'denied') {
      if ((t % 0.5) < 0.25) for (let y = ys + 8; y < GATE_Y; y += 2) for (let x = CX - a + 5; x <= CX + a - 5; x += 2) q.dot(x + (y & 2 ? 1 : 0), y, lit, 0.16);
    } else if (st !== 'granted') {
      const per = st === 'checking' ? 1.2 : 4.2, kk = st === 'idle' ? 0.4 : 1;
      for (const lag of st === 'checking' ? [0, 0.5] : [0]) {
        const ph = ((t / per) + lag) % 1, k = lerp(1, GATE_KB, ph), fade = Math.sin(ph * Math.PI) * kk;
        const P = [];
        for (const s of [-1, 1]) {
          const x = lerp(CX + s * (a - 4), CX + s * (GB_PX - 3), ph);
          const yt = lerp(GATE_TOP + 4, GB_TOP + 4, ph), yb = lerp(GATE_Y, GBY, ph);
          for (let y = yt; y <= yb; y++) P.push([x, y]);
        }
        for (const side of [-1, 1]) {
          const cx = CX + side * off;
          for (let ang = 0; ang <= Math.PI * 0.72; ang += 0.01) {
            const x = cx + (side < 0 ? -Math.cos(ang) : Math.cos(ang)) * R, y = ys - Math.sin(ang) * R;
            if (side < 0 ? x > CX : x < CX) continue;
            P.push(tf(x, y, k));
          }
        }
        for (const [x, y] of P) q.dot(x, y, lit, 0.9 * fade);
        for (let i = 0; i < P.length; i += 9) q.glow(P[i][0], P[i][1], 5, lit, 0.18 * fade);
        // 막 안쪽은 성긴 디더로 옅게
        const hw = lerp(a - 4, GB_PX - 3, ph), yb = lerp(GATE_Y, GBY, ph), yt = lerp(GATE_TOP + 4, GB_TOP + 4, ph);
        for (let y = Math.round(yt); y < yb; y += 3) for (let x = Math.round(CX - hw) + 2; x < CX + hw - 1; x += 3) q.dot(x + ((y / 3) & 1), y, lit, 0.12 * fade);
      }
    }
  }
  function drawGateArch(q, t, st) {
    const S = STATE[st] || STATE.idle, T = THEME[theme], lit = hex(S.run);
    const stone = [hex(T.rail[0]), hex(T.rail[1]), hex(T.rail[2])], ink = hex('#121018');
    const ys = GATE_TOP + 2, a = GATE_PX, RISE = 76, off = (a * a - RISE * RISE) / (2 * a), R = a - off;   // 아치 두 호의 중심: CX ± off
    // 아치 몸
    for (const side of [-1, 1]) {
      const cx = CX + side * off;   // 뾰족 아치: 호의 중심은 반대쪽으로 조금 넘어간다
      for (let ang = 0; ang <= Math.PI * 0.72; ang += 0.004) {
        const ux = side < 0 ? -Math.cos(ang) : Math.cos(ang), uy = -Math.sin(ang);
        for (let d = 0; d <= 7; d++) {
          const x = cx + ux * (R + d), y = ys + uy * (R + d);
          if (side < 0 ? x > CX : x < CX) continue;
          const c = d === 0 ? lit : d === 1 ? ink : d === 7 ? ink : d < 4 ? (side < 0 ? stone[0] : stone[1]) : stone[side < 0 ? 1 : 2];
          q.px(x, y, c);
        }
      }
      // 크로켓
      for (let ang = 0.25; ang < 1.95; ang += 0.21) {
        const ux = side < 0 ? -Math.cos(ang) : Math.cos(ang), uy = -Math.sin(ang);
        const x = cx + ux * (R + 8.5), y = ys + uy * (R + 8.5);
        if (side < 0 ? x > CX - 2 : x < CX + 2) continue;
        q.px(x, y, stone[0]); q.px(x + side, y - 1, stone[1]); q.px(x, y - 1, ink);
      }
      q.glow(cx + (side < 0 ? -R : R), ys - 2, 5, lit, 0.4);
    }
    // 꼭대기 장식(작은 첨탑)
    const apexY = Math.round(ys - RISE) - 7;
    for (let j = 0; j < 12; j++) { const hw = j < 7 ? Math.floor(j / 3) : 2; for (let i = -hw - 1; i <= hw + 1; i++) q.px(CX + i, apexY - 12 + j, Math.abs(i) > hw ? ink : i < 0 ? stone[0] : stone[1]); }
    q.px(CX, apexY - 13, hex('#ffffff')); q.glow(CX + 0.5, apexY - 13, 5, lit, 0.5);
    // 이맛돌 메달리온 + 폰 문장
    const my = apexY + 12;
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
      const d = Math.hypot(x, y);
      if (d <= 7.3) q.px(CX + x, my + y, d > 6.3 ? ink : d > 5.2 ? stone[0] : hex('#0e1220'));
    }
    const on = st === 'checking' ? 0.6 + 0.4 * Math.sin(t * 12) : st === 'denied' ? ((t % 0.5) < 0.3 ? 1 : 0.3) : 0.85;
    PAWN_ICON.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') q.dot(CX - 3 + i, my - 4 + j, j < 3 ? hex('#ffffff') : lit, on); }));
    q.glow(CX + 0.5, my + 0.5, 9, lit, 0.35 * on);
  }
  function drawFront(t, st) {
    const q = painterFor(front);
    fx.fogL.draw(front, 'front'); fx.fogR.draw(front, 'front');
    if (!knight) return;
    // 나이트 눈: 상태에 따라 심사 빛줄기 / 붉은 경고
    for (const sp of SPOTS) {
      const [ex, ey] = eyeAt(sp);
      if (st === 'checking') {
        const sw = Math.sin(t * 3.2 + (sp.flip ? 1.4 : 0));
        const tx = CX + sw * 50, ty = 196 + Math.cos(t * 2.1) * 40;
        const n = Math.hypot(tx - ex, ty - ey);
        for (let d = 0; d < n; d += 1.5) {
          const u = d / n, x = ex + (tx - ex) * u, y = ey + (ty - ey) * u;
          q.dot(x, y, hex('#ffd27a'), 0.18 + 0.25 * u);
          if (d % 6 < 1.5) q.glow(x, y, 2 + u * 6, hex('#f0aa30'), 0.05 + 0.08 * u);
        }
        q.glow(tx, ty, 10, hex('#ffd27a'), 0.35);
        q.glow(ex + 0.5, ey + 0.5, 5, hex('#ffd27a'), 0.7);
      } else if (st === 'denied') {
        const on = (t % 0.5) < 0.3;
        q.px(ex, ey, hex(on ? '#ffffff' : '#ff4a4a'));
        q.glow(ex + 0.5, ey + 0.5, on ? 9 : 5, hex('#ff3a4a'), on ? 0.8 : 0.4);
      } else if (st === 'granted') {
        q.glow(ex + 0.5, ey + 0.5, 6, hex('#5aff98'), 0.55);
      } else {
        q.glow(ex + 0.5, ey + 0.5, 4, hex(knight.data.eyeColor || '#2ee6ff'), 0.35 + 0.1 * Math.sin(t * 1.4 + (sp.flip ? 2 : 0)));
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!isActive()) { last = now; return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now; clock += dt;
    const z = getZoom();
    if (z !== Z) { Z = z; canvas.width = W * Z; canvas.height = H * Z; ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; }
    const st = STATE[getState()] ? getState() : 'idle';
    if (st !== state) { const keep = fx.gate.t; state = st; makeStateFx(st); fx.gate.update(keep); fx.gateBack.update(keep + 0.7); }
    for (const k of ['stars', 'fogL', 'fogR', 'gate', 'gateBack', 'pad']) fx[k] && fx[k].update(dt);
    clearFrame(back); clearFrame(front);
    drawBack(painterFor(back), clock, dt, st);
    composite(back, imgB.data, bg);
    lc.putImageData(imgB, 0, 0);
    drawKnights(clock);
    drawFront(clock, st);
    composite(front, imgF.data, null);
    oc.putImageData(imgF, 0, 0);
    lc.drawImage(over, 0, 0);
    ctx.drawImage(low, 0, 0, W * Z, H * Z);
  }

  bg = bake();
  const ready = loadKnight().catch(err => console.warn('boarding: knight parts', err));
  raf = requestAnimationFrame(frame);
  return {
    ready,
    size: () => [W, H],
    setTheme(t) { if (t === theme || !THEME[t]) return; theme = t; bg = bake(); knight = null; loadKnight(); },
    destroy() { cancelAnimationFrame(raf); },
  };
}
