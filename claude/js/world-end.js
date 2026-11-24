// 세계의 끝 모달 틀: 첨두 아치 돌창 + 마름모 납선 스테인드글라스 + 장미창을 도트로 그린다.
// 저해상도(172×126)로 그리고 CSS에서 정수 배율로 키운다(image-rendering: pixelated).
export const WE_W = 172, WE_H = 126;
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
  canvas.width = WE_W; canvas.height = WE_H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(WE_W, WE_H), px = img.data;
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

  // --- 매 프레임: 고정 그림 + 유리를 천천히 지나가는 빛 + 장미창 가운데 맥동 ---
  const SWEEP = 7.5;
  function draw(t) {
    const ph = (t / SWEEP) % 1, band = -60 + ph * 2.2 * (WE_W + 120);   // 앞 45%만 지나가고 나머지는 쉰다
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    for (let i = 0, n = WE_W * WE_H; i < n; i++) {
      const k = base[i], o = i * 4;
      if (!k) { px[o + 3] = 0; continue; }
      let c = P[k];
      const x = i % WE_W, y = (i / WE_W) | 0;
      if (glass[i] && k !== 'lead') {
        const d = x + y * 0.55 - band;
        if (d > -5 && d < 5) {
          const f = 1 - Math.abs(d) / 5;
          if (dither(x, y, f * 0.9)) c = k === 'g4' || k === 'g3' ? P.g5 : k === 'g2' ? P.g4 : k === 'g1' || k === 'g0' ? P.g3 : k === 'blue' ? P.blueHi : k === 'rose' ? P.roseHi : c;
        }
      }
      if (k === 'goldMid' && dither(x, y, pulse)) c = P.goldHi;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  let raf = 0, last = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (now - last < 110) return;          // 도트 애니메이션답게 9fps 정도로 끊는다
    last = now;
    draw(now / 1000);
  };
  draw(0);
  return {
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
