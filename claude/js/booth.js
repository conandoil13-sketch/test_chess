// 심사 창구를 도트로 그린다. 심사관 도트와 같은 크기의 픽셀 격자를 쓴다.
//  - 뒤(#booth-back): 창구 안쪽 벽돌과 디더링한 조명. 판정에 따라 조명 색이 바뀐다
//  - 앞(#booth-art): 돌 홍예(쐐기돌 아치) + 둥근 몰딩 + 안쪽 뾰족 장식, 유리 반사, 말하는 구멍
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y, k) => k * 16 > BAYER[(y & 3) * 4 + (x & 3)];
// .booth의 clip-path와 같은 꼭짓점 (가로 비율, 세로 비율)
const ARCH = [[0, 0.36], [0.05, 0.22], [0.14, 0.11], [0.28, 0.04], [0.5, 0], [0.72, 0.04], [0.86, 0.11], [0.95, 0.22], [1, 0.36]];
function archTop(u) {
  // 창 바깥(돌테 쪽)은 첫·끝 구간의 기울기를 그대로 이어 돌테가 곡선을 따라 감싼다
  if (u < 0) { const s = (ARCH[1][1] - ARCH[0][1]) / ARCH[1][0]; return [ARCH[0][1] + u * s, s]; }
  if (u > 1) { const r = archTop(1 - u); return [r[0], -r[1]]; }
  for (let i = 1; i < ARCH.length; i++) {
    const [u0, v0] = ARCH[i - 1], [u1, v1] = ARCH[i];
    if (u <= u1) { const k = (u - u0) / (u1 - u0); return [v0 + (v1 - v0) * k, (v1 - v0) / (u1 - u0)]; }
  }
  return [ARCH.at(-1)[1], 0];
}
const STONE = { o: [7, 6, 11], hi: [139, 137, 152], a: [92, 90, 107], b: [80, 78, 94], c: [70, 68, 84], sh: [48, 46, 60], dk: [33, 31, 43], joint: [22, 20, 30] };
const LIGHT = { idle: [110, 170, 200], scanning: [127, 233, 255], approved: [124, 242, 160], denied: [255, 84, 84] };

