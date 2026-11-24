// 세계의 끝 모달 틀: 첨두 아치 돌창 + 마름모 납선 스테인드글라스 + 장미창을 도트로 그린다.
// 저해상도(172×126)로 그리고 CSS에서 정수 배율로 키운다(image-rendering: pixelated).
export const WE_W = 172, WE_H = 126;
// 캔버스 여백(이펙트용): 창틀은 (OX, OY)에서 시작한다
export const OX = 30, OY = 24;
const CX = WE_W / 2, Y0 = 52, APEX = 8, BOTTOM = 119, A = 80;

const C = {
  ink: '#07050d', deep: '#15141c', sd: '#3d3b4a', sm: '#5c5a6b', sl: '#8b8998', sh: '#b9b6c8',
  lead: '#0c061a', g0: '#120a2c', g1: '#1b0f40', g2: '#251454', g3: '#3e2382', g4: '#5a3aa8', g5: '#8a6ad8',
  rose: '#8a2f86', roseHi: '#c846aa', blue: '#24407a', blueHi: '#3f6cb8', gold: '#b8862a', goldMid: '#f2c14e', goldHi: '#ffe39a',
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x, y, f) => f * 16 > BAYER[(y & 3) * 4 + (x & 3)];

// 안쪽으로 i 도트 들어간 아치 안에 있는가 (위는 cos 곡선이라 꼭대기가 뾰족하게 만난다)
function inArch(x, y, i) {
  const dx = Math.abs(x + 0.5 - CX), a = A - i, apex = APEX + i * 1.25;
  if (y > BOTTOM - i || y < apex) return false;
  if (y >= Y0) return dx <= a;
  const t = (Y0 - y) / (Y0 - apex);
  return dx <= a * Math.cos(t * Math.PI / 2);
}
// 그 픽셀이 속한 가장 바깥 테두리 깊이 (0 = 바깥 윤곽, 큰 값 = 안쪽)
function depth(x, y) { let i = -1; while (i < 12 && inArch(x, y, i + 1)) i++; return i; }

const ROSE = { x: CX, y: 31, r: 13 };

