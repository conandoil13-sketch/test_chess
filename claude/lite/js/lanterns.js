// 이동관리국 천장에 매달린 고딕 철제 신호 랜턴 (도트).
// 사슬 고리, 고리·피니얼, 크로켓이 달린 뾰족 지붕과 처마, 첨두 아치 유리창 3면(납선 마름모), 받침과 늘어진 끝장식.
// 평소엔 안쪽에 작은 불씨만 켜져 있고, 승인이면 초록 랜턴이, 거절이면 빨강 랜턴이 깜빡이며 켜진다.
// 빛 번짐은 pixelfx 프레임의 빛 버퍼로 합성한다(투명 배경 위에서는 빛이 은은한 알파로 남는다).
import { createFrame, composite, painterFor } from './vendor/pixelfx/core/index.js';

const pk = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const IRON = [[12, 10, 17], [30, 27, 38], [54, 50, 66], [92, 86, 104], [146, 139, 158]];
const LIT = {
  red: [[86, 8, 20], [168, 18, 40], [238, 48, 64], [255, 128, 112], [255, 226, 210]],
  green: [[8, 66, 30], [20, 138, 62], [52, 218, 112], [156, 255, 184], [232, 255, 238]],
};
const SMOKE = { red: [74, 22, 36], green: [20, 60, 48] };

// x: 화면 가로 비율, chain: 사슬 길이(화면 높이 비율), w: 몸통 폭(px, 홀수), far: 뒤쪽(작고 어둡게)
const SET = [
  { x: 0.036, chain: 0.03, w: 15, col: 'red', ph: 0.4 },
  { x: 0.118, chain: 0.1, w: 11, col: 'green', ph: 1.7 },
  { x: 0.205, chain: 0.012, w: 17, col: 'red', ph: 2.6 },
  { x: 0.31, chain: 0.07, w: 9, col: 'green', ph: 1.1, far: true },
  { x: 0.692, chain: 0.05, w: 9, col: 'red', ph: 2.2, far: true },
  { x: 0.765, chain: 0.04, w: 17, col: 'green', ph: 0.9 },
  { x: 0.842, chain: 0.13, w: 11, col: 'red', ph: 2.1 },
  { x: 0.95, chain: 0.02, w: 13, col: 'green', ph: 3.2 },
];