// getScale: 홀 배경(#hall-nave)의 화면 픽셀/도트 배율(정수). 창구·심사관·난간이 모두 이 격자를 쓴다.
export function createBooth(booth, { getMood = () => 'idle', isActive = () => true, getScale = () => 3, officer = null } = {}) {
  const back = Object.assign(document.createElement('canvas'), { id: 'booth-back' });
  booth.prepend(back);
  const art = Object.assign(document.createElement('canvas'), { id: 'booth-art' });
  booth.after(art);
  let dot = 0, M = 8, mood = '', Wb = 0;
  const snap = v => Math.round(v / dot) * dot;

  function placeOfficer() {
    if (!officer || !officer.width || !dot) return;
    const r = booth.getBoundingClientRect();
    // 왕관 끝이 아치 꼭대기 바로 아래에 오도록: 캔버스 위 여백(14도트) - 8도트
    Object.assign(officer.style, { left: snap((r.width - officer.width) / 2) + 'px', top: (-6 * dot) + 'px' });
  }
  function layout() {
    const r = booth.getBoundingClientRect();
    if (!r.width) return false;
    dot = getScale();
    Wb = Math.ceil(r.width / dot); const Hb = Math.ceil(r.height / dot);
    back.width = Wb; back.height = Hb;
    Object.assign(back.style, { width: Wb * dot + 'px', height: Hb * dot + 'px' });
    art.width = Wb + M * 2; art.height = Hb + M;
    const par = booth.offsetParent.getBoundingClientRect();
    // 화면 기준 도트 격자에 맞춰 놓는다
    const ax = snap(r.left - M * dot), ay = snap(r.top - M * dot);
    Object.assign(art.style, { left: (ax - par.left) + 'px', top: (ay - par.top) + 'px', width: art.width * dot + 'px', height: art.height * dot + 'px' });
    placeOfficer();
    return true;
  }

  // 창구 안쪽(유리 너머): 어두운 벽돌 + 조명
  function drawBack() {
    const W = back.width, H = back.height, c = back.getContext('2d'), im = c.createImageData(W, H), d = im.data;
    const L = LIGHT[mood] || LIGHT.idle;
    const lk = mood === 'idle' ? 0.22 : 0.34;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / H;
      // 위가 더 어둡게, 4단 계단 + 디더
      const band = v * 3.2, bi = Math.floor(band);
      const lvl = Math.min(3, bi + (dith(x, y, band - bi) ? 1 : 0));
      let col = [[9, 9, 15], [13, 14, 21], [17, 19, 28], [20, 23, 33]][lvl].slice();
      // 벽돌 줄눈
      const row = Math.floor(y / 6), bx = (x + (row & 1) * 7) % 14;
      if (y % 6 === 5 || bx === 13) col = col.map(n => n + 6);
      // 조명: 심사관 뒤 타원, 3단 디더
      const ex = (x / W - 0.5) / 0.42, ey = (v - 0.72) / 0.62, e = 1 - Math.sqrt(ex * ex + ey * ey);
      if (e > 0) {
        const k = e * 3, ki = Math.floor(k), step = Math.min(3, ki + (dith(x, y, k - ki) ? 1 : 0)) / 3;
        col = col.map((n, i) => Math.round(n + (L[i] - n) * step * lk));
      }
      const o = (y * W + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.putImageData(im, 0, 0);
  }

  // 돌 아치 + 유리
  function drawArt() {
    const W = art.width, H = art.height, Wb = back.width, Hb = back.height;
    const c = art.getContext('2d'), im = c.createImageData(W, H), d = im.data;
    // 윗변 호의 길이(쐐기돌 나누기용)
    const arc = new Float32Array(W);
    for (let x = 1; x < W; x++) { const [, s] = archTop((x - M) / Wb); arc[x] = arc[x - 1] + Math.hypot(1, s * Hb / Wb); }
    const springY = M + 0.36 * Hb;
    const put = (x, y, col, a = 255) => {
      const o = (y * W + x) * 4;
      if (a >= 255 || !d[o + 3]) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a; return; }
    };
    const cx = W / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - M) / Wb;
      const [t0, slope] = archTop(u);
      const sv = (y + 0.5 - (M + t0 * Hb)) / Math.hypot(1, slope * Hb / Wb);
      const s = Math.min(x + 0.5 - M, M + Wb - x - 0.5, sv);  // 창 안쪽으로 양수
      const t = s + M;                                         // 바깥 테두리에서 0
      if (t < 0) continue;
      const onTop = sv < Math.min(x + 0.5 - M, M + Wb - x - 0.5) && y < springY + 4;
      if (t < 1) { put(x, y, STONE.o); continue; }
      if (t < 8) {
        // 쐐기돌 / 문설주 돌
        let joint = false, blk = 0;
        if (onTop) { const a = arc[x] / 9; joint = Math.abs(a - Math.round(a)) * 9 < 0.5; blk = Math.floor(a); }
        else { const row = Math.floor((y - springY) / 8); joint = ((y - springY) % 8 + 8) % 8 < 1; blk = row; if (!joint && Math.floor(t) === 4 && (row & 1)) joint = true; }
        const key = onTop && Math.abs(x + 0.5 - cx) < 5;      // 쐐기돌
        let col = key ? STONE.hi : [STONE.a, STONE.b, STONE.c][((blk % 3) + 3) % 3];
        if (t < 2) col = key ? [180, 178, 192] : STONE.hi;
        else if (t >= 7) col = STONE.sh;
        if (joint && !key) col = STONE.joint;
        if (key && t >= 3.5 && t < 5.5 && Math.abs(x + 0.5 - cx) < 1.5) col = [127, 233, 255];   // 쐐기돌 신호 보석
        put(x, y, col); continue;
      }
      if (t < 9) { put(x, y, STONE.joint); continue; }
      if (t < 12) {                                            // 둥근 몰딩: 밝음 → 중간 → 그늘
        put(x, y, t < 10 ? STONE.hi : t < 11 ? STONE.a : STONE.sh); continue;
      }
      if (t < 13) { put(x, y, STONE.o); continue; }
      // 안쪽 뾰족 장식(커스프): 윗변을 따라 일정 간격으로 아래로 늘어진 작은 이빨
      if (onTop && t < 16) {
        const a = (arc[x] % 14) - 7;
        if (Math.abs(a) < (16 - t) * 0.9) { put(x, y, Math.abs(a) < 0.8 || t > 15 ? STONE.sh : STONE.c); continue; }
        if (Math.abs(a) < (16 - t) * 0.9 + 1) { put(x, y, STONE.o); continue; }
      }
      // 유리: 위쪽 그늘(디더) + 비스듬한 반사 두 줄기 + 윗가장자리 푸른 빛
      if (t < 14 && onTop) { put(x, y, [127, 233, 255], 70); continue; }
      const gy = y - M;
      if (gy < Hb * 0.3) {
        const k = 1 - gy / (Hb * 0.3);
        if (dith(x, y, k * 0.55)) { put(x, y, [4, 4, 8], 110); continue; }
      }
      const g = (x - M + gy * 0.55) / Wb;
      if (g > 0.18 && g < 0.25 && dith(x, y, 0.5)) { put(x, y, [230, 240, 255], 34); continue; }
      if (g > 0.62 && g < 0.655 && dith(x, y, 0.5)) { put(x, y, [230, 240, 255], 22); continue; }
    }
    // 아래 창턱 + 말하는 구멍
    const sill = H - 4;
    for (let y = sill; y < H; y++) for (let x = M - 4; x < M + Wb + 4; x++) {
      put(x, y, y === sill ? STONE.o : y === sill + 1 ? STONE.hi : y === H - 1 ? STONE.sh : STONE.b);
    }
    const gw = 34, gh = 9, gx = Math.round(cx - gw / 2), gy0 = sill - gh;
    for (let y = gy0; y < sill; y++) for (let x = gx; x < gx + gw; x++) {
      const e = x === gx || x === gx + gw - 1 || y === gy0;
      let col = e ? STONE.o : y === gy0 + 1 ? STONE.hi : STONE.b;
      if (!e && y > gy0 + 2 && y < sill - 1 && x > gx + 2 && x < gx + gw - 3 && (x - gx) % 3 === 0) col = STONE.joint;
      put(x, y, col);
    }
    c.putImageData(im, 0, 0);
  }

  function redraw() { if (layout()) { mood = getMood(); drawBack(); drawArt(); } }
  new ResizeObserver(redraw).observe(booth);
  if (officer) new ResizeObserver(placeOfficer).observe(officer);
  setInterval(() => {
    if (!isActive()) return;
    if (getScale() !== dot) redraw();
    else if (getMood() !== mood) { mood = getMood(); drawBack(); }
  }, 250);
  return { redraw, scale: () => dot };
}