export function createWorldEndArt(canvas) {
  const ctx = canvas.getContext('2d');
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const P = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, rgb(v)]));
  const base = new Array(WE_W * WE_H).fill(null);   // 고정 그림
  const glass = new Uint8Array(WE_W * WE_H);         // 유리 칸 표시 (빛줄기용)
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < WE_W && y < WE_H) base[y * WE_W + x] = c; };
  const sym = (x, y, c) => { put(x, y, c); put(WE_W - 1 - x, y, c); };

  // --- 돌 창틀과 유리 ---
  for (let y = 0; y < WE_H; y++) for (let x = 0; x < WE_W; x++) {
    const d = depth(x, y);
    if (d < 0) continue;
    const left = x + 0.5 < CX;
    if (d === 0) { put(x, y, 'ink'); continue; }
    if (d <= 5) {
      // 돌: 바깥 첫 줄은 빛 받는 쪽(왼쪽 위) 밝게, 안쪽 끝줄은 그늘
      const up = !inArch(x, y - 1, d) , side = left ? !inArch(x - 1, y, d) : !inArch(x + 1, y, d);
      let c = 'sm';
      if (d === 1) c = left || (up && y < Y0) ? 'sl' : 'sd';
      if (d === 1 && up && y < Y0 && left) c = 'sh';
      if (d === 5) c = 'sd';
      if (d === 4 && !left && side) c = 'sd';
      // 문설주 돌 이음매
      if (y > Y0 + 2 && d >= 2 && d <= 4 && (y - Y0) % 11 === 0) c = 'sd';
      if (y > Y0 + 2 && d >= 2 && d <= 4 && (y - Y0) % 11 === 1 && d === 2) c = 'sl';
      put(x, y, c);
      continue;
    }
    if (d === 6) { put(x, y, 'ink'); continue; }
    // 유리: 위는 밝은 보라, 아래로 갈수록 짙게 (계단 + 바이어 디더)
    glass[y * WE_W + x] = 1;
    // 윗부분(장미창 쪽)은 밝고 화려하게, 글이 놓이는 아랫부분은 어둡고 차분하게
    const lower = y > Y0 + 2;
    const v = lower ? 0.62 + 0.38 * (y - Y0) / (BOTTOM - Y0) : (y - APEX) / (Y0 - APEX) * 0.55;
    const steps = ['g4', 'g3', 'g2', 'g1', 'g0'];
    const f = Math.min(3.999, v * 4.3), k = Math.floor(f);
    let c = dither(x, y, f - k) ? steps[k + 1] : steps[k];
    // 마름모 납선: 2:1 기울기 도트 선
    const u = x - Math.floor(CX), s1 = ((u + 2 * y) % 16 + 16) % 16, s2 = ((u - 2 * y) % 16 + 16) % 16;
    if (s1 === 0 || s1 === 1 || s2 === 0 || s2 === 1) c = lower ? (dither(x, y, 0.5) ? 'lead' : 'g0') : 'lead';
    else if (lower) {
      // 아래 칸: 글자 뒤라 색 조각은 맨 아래 띠에만 드문드문
      const cu = Math.floor((u + 2 * y) / 16), cv = Math.floor((u - 2 * y) / 16);
      const hsh = ((cu * 73856093) ^ (cv * 19349663)) >>> 0;
      if (y > BOTTOM - 9 && hsh % 3 === 0) c = dither(x, y, 0.5) ? 'rose' : 'g1';
    } else {
      // 칸마다 조금씩 다른 유리: 아래쪽은 장밋빛, 가장자리는 푸른빛 조각
      const cu = Math.floor((u + 2 * y) / 16), cv = Math.floor((u - 2 * y) / 16);
      const hsh = ((cu * 73856093) ^ (cv * 19349663)) >>> 0;
      if (hsh % 7 === 0) c = dither(x, y, 0.5) ? 'rose' : 'roseHi';
      else if (hsh % 5 === 0) c = y < 60 ? 'blueHi' : 'blue';
      // 납선 바로 아래 오른쪽은 한 단 어둡게(유리 두께)
      if ((s1 === 2 || s2 === 15) && c.startsWith('g')) c = steps[Math.min(4, steps.indexOf(c) + 1)] || c;
    }
    put(x, y, c);
  }

  // --- 가로 돌띠(스프링 라인): 위 장미창 영역과 아래 글 영역을 나눈다 ---
  for (let x = 0; x < WE_W; x++) {
    if (!glass[(Y0 - 1) * WE_W + x] && !glass[Y0 * WE_W + x]) continue;
    put(x, Y0 - 2, 'ink'); put(x, Y0 - 1, 'sl'); put(x, Y0, 'sm'); put(x, Y0 + 1, 'sd'); put(x, Y0 + 2, 'ink');
    for (let y = Y0 - 2; y <= Y0 + 2; y++) glass[y * WE_W + x] = 0;
  }

  // --- 장미창 ---
  for (let y = ROSE.y - ROSE.r - 1; y <= ROSE.y + ROSE.r + 1; y++) for (let x = ROSE.x - ROSE.r - 1; x <= ROSE.x + ROSE.r + 1; x++) {
    const dx = x + 0.5 - ROSE.x, dy = y + 0.5 - ROSE.y, r = Math.hypot(dx, dy);
    if (r > ROSE.r + 0.6) continue;
    glass[y * WE_W + x] = 0;
    const ang = Math.atan2(dy, dx), seg = ((ang / (Math.PI / 4)) % 1 + 1) % 1;
    let c;
    if (r > ROSE.r - 0.6) c = 'ink';
    else if (r > ROSE.r - 2.2) c = dy < 0 && dx < 2 ? 'sl' : 'sm';
    else if (r > ROSE.r - 3) c = 'ink';
    else if (r < 2.6) c = r < 1.4 ? 'goldHi' : 'goldMid';
    else if (r < 3.6) c = 'ink';
    else if (seg < 0.14 || seg > 0.86) c = 'sm';                        // 바퀴살
    else if (r > 7.6 && r < 8.6) c = 'sd';                              // 안쪽 고리
    else {
      const petal = Math.floor(((ang + Math.PI) / (Math.PI / 4))) % 2;
      c = r > 8.6 ? (petal ? 'rose' : 'g3') : (petal ? 'blueHi' : 'roseHi');
      if (dy < -2 && dx < 0 && r > 4 && dither(x, y, 0.35)) c = c === 'g3' ? 'g4' : c;
    }
    put(x, y, c);
  }

  // --- 꼭대기 십자 피니얼 ---
  for (let y = 0; y <= 7; y++) { put(85, y, y ? 'sl' : 'ink'); put(86, y, y ? 'sm' : 'ink'); put(84, y, 'ink'); put(87, y, 'ink'); }
  for (let x = 81; x <= 90; x++) { put(x, 1, 'ink'); put(x, 4, 'ink'); }
  for (let x = 82; x <= 89; x++) { put(x, 2, x < 86 ? 'sl' : 'sm'); put(x, 3, 'sd'); }
  put(84, 2, 'sl'); put(87, 2, 'sm'); put(84, 3, 'sd'); put(87, 3, 'sd');
  for (const y of [0]) { put(85, y, 'ink'); put(86, y, 'ink'); }

  // --- 아치 바깥 크로켓(작은 돌 잎) ---
  for (let y = 12; y < Y0 - 4; y += 7) {
    let x = 0; while (x < CX && !inArch(x, y, 0)) x++;
    sym(x - 1, y, 'ink'); sym(x - 2, y, 'ink'); sym(x - 1, y + 1, 'ink');
    sym(x, y - 1, 'ink'); sym(x - 1, y - 1, 'ink');
    if (base[y * WE_W + x] === 'ink') { sym(x, y, 'sl'); }
  }

  // --- 양옆 작은 첨탑 (스프링 라인 높이) ---
  for (let y = Y0 - 14; y <= Y0 + 2; y++) {
    const h = Math.floor((y - (Y0 - 14)) / 4);            // 아래로 갈수록 넓어지는 계단 삼각
    for (let x = 4 - h; x <= 6 + h && x <= 7; x++) {
      if (x < 0) continue;
      const edge = x === 4 - h || x === 6 + h || y === Y0 - 14;
      sym(x, y, edge ? 'ink' : x < 5 ? 'sl' : 'sm');
    }
  }

  // --- 창턱 ---
  for (let x = 0; x < WE_W; x++) {
    put(x, BOTTOM + 1, 'ink'); put(x, BOTTOM + 2, x < WE_W / 2 ? 'sl' : 'sm');
    put(x, BOTTOM + 3, 'sm'); put(x, BOTTOM + 4, 'sd'); put(x, BOTTOM + 5, 'ink');
  }
  for (let y = BOTTOM + 1; y <= BOTTOM + 5; y++) { put(0, y, 'ink'); put(WE_W - 1, y, 'ink'); }

  // ================= 이펙트 (시작 화면처럼 은은하게) =================
  // 캔버스는 창틀보다 넓게 잡고, 바깥 여백에 뒤쪽 빛살·후광·촛불·먼지를 그린다.
  const CW = WE_W + OX * 2, CH = WE_H + OY + 8, N = CW * CH;
  canvas.width = CW; canvas.height = CH;
  const out = ctx.createImageData(CW, CH), od = out.data;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), Al = new Float32Array(N);
  const LR = new Float32Array(N), LG = new Float32Array(N), LB = new Float32Array(N);
  const RX = OX + ROSE.x, RY = OY + ROSE.y;
  const SILL = OY + BOTTOM + 1;            // 창턱 맨 윗줄 (캔버스 좌표)

  // 창턱을 양옆으로 늘려 촛대 선반으로 쓴다
  const ext = new Array(N).fill(null);
  const putC = (x, y, c) => { if (x >= 0 && y >= 0 && x < CW && y < CH) ext[y * CW + x] = c; };
  for (const [x0, x1] of [[OX - 26, OX - 1], [OX + WE_W, OX + WE_W + 25]]) for (let x = x0; x <= x1; x++) {
    putC(x, SILL, 'ink'); putC(x, SILL + 1, x < CW / 2 ? 'sl' : 'sm'); putC(x, SILL + 2, 'sm'); putC(x, SILL + 3, 'sd'); putC(x, SILL + 4, 'ink');
    if (x === x0 || x === x1) for (let y = SILL; y <= SILL + 4; y++) putC(x, y, 'ink');
  }
  // 양쪽에 촛불 셋씩 (가운데가 가장 길다)
  const flames = [];
  for (const side of [-1, 1]) for (const [dx, h] of [[21, 6], [15, 10], [9, 7]]) {
    const x = side < 0 ? OX - dx : OX + WE_W - 1 + dx, top = SILL - h;
    for (let y = top; y < SILL; y++) { putC(x, y, 'wax'); putC(x + 1, y, 'waxD'); }
    putC(x, top, 'waxHi');
    putC(x - 1, SILL - 1, 'brass'); putC(x + 2, SILL - 1, 'brassD');
    flames.push({ x, y: top - 1, p: flames.length * 1.7 });
  }
  Object.assign(P, { wax: [228, 214, 186], waxD: [170, 150, 122], waxHi: [250, 240, 214], brass: [214, 168, 72], brassD: [120, 86, 34] });

  // 유리·돌 위 반짝임 후보: 장미창 둘레의 유리, 아치 돌 가장자리 밝은 면
  const spots = [];
  for (let y = 0; y < Y0; y++) for (let x = 0; x < WE_W; x++) {
    const k = base[y * WE_W + x];
    if ((k === 'sh' || (k === 'lead' && y < Y0 - 6)) && ((x * 7 + y * 13) % 5 === 0)) spots.push([OX + x, OY + y]);
  }
  const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const motes = Array.from({ length: 46 }, (_, n) => ({
    x: hash(n) * CW, y: hash(n + 50) * CH, sp: 1.2 + hash(n + 100) * 2.6, p: hash(n + 150) * 6.28, s: 0.6 + hash(n + 200),
    c: n % 3 === 0 ? [255, 227, 154] : n % 3 === 1 ? [201, 182, 255] : [240, 150, 220],
  }));

  // 빛을 계단(도트)으로 더한다: 부드러운 값을 8단계 + 디더로 끊는다
  function light(cx, cy, r, c, k) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(CW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(CH - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d >= 1) continue;
      const v = k * (1 - d) * (1 - d) * 8, q = (Math.floor(v) + (dither(x, y, v - Math.floor(v)) ? 1 : 0)) / 8;
      if (!q) continue;
      const i = y * CW + x;
      LR[i] += c[0] * q; LG[i] += c[1] * q; LB[i] += c[2] * q;
    }
  }
  const solid = (x, y, c) => { if (x < 0 || y < 0 || x >= CW || y >= CH) return; const i = y * CW + x; R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; Al[i] = 1; };

  const SWEEP = 7.5;
  const AL = [0, 0.1, 0.2, 0.32, 0.46];    // 뒤쪽 빛의 투명도 단계
  function draw(t) {
    Al.fill(0); LR.fill(0); LG.fill(0); LB.fill(0);
    const breathe = 0.82 + 0.18 * Math.sin(t * 0.9);

    // 1) 창 뒤에서 새어 나오는 빛살 + 보랏빛 후광 (반투명, 계단 디더)
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const fx = x - OX, fy = y - OY;
      if (fx >= 0 && fy >= 0 && fx < WE_W && fy < WE_H && base[fy * WE_W + fx]) continue;
      const dx = x + 0.5 - RX, dy = y + 0.5 - RY, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      let ray = Math.pow(0.5 + 0.5 * Math.cos(ang * 12 + t * 0.12), 7) + 0.6 * Math.pow(0.5 + 0.5 * Math.cos(ang * 7 - t * 0.08 + 1), 9);
      ray *= Math.max(0, 1 - r / 118) * (dy < 8 ? 1 : 0.35) * breathe;
      const e = Math.hypot((fx - CX) / 92, (fy - 66) / 72);
      const halo = Math.max(0, Math.min(1, (1.28 - e) / 0.34)) ** 2 * 0.62 * breathe;
      const v = (ray * 0.7 + halo) * 4, k = Math.min(4, Math.floor(v) + (dither(x, y, v - Math.floor(v)) ? 1 : 0));
      if (!k) continue;
      const i = y * CW + x, warm = ray > halo;
      R[i] = warm ? 232 : 110; G[i] = warm ? 200 : 76; B[i] = warm ? 150 : 210; Al[i] = AL[k];
    }

    // 2) 창틀 (유리를 지나가는 빛 + 장미창 맥동)
    const ph = (t / SWEEP) % 1, band = -60 + ph * 2.2 * (WE_W + 120);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    for (let fy = 0; fy < WE_H; fy++) for (let fx = 0; fx < WE_W; fx++) {
      const k = base[fy * WE_W + fx];
      if (!k) continue;
      let c = P[k];
      if (glass[fy * WE_W + fx] && k !== 'lead') {
        const d = fx + fy * 0.55 - band;
        if (d > -5 && d < 5 && dither(fx, fy, (1 - Math.abs(d) / 5) * 0.9))
          c = k === 'g4' || k === 'g3' ? P.g5 : k === 'g2' ? P.g4 : k === 'g1' || k === 'g0' ? P.g3 : k === 'blue' ? P.blueHi : k === 'rose' ? P.roseHi : c;
      }
      if (k === 'goldMid' && dither(fx, fy, pulse)) c = P.goldHi;
      solid(fx + OX, fy + OY, c);
    }
    for (let i = 0; i < N; i++) { const k = ext[i]; if (k) { R[i] = P[k][0]; G[i] = P[k][1]; B[i] = P[k][2]; Al[i] = 1; } }

    // 3) 장미창 빛 번짐
    light(RX, RY, 24, [210, 120, 230], 0.22 + 0.1 * pulse);
    light(RX, RY, 8, [255, 220, 140], 0.3 * pulse);

    // 4) 촛불: 2~3도트 불꽃이 일렁이고 둘레를 데운다
    for (const f of flames) {
      const fl = Math.sin(t * 7.3 + f.p) + Math.sin(t * 13.1 + f.p * 2);
      solid(f.x, f.y, [255, 236, 170]); solid(f.x + 1, f.y, fl > 0.4 ? [255, 236, 170] : [255, 170, 60]);
      solid(f.x + (fl > 0 ? 1 : 0), f.y - 1, [255, 170, 60]);
      if (fl > 0.8) solid(f.x + (fl > 1.4 ? 1 : 0), f.y - 2, [240, 110, 40]);
      light(f.x + 1, f.y, 10 + fl, [255, 160, 70], 0.34);
    }

    // 5) 떠다니는 먼지: 천천히 오르며 깜빡인다
    for (const m of motes) {
      const y = ((m.y - t * m.sp) % CH + CH) % CH, x = Math.floor(m.x + Math.sin(t * 0.6 * m.s + m.p) * 4);
      const tw = 0.5 + 0.5 * Math.sin(t * 1.7 * m.s + m.p);
      if (tw < 0.35) continue;
      const iy = Math.floor(y);
      solid(x, iy, m.c.map(v => v * (0.6 + 0.4 * tw)));
      if (tw > 0.9) light(x + 0.5, iy + 0.5, 3, m.c, 0.4);
    }

    // 6) 반짝임: 돌 가장자리와 납선 위에 가끔 십자 별
    for (let n = 0; n < 4; n++) {
      const cyc = t * 0.55 + n * 0.25, id = Math.floor(cyc), life = cyc - id;
      if (life > 0.4) continue;
      const [sx, sy] = spots[Math.floor(hash(id * 4 + n) * spots.length)] || [];
      if (sx === undefined) continue;
      const a = Math.sin(life / 0.4 * Math.PI), arm = a > 0.6 ? 2 : 1;
      solid(sx, sy, [255, 255, 240]);
      for (let q = 1; q <= arm; q++) for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) solid(sx + ux * q, sy + uy * q, q === 1 ? [255, 236, 170] : [200, 170, 255]);
      light(sx + 0.5, sy + 0.5, 6, [255, 230, 180], 0.45 * a);
    }

    // 합치기: 투명한 곳에 더한 빛은 알파를 올려 보이게 한다
    for (let i = 0; i < N; i++) {
      let r = R[i], g = G[i], b = B[i], a = Al[i];
      const lr = LR[i], lg = LG[i], lb = LB[i], o = i * 4;
      if (lr || lg || lb) {
        if (a < 1) {
          const pr = r * a + lr, pg = g * a + lg, pb = b * a + lb, na = Math.min(1, Math.max(a, Math.max(lr, lg, lb) / 255));
          if (na > 0) { r = pr / na; g = pg / na; b = pb / na; a = na; }
        } else { r += lr; g += lg; b += lb; }
      }
      od[o] = r > 255 ? 255 : r; od[o + 1] = g > 255 ? 255 : g; od[o + 2] = b > 255 ? 255 : b; od[o + 3] = a * 255;
    }
    ctx.putImageData(out, 0, 0);
  }

  let raf = 0, last = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (now - last < 100) return;          // 도트 애니메이션답게 10fps 정도로 끊는다
    last = now;
    draw(now / 1000);
  };
  draw(0);
  return {
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