export function createLanterns(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let W, H, scale, frame, img, raf = 0, running = false, last = 0;
  const level = SET.map(() => 0);
  const t0 = performance.now();

  function size() {
    scale = Math.max(2, Math.round(innerHeight / 235));
    W = Math.ceil(innerWidth / scale); H = Math.ceil(innerHeight / scale);
    frame = createFrame(W, H); img = new ImageData(W, H);
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * scale + 'px'; canvas.style.height = H * scale + 'px';
  }

  function drawChain(p, ax, hx, len, dim) {
    for (let i = 0; i < len; i++) {
      const x = Math.round(ax + (hx - ax) * (i / len)), m = i % 4, ring = ((i / 4) | 0) % 2 === 0;
      const c = k => pk(IRON[k][0] * dim, IRON[k][1] * dim, IRON[k][2] * dim);
      if (ring) {
        if (m === 0 || m === 2) p.px(x, i, c(3));
        else if (m === 1) { p.px(x - 1, i, c(3)); p.px(x + 1, i, c(1)); }
        else p.px(x, i, c(1));
      } else p.px(x, i, c(m === 3 ? 1 : 2));
    }
  }

  // 랜턴 한 개. top = 고리 윗줄, cx = 가운데
  function drawLantern(p, L, cx, top, lv, flick, t) {
    const w = L.w, hw = (w - 1) / 2, dim = L.far ? 0.62 : 1;
    const lit = LIT[L.col], smoke = SMOKE[L.col];
    const I = k => pk(IRON[k][0] * dim, IRON[k][1] * dim, IRON[k][2] * dim);
    const glassC = k => lit[Math.max(0, Math.min(4, k))];
    const put = (x, y, c) => p.px(cx + x, y, c);
    const rim = (x, y, base, k) => { const c = mixc(IRON[base], lit[3], k * lv); put(x, y, pk(c[0] * dim, c[1] * dim, c[2] * dim)); };
    let y = top;
    // 고리
    put(-1, y, I(3)); put(0, y, I(4)); put(1, y, I(3));
    put(-1, y + 1, I(3)); put(1, y + 1, I(1)); put(-1, y + 2, I(2)); put(1, y + 2, I(1));
    put(-1, y + 3, I(2)); put(0, y + 3, I(1)); put(1, y + 3, I(1));
    // 피니얼: 가는 대 + 구슬 + 작은 잎
    put(0, y + 4, I(2)); put(0, y + 5, I(3));
    put(-1, y + 6, I(3)); put(0, y + 6, I(4)); put(1, y + 6, I(1));
    put(-1, y + 7, I(2)); put(0, y + 7, I(2)); put(1, y + 7, I(0));
    y += 8;
    // 뾰족 지붕: 가장자리 크로켓, 가운데 능선, 작은 첨두 채광 틈
    const rh = Math.round(w * 0.95);
    for (let k = 0; k < rh; k++) {
      const half = Math.max(0, Math.round(((k + 1) / rh) * (hw + 1)));
      for (let x = -half; x <= half; x++) {
        let c = 1;
        if (x === -half) c = 3; else if (x === half) c = 0; else if (x === 0) c = 3;
        else if (half > 3 && Math.abs(x) === Math.round(half * 0.55)) c = 2;
        const slit = x === 0 && k > rh * 0.42 && k < rh * 0.78;
        if (slit) { const g = mixc(smoke, glassC(3), lv); put(x, y + k, pk(g[0] * dim, g[1] * dim, g[2] * dim)); continue; }
        if (x === -half && lv > 0.05) { rim(x, y + k, 3, 0.35); continue; }
        put(x, y + k, I(c));
      }
      if (k > 1 && k % 3 === 1) { put(-half - 1, y + k, I(3)); put(half + 1, y + k, I(1)); }
    }
    y += rh;
    // 처마: 두 줄 + 양끝 늘어진 점
    for (let x = -hw - 2; x <= hw + 2; x++) { put(x, y, I(x < 0 ? 3 : 2)); put(x, y + 1, I(x === -hw - 2 ? 2 : 1)); }
    put(-hw - 2, y + 2, I(2)); put(hw + 2, y + 2, I(0)); put(-hw - 2, y + 3, I(1)); put(hw + 2, y + 3, I(0));
    y += 2;
    // 몸통: 가운데 넓은 창 + 양옆 좁은 창(육각 랜턴 정면), 첨두 아치 윗부분, 납선
    const bh = Math.round(w * 1.35), c = Math.max(1, Math.round(hw * 0.46));
    const coreY = y + Math.round(bh * 0.66);
    for (let j = 0; j < bh; j++) {
      const yy = y + j;
      for (let x = -hw; x <= hw; x++) {
        if (j === 0) { put(x, yy, I(x < 0 ? 3 : 2)); continue; }
        if (j === 1 || j >= bh - 2) { put(x, yy, I(j === bh - 1 ? 1 : 2)); continue; }
        if (x === -hw) { put(x, yy, I(j % 5 === 2 ? 4 : 3)); continue; }
        if (x === hw) { put(x, yy, I(j % 5 === 2 ? 2 : 0)); continue; }
        if (Math.abs(x) === c + 1) { rim(x, yy, x < 0 ? 3 : 2, 0.55); continue; }
        // 어느 창인지
        const side = Math.abs(x) > c + 1;
        const pc = side ? Math.sign(x) * (c + 2 + (hw - 1 - (c + 2)) / 2) : 0;
        const ph = side ? (hw - 1 - (c + 2)) / 2 + 0.5 : c + 0.5;
        const u = Math.abs(x - pc) / ph, jj = j - 2, archH = Math.max(2, Math.round(ph * 1.6));
        if (jj < archH * u * 0.98) { put(x, yy, I(jj === Math.round(archH * u) - 1 ? 2 : 1)); continue; }
        // 유리
        const d = Math.hypot(x * 1.15, yy - coreY) / (bh * 0.62);
        let k = d < 0.16 ? 4 : d < 0.36 ? 3 : d < 0.62 ? 2 : 1;
        if (side) k -= 1;
        const lead = ((x + yy) & 3) === 0 || ((x - yy) & 3) === 0;
        if (lead && k < 4) k -= 1;
        let g = glassC(k);
        let off = smoke.slice();
        if (lead) off = [off[0] * 0.6, off[1] * 0.6, off[2] * 0.6];
        if (!side && ((x - jj) % (w + 3) + w + 3) % (w + 3) === 1) off = [64, 60, 80]; // 유리에 비친 줄
        if (side) off = [off[0] * 0.75, off[1] * 0.75, off[2] * 0.75];
        const f = lv * (k <= 0 ? 0.7 : 1) * (0.85 + 0.15 * flick);
        g = mixc(off, k < 0 ? lit[0] : g, f);
        put(x, yy, pk(g[0] * dim, g[1] * dim, g[2] * dim));
      }
    }
    // 안쪽 불씨 / 불꽃
    const fl = Math.sin(t * 0.017 + L.ph * 5) + Math.sin(t * 0.041 + L.ph);
    if (lv < 0.25) {
      put(0, coreY, pk(255 * dim, 176 * dim, 84 * dim));
      if (fl > -0.4) put(0, coreY - 1, pk(220 * dim, 120 * dim, 50 * dim));
    } else {
      put(0, coreY, pk(255, 252, 240)); put(0, coreY - 1, pk(...lit[4]));
      put(-1, coreY, pk(...lit[3])); put(1, coreY, pk(...lit[3]));
      if (fl > -0.8) put(0, coreY - 2, pk(...lit[3]));
      if (fl > 0.7) put(fl > 1.2 ? 1 : -1, coreY - 3, pk(...lit[2]));
    }
    y += bh;
    // 받침: 띠 + 좁아지는 단 + 늘어진 끝장식
    for (let x = -hw - 1; x <= hw + 1; x++) put(x, y, I(x < 0 ? 3 : 2));
    for (let x = -hw; x <= hw; x++) put(x, y + 1, I(1));
    let half = hw - 1, yb = y + 2;
    while (half >= 1) {
      for (let x = -half; x <= half; x++) put(x, yb, I(x === -half ? 3 : x === half ? 0 : 1));
      half -= 2; yb++;
    }
    put(0, yb, I(2)); put(0, yb + 1, I(3));
    put(-1, yb + 2, I(2)); put(0, yb + 2, I(4)); put(1, yb + 2, I(1));
    put(0, yb + 3, I(1)); put(0, yb + 4, I(0));
    // 빛 번짐
    if (lv > 0.02) {
      const a = lit[2], b = lit[4];
      p.glow(cx + 0.5, coreY, w * 2.6, pk(a[0], a[1], a[2]), 0.42 * lv * (0.88 + 0.12 * flick) * dim);
      p.glow(cx + 0.5, coreY, w * 0.9, pk(b[0], b[1], b[2]), 0.32 * lv * dim);
    } else {
      p.glow(cx + 0.5, coreY, 5, pk(255, 160, 70), 0.18 * dim);
    }
  }

  function render(now) {
    const t = now - t0, st = getState();
    frame.color.fill(0); frame.light.fill(0);
    const p = painterFor(frame);
    SET.forEach((L, n) => {
      let target = 0;
      if (st === 'approved' && L.col === 'green') target = 1;
      else if (st === 'denied' && L.col === 'red') target = Math.floor(t / 275) % 2 ? 1 : 0.12;
      else if (st === 'scanning') target = 0.12 + 0.1 * Math.sin(t * 0.008 + n);
      level[n] += (target - level[n]) * (target > level[n] ? 0.45 : 0.3);
      // 흔들림: 사슬 끝이 진자처럼 좌우로
      const len = Math.round(L.chain * H) + 2;
      const swing = Math.sin(t * 0.00114 + L.ph * 2.2) * (0.045 + 0.02 * (n % 3));
      const ax = Math.round(L.x * W);
      const hx = Math.round(ax + Math.sin(swing) * (len + L.w * 2));
      const flick = Math.sin(t * 0.023 + n * 3) * 0.5 + Math.sin(t * 0.061 + n) * 0.5;
      drawChain(p, ax, hx, len, L.far ? 0.62 : 1);
      drawLantern(p, L, hx, len, level[n], flick, t);
    });
    composite(frame, img.data, null);
    ctx.putImageData(img, 0, 0);
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    render(now);
  }
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (running) size(); }, 180); });

  function start() { if (running) return; running = true; size(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  start();
  return { start, stop };
}