// ───────── 심사대 난간 ─────────
// 위에서부터: 돌 상판(윗면 블록 + 앞면 네잎 장식띠) → 상판 그림자 → 네잎 원창 띠
// → 기둥머리·받침을 갖춘 가는 기둥 사이 삼엽 뾰족 아치(안쪽에 희미한 신호 틈) → 받침돌.
// 빛은 왼쪽 위에서 온다: 왼쪽·위 모서리 밝게, 오른쪽·아래 어둡게.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };
const RAIL = {
  o: [7, 6, 11], j: [24, 22, 32],
  t: [[150, 148, 163], [128, 126, 142], [114, 112, 128], [100, 98, 114], [84, 82, 98]],   // 상판 밝음→어둠
  w: [[74, 72, 88], [64, 62, 78], [55, 53, 68], [46, 44, 58], [38, 36, 49], [30, 28, 40]], // 벽
  rec: [[22, 20, 31], [17, 16, 25], [12, 11, 19]],                                         // 움푹 들어간 곳
};
// 난간 신호빛: 판정에 따라 색이 바뀐다 (어두움, 중간, 밝음)
const SIG = {
  idle: [[44, 84, 100], [96, 170, 190], [160, 220, 235]],
  scanning: [[50, 110, 140], [127, 233, 255], [210, 250, 255]],
  approved: [[30, 110, 60], [70, 230, 130], [200, 255, 220]],
  denied: [[120, 20, 34], [255, 70, 80], [255, 190, 180]],
  deniedDim: [[60, 14, 22], [130, 34, 44], [170, 80, 80]],
};
export function createCounter(counter, { getScale = () => 3, isActive = () => true, getMood = () => 'idle' } = {}) {
  const cv = Object.assign(document.createElement('canvas'), { id: 'counter-art' });
  counter.prepend(cv);
  let dot = 0, key = '';
  // 거절이면 홀 스테인드글라스처럼 깜빡인다
  const sigKey = () => { const m = getMood(); return m === 'denied' && Math.floor(performance.now() / 275) % 2 ? 'deniedDim' : (SIG[m] ? m : 'idle'); };
  function draw() {
    const r = counter.getBoundingClientRect();
    if (!r.width) return;
    dot = getScale();
    const W = Math.ceil(r.width / dot), H = Math.ceil(r.height / dot);
    cv.width = W; cv.height = H;
    Object.assign(cv.style, { width: W * dot + 'px', height: H * dot + 'px' });
    const T = Math.max(14, Math.round(counter.querySelector('.counter-top').getBoundingClientRect().height / dot));
    const c = cv.getContext('2d'), im = c.createImageData(W, H), d = im.data;
    const P = new Array(W * H);
    const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < W && y < H) P[y * W + x] = col; };
    const get = (x, y) => P[y * W + x];
    const cx = Math.floor(W / 2);
    key = sigKey();
    const R = { ...RAIL, sig: SIG[key] };

    // 1) 벽 바탕: 돌 쌓기(높이 7, 길이 16) + 아래로 어두워지는 계단 + 디더
    for (let y = T; y < H; y++) for (let x = 0; x < W; x++) {
      const v = (y - T) / (H - T), k = v * 4.2, ki = Math.floor(k);
      const lvl = Math.min(5, ki + (dith(x, y, k - ki) ? 1 : 0));
      const row = Math.floor((y - T) / 7), bx = x + (row & 1) * 8 - cx;
      let col = R.w[lvl];
      if ((y - T) % 7 === 6 || ((bx % 16) + 16) % 16 === 15) col = R.w[Math.min(5, lvl + 2)];
      else if ((y - T) % 7 === 0 || ((bx % 16) + 16) % 16 === 0) col = R.w[Math.max(0, lvl - 1)];
      else if (hash(x, y) < 0.05) col = R.w[Math.min(5, lvl + 1)];   // 돌 표면 얼룩
      put(x, y, col);
    }

    // 2) 아케이드
    const bay = 28, pw = 4;                       // 칸 너비, 기둥 너비
    const fr = T + 4;                             // 네잎 띠 위치(위)
    const aTop = T + 13, base = H - 9;            // 아치 꼭대기 근처, 받침돌 시작
    const aw = bay - pw - 4;                      // 아치 안 폭 (기둥 옆 벽 2도트씩)
    const RR = aw * 0.62, spring = aTop + Math.sqrt(RR * RR - (RR - aw / 2) ** 2);
    const inArch = (ax, y, grow) => {             // ax: 아치 왼쪽에서의 거리, grow: 테두리 두께만큼 키우기
      if (y >= base) return false;
      if (ax < -grow || ax > aw + grow) return false;
      if (y >= spring) return true;
      return Math.hypot(ax - RR, y - spring) <= RR + grow && Math.hypot(ax - (aw - RR), y - spring) <= RR + grow;
    };
    const first = cx - Math.ceil(cx / bay) * bay - bay / 2;   // 가운데에 아치가 오도록
    for (let b0 = first; b0 < W + bay; b0 += bay) {
      const ax0 = b0 + pw + 2;                    // 아치 왼쪽 x
      // 아치 테두리 몰딩(2겹) + 안쪽
      for (let y = T; y < base; y++) for (let x = ax0 - 3; x <= ax0 + aw + 3; x++) {
        const ax = x - ax0 + 0.5;
        if (inArch(ax, y + 0.5, 0)) {
          // 안쪽: 위는 그늘이 깊고 아래로 조금 밝아지는 오목한 면
          const k = (y - aTop) / (base - aTop);
          let col = R.rec[k < 0.35 ? 2 : k < 0.7 ? (dith(x, y, (k - 0.35) / 0.35) ? 1 : 2) : (dith(x, y, (k - 0.7) / 0.3) ? 0 : 1)];
          if (ax < 1.5 && y > spring) col = R.rec[0];               // 왼쪽 안벽이 빛을 조금 받음
          put(x, y, col);
        } else if (inArch(ax, y + 0.5, 1)) put(x, y, R.o);
        else if (inArch(ax, y + 0.5, 2)) put(x, y, ax < aw / 2 ? R.t[1] : R.t[3]);
        else if (inArch(ax, y + 0.5, 3)) put(x, y, R.w[4]);
      }
      // 삼엽 장식: 스프링 높이 근처 양쪽에서 안으로 뾰족 튀어나온 돌 이빨 + 꼭대기 아래 작은 이빨
      const cy = Math.round(spring - (spring - aTop) * 0.35);
      for (const [px, dir] of [[ax0, 1], [ax0 + aw - 1, -1]]) {
        put(px + dir, cy - 1, R.t[2]); put(px + dir, cy, R.t[1]); put(px + dir, cy + 1, R.t[3]);
        put(px + dir * 2, cy, dir > 0 ? R.t[2] : R.t[3]);
      }
      // 신호 틈: 아치 안 가운데 짧은 첨두 틈. 위쪽만 희미하게 푸르고 아래로 금방 사그라든다
      const sx = ax0 + Math.floor(aw / 2) - 1, sy = Math.round(spring) - 1;
      for (let k = 0; k < 7; k++) {
        const y = sy + k, f = k / 7;
        put(sx, y, k < 2 ? R.sig[0] : dith(sx, y, 0.7 - f) ? R.sig[0] : R.rec[0]);
        put(sx + 1, y, k === 0 ? R.sig[1] : dith(sx + 1, y, 0.85 - f) ? R.sig[0] : R.rec[0]);
      }
      put(sx + 1, sy - 1, R.sig[0]);
      // 기둥(가는 원기둥): 기둥머리 + 몸통 + 받침
      const px0 = b0;
      for (let y = T + 10; y < base; y++) for (let i = -1; i <= pw; i++) {
        const x = px0 + i;
        const cap = y < T + 13, foot = y >= base - 3;
        if ((i === -1 || i === pw) && !cap && !foot) continue;
        let col;
        if (i === -1 || i === pw) col = R.o;
        else if (cap) col = y === T + 10 ? R.t[0] : y === T + 12 ? R.t[3] : R.t[1];
        else if (foot) col = y === base - 3 ? R.t[1] : R.t[3];
        else col = [R.t[1], R.t[0], R.t[2], R.t[4]][i] || R.t[2];   // 둥근 몸통: 왼쪽 밝게
        if (!cap && !foot && hash(x, y) < 0.04) col = R.t[3];
        put(x, y, col);
      }
      for (let i = -2; i <= pw + 1; i++) { put(px0 + i, T + 9, R.o); put(px0 + i, T + 13, R.o); }
      // 네잎 원창: 기둥 위 스팬드럴
      const qx = px0 + pw / 2 - 0.5, qy = fr + 3;
      for (let y = qy - 4; y <= qy + 4; y++) for (let x = Math.floor(qx - 4); x <= qx + 4; x++) {
        const dx = x - qx, dy = y - qy;
        const lobe = Math.min(Math.hypot(dx - 1.6, dy), Math.hypot(dx + 1.6, dy), Math.hypot(dx, dy - 1.6), Math.hypot(dx, dy + 1.6));
        if (lobe <= 1.6) put(x, y, R.rec[dy < 0 ? 2 : 1]);
        else if (lobe <= 2.6) put(x, y, dx + dy > 0 ? R.t[1] : R.w[5]);
      }
    }

    // 3) 받침돌
    for (let y = base; y < H; y++) for (let x = 0; x < W; x++) {
      const bx = ((x - cx) % 22 + 22) % 22;
      let col = y === base ? R.o : y === base + 1 ? R.t[1] : y === base + 2 ? R.t[2] : R.w[Math.min(5, 2 + ((y - base) >> 1))];
      if (y > base + 2 && bx === 0) col = R.w[5];
      if (y > base + 2 && bx === 1) col = R.w[1];
      put(x, y, col);
    }

    // 4) 상판: 윗면 블록 → 앞 모서리 → 앞면 장식띠 → 아래 그림자
    const front = T - 7;
    for (let y = 0; y < T; y++) for (let x = 0; x < W; x++) {
      const bx = ((x - cx) % 34 + 34) % 34;
      let col;
      if (y === 0) col = R.o;
      else if (y === 1) col = ((x - cx) % 10 + 10) % 10 < 6 ? R.sig[1] : R.sig[0];   // 가장자리 신호선
      else if (y === 2) col = R.t[0];
      else if (y < front) {
        // 윗면: 원근 때문에 안쪽(위)이 조금 어둡다
        const k = (front - y) / (front - 3);
        col = R.t[dith(x, y, k * 0.6) ? 2 : 1];
        if (bx === 0) col = R.t[4];
        else if (bx === 1) col = R.t[0];
        else if (hash(x, y) < 0.06) col = R.t[2 + (hash(y, x) < 0.5 ? 1 : 0)];
      } else if (y === front) col = R.t[0];
      else if (y < T - 1) {
        // 앞면: 작은 마름모 홈이 이어진 장식띠
        const fy = y - front - 1, fx = ((x - cx) % 6 + 6) % 6;
        col = fy === 0 ? R.t[2] : R.t[3];
        const dm = Math.abs(fx - 3) + Math.abs(fy - 2.5);
        if (dm < 1.6) col = R.rec[0];
        else if (dm < 2.6 && fx + fy > 4.5) col = R.t[1];
        if (fy >= 5) col = R.t[4];
      } else col = R.o;
      put(x, y, col);
    }
    // 상판이 벽에 드리우는 그림자(디더 2줄)
    for (let y = T; y < T + 3; y++) for (let x = 0; x < W; x++) {
      const k = 1 - (y - T) / 3;
      if (dith(x, y, k * 0.8)) put(x, y, R.w[5]);
    }

    for (let i = 0; i < W * H; i++) {
      const col = P[i] || R.w[5];
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
    c.putImageData(im, 0, 0);
  }
  new ResizeObserver(draw).observe(counter);
  setInterval(() => { if (isActive() && (getScale() !== dot || sigKey() !== key)) draw(); }, 90);
  return { redraw: draw };
}

// ───────── 이동관리국 간판 ─────────
// 천장에서 사슬 두 줄로 매달린 돌 명판. 위에 첨두 박공(가운데 신호 보석), 양 끝에 작은 첨탑,
// 테두리는 몰딩 두 겹, 안쪽은 움푹 판 어두운 면. 글자는 HTML 그대로 위에 얹는다.
export function createSign(sign, { getScale = () => 3, isActive = () => true, getMood = () => 'idle', booth = null } = {}) {
  const cv = Object.assign(document.createElement('canvas'), { id: 'sign-art' });
  sign.prepend(cv);
  let dot = 0, key = '';
  const sigKey = () => { const m = getMood(); return m === 'denied' && Math.floor(performance.now() / 275) % 2 ? 'deniedDim' : (SIG[m] ? m : 'idle'); };
  function draw() {
    if (!sign.getBoundingClientRect().width) return;
    dot = getScale(); key = sigKey();
    // 글자가 돌테(6도트) 안쪽 움푹 판 면에만 오도록 여백을 도트 단위로 잡는다
    const pad = `${8 * dot}px ${16 * dot}px ${7 * dot}px`;
    if (sign.style.padding !== pad) sign.style.padding = pad;
    const top = 13 * dot + 'px';                     // 박공과 사슬이 들어갈 자리
    if (sign.style.top !== top) sign.style.top = top;
    const r = sign.getBoundingClientRect();
    const G = SIG[key], R = RAIL;
    const side = 7, crestH = 10;
    const snap = v => Math.round(v / dot) * dot;
    const pageL = snap(r.left - side * dot), pageT = 0;
    const C = Math.max(crestH + 2, Math.round((r.top - pageT) / dot));          // 천장 ~ 명판 윗변
    const BW = Math.round((r.left + r.width - pageL) / dot) + side - side;        // 명판 오른쪽 끝(도트)
    const W = BW + side, BH = Math.ceil(r.height / dot), H = C + BH + 4;
    cv.width = W; cv.height = H;
    Object.assign(cv.style, { left: (pageL - r.left) + 'px', top: (pageT - r.top) + 'px', width: W * dot + 'px', height: H * dot + 'px' });
    const c = cv.getContext('2d'), im = c.createImageData(W, H), d = im.data;
    const put = (x, y, col) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; };
    const x0 = side, x1 = W - side - 1, y0 = C, y1 = C + BH - 1;          // 명판 몸통
    const cx = (x0 + x1) / 2;
    const metal = [[96, 94, 108], [62, 60, 74], [36, 34, 46]];

    // 사슬: 세운 고리(속 빈 2×3)와 옆 고리(1×2)를 번갈아
    for (const chx of [x0 + 12, x1 - 12]) {
      for (let y = 0; y < y0 - 3; y += 5) {
        for (let k = 0; k < 4; k++) { put(chx - 1, y + k, k === 0 ? metal[0] : metal[1]); put(chx + 1, y + k, metal[2]); }
        put(chx, y, metal[0]); put(chx, y + 3, metal[2]);
        put(chx, y + 4, metal[1]);
      }
      // 고정 고리
      for (let k = -2; k <= 2; k++) put(chx + k, y0 - 2, k < 0 ? metal[0] : metal[1]);
      put(chx - 2, y0 - 1, R.o); put(chx + 2, y0 - 1, R.o); put(chx, y0 - 1, metal[2]);
    }

    // 박공: 가운데 첨두 삼각 + 크로켓 + 꼭대기 보석
    const gw = 15, gTop = y0 - crestH;
    for (let y = gTop; y < y0 + 1; y++) {
      const hw = ((y - gTop) / crestH) * gw;
      for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
        const dx = x + 0.5 - cx, ad = Math.abs(dx);
        if (ad > hw + 1) continue;
        let col = ad > hw ? R.o : ad > hw - 1 ? (dx < 0 ? R.t[0] : R.t[3]) : R.t[2];
        // 안쪽 삼엽 구멍
        const ty = y - (gTop + crestH * 0.55);
        const lobe = Math.min(Math.hypot(dx, ty + 1.4), Math.hypot(dx - 1.6, ty + 0.4), Math.hypot(dx + 1.6, ty + 0.4));
        if (lobe < 1.5) col = R.rec[1]; else if (lobe < 2.3 && ad <= hw - 1) col = dx + ty > 0 ? R.t[1] : R.t[4];
        put(x, y, col);
      }
      if ((y - gTop) % 3 === 1 && y > gTop + 2) {   // 크로켓
        put(Math.floor(cx - hw - 2), y, R.t[1]); put(Math.ceil(cx + hw + 1), y, R.t[3]);
      }
    }
    // 꼭대기 핀 + 신호 보석
    for (let y = gTop - 5; y < gTop + 1; y++) { put(Math.floor(cx) - 1, y, R.o); put(Math.floor(cx), y, y < gTop - 2 ? R.t[0] : R.t[1]); put(Math.floor(cx) + 1, y, R.o); }
    const gy = gTop + 4;
    for (const [dx, dy, k] of [[0, 0, 2], [-1, 0, 1], [0, 1, 1], [-1, 1, 0]]) put(Math.floor(cx) + dx, gy + dy, G[k]);
    // 양 끝 첨탑(아래로 늘어진 꼭지까지)
    for (const [px, dir] of [[x0 - 3, 1], [x1 + 3, -1]]) {
      for (let y = y0 - 9; y <= y1 + 4; y++) {
        const tip = y < y0 - 6, drop = y > y1;
        const hw = tip ? 0 : drop ? Math.max(0, 1 - (y - y1 - 1)) : 1;
        for (let i = -hw - 1; i <= hw + 1; i++) {
          const ad = Math.abs(i);
          put(px + i, y, ad > hw ? R.o : i < 0 ? R.t[0] : i > 0 ? R.t[3] : R.t[1]);
        }
      }
      put(px - 2, y0 - 2, R.t[1]); put(px + 2, y0, R.t[3]);   // 크로켓
      for (let i = -2; i <= 2; i++) put(px + i, y0 - 5, R.o);   // 띠
    }

    // 명판 몸통
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const tl = (x - x0 <= y1 - y && y - y0 <= x1 - x) ? Math.min(x - x0, y - y0) === t : false;   // 왼쪽·위 면
      let col;
      if (t === 0) col = R.o;
      else if (t === 1) col = tl ? R.t[0] : R.t[3];
      else if (t === 2) col = tl ? R.t[1] : R.t[2];
      else if (t === 3) col = R.j;
      else if (t === 4) col = tl ? R.t[4] : R.t[1];            // 안쪽 경사(빛 반대)
      else if (t === 5) col = R.o;
      else {
        // 움푹 판 면: 위가 조금 더 어둡다
        const k = (y - y0) / (y1 - y0);
        col = dith(x, y, k) ? [30, 28, 40] : [22, 21, 31];
        if (hash(x, y) < 0.03) col = [36, 34, 47];
      }
      put(x, y, col);
    }
    // 모서리 리벳
    for (const [rx, ry] of [[x0 + 2, y0 + 2], [x1 - 2, y0 + 2], [x0 + 2, y1 - 2], [x1 - 2, y1 - 2]]) { put(rx, ry, R.t[0]); put(rx + 1, ry + 1, R.j); }
    // 제목·부제 사이 구분선 + 가운데 마름모
    const span = sign.querySelector('span');
    if (span) {
      const ly = Math.round((span.getBoundingClientRect().top - r.top) / dot) + C - 1;
      for (let x = x0 + 9; x <= x1 - 9; x++) { put(x, ly, (x & 1) ? G[0] : G[1]); put(x, ly + 1, R.o); }
      const mx0 = Math.floor(cx);
      for (const [dx, dy, k] of [[0, -1, 1], [-1, 0, 1], [0, 0, 2], [1, 0, 1], [0, 1, 0]]) put(mx0 + dx, ly + dy, G[k]);
    }
    c.putImageData(im, 0, 0);
    clearBooth(r.bottom + 4 * dot);
  }
  // 간판이 창구 아치를 가리면 창구 윗변만 내린다(아랫변은 그대로라 대사 칸·심사대와 안 겹친다)
  let boothKey = '';
  function clearBooth(signBottom) {
    if (!booth) return;
    booth.style.top = ''; booth.style.height = '';
    const b = booth.getBoundingClientRect(), par = booth.offsetParent.getBoundingClientRect();
    const need = Math.ceil(signBottom + 9 * dot);    // 아치 돌테(8도트) + 틈
    const k = b.top < need ? `${need - par.top}|${b.bottom - need}` : '';
    if (k) { booth.style.top = (need - par.top) + 'px'; booth.style.height = (b.bottom - need) + 'px'; }
    boothKey = k;
  }
  new ResizeObserver(draw).observe(sign);
  addEventListener('resize', draw);
  setInterval(() => { if (isActive() && (getScale() !== dot || sigKey() !== key)) draw(); }, 90);
  return { redraw: draw };
}
