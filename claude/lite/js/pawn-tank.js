// 폰 승급소용(예정): 액체 수조 속에 떠 있는 고픽셀 폰. 아직 어디에서도 쓰지 않는다.
// 사용 예:
//   import { createPawnTank } from './pawn-tank.js';
//   const tank = createPawnTank(canvas, { theme: 'white', liquid: 'teal', zoom: 3, isActive: () => !el.hidden });
//   tank.setLiquid('violet'); tank.destroy();
// 미리보기·조정은 로컬 sprite-lab/tank-float.html (같은 로직).
const BASE = new URL('../assets/sprites/pawn/full/', import.meta.url);
const LW = 184, LH = 244;                                        // 수조 한 장의 도트 크기
const PX = 28, PY = 46;                                          // 폰 자리
const IN = { x0: 14, x1: 169, y0: 24, y1: 217, surf: 31 };     // 유리 안쪽, 수면
export const LIQUIDS = {
  teal: { deep: [5, 22, 28], mid: [12, 54, 62], light: [42, 136, 142], glow: [150, 245, 230] },
  amber: { deep: [26, 14, 6], mid: [72, 40, 12], light: [170, 112, 40], glow: [255, 214, 140] },
  violet: { deep: [14, 9, 28], mid: [42, 24, 74], light: [118, 80, 190], glow: [222, 196, 255] },
};
const METAL = [[16, 15, 21], [38, 36, 48], [62, 60, 76], [92, 90, 108], [138, 136, 154]];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y, k) => k * 16 > BAYER[(y & 3) * 4 + (x & 3)];
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };
// 물속 움직임: 위쪽 파츠일수록 늦게·크게 따라온다 (칼날 판은 머리카락처럼 떠오른다)
const FLOAT = {
  legs_back: { lag: 0.35, sway: 0.6, lift: 0 }, base: { lag: 0, sway: 0, lift: 0 },
  legs_front: { lag: 0.2, sway: 0.3, lift: 0 }, core: { lag: 0.12, sway: 0.2, lift: 0 },
  torso: { lag: 0.2, sway: 0.3, lift: 0 }, arms: { lag: 0.45, sway: 0.9, lift: -0.6 },
  head: { lag: 0.35, sway: 0.5, lift: 0 }, blades: { lag: 0.9, sway: 2.2, lift: -2.5 },
};
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export function createPawnTank(canvas, { theme = 'white', liquid = 'teal', zoom = 3, isActive = () => true, bubbles: useBubbles = true, caustics = true } = {}) {
  let data = null, parts = {}, ctx = null, Z = 0, clock = 0, last = 0, raf = 0, seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const back = canvasOf(LW, LH), front = canvasOf(LW, LH), fx = canvasOf(LW, LH), fxc = fx.getContext('2d');
  const getZoom = typeof zoom === 'function' ? zoom : () => zoom;
  const bub = [];

  function fit() {
    const z = getZoom();
    if (z === Z) return;
    Z = z; canvas.width = LW * Z; canvas.height = LH * Z;
    ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  }
  function drawBack() {
    const L = LIQUIDS[liquid], c = back.getContext('2d'), im = c.createImageData(LW, LH), d = im.data;
    const steps = [L.deep, mix(L.deep, L.mid, .5), L.mid, mix(L.mid, L.light, .45), mix(L.mid, L.light, .8)];
    for (let y = IN.y0; y <= IN.y1; y++) for (let x = IN.x0; x <= IN.x1; x++) {
      let col;
      if (y < IN.surf) col = [8, 8, 12];
      else {
        const v = (y - IN.surf) / (IN.y1 - IN.surf), cx = (x - (IN.x0 + IN.x1) / 2) / ((IN.x1 - IN.x0) / 2);
        const glow = Math.max(0, 1 - Math.hypot(cx * 0.9, (1 - v) * 1.6));
        const f = Math.min(1, v * 0.55 + glow * 0.75) * (steps.length - 1), i = Math.floor(f);
        col = steps[Math.min(steps.length - 1, i + (dith(x, y, f - i) ? 1 : 0))];
        if ((x + y * 3) % 23 === 0 && hash(x, y) < .3) col = mix(col, L.light, .25);
      }
      const o = (y * LW + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.putImageData(im, 0, 0);
  }
  function drawFront() {
    const L = LIQUIDS[liquid], c = front.getContext('2d'), im = c.createImageData(LW, LH), d = im.data;
    const put = (x, y, col, a = 255) => { if (x < 0 || y < 0 || x >= LW || y >= LH) return; const o = (y * LW + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a; };
    for (let y = IN.y0; y <= IN.y1; y++) {
      put(IN.x0 - 1, y, METAL[0]); put(IN.x0, y, METAL[3], 200); put(IN.x0 + 1, y, METAL[4], 70);
      put(IN.x1 + 1, y, METAL[0]); put(IN.x1, y, METAL[2], 200); put(IN.x1 - 1, y, METAL[3], 50);
      if (y > IN.surf) for (const [x, a] of [[22, 60], [23, 90], [24, 60], [30, 34], [158, 30], [159, 44]]) put(x, y, [230, 245, 250], dith(x, y, .75) ? a : 0);
    }
    for (const px of [38, 142]) for (let y = 0; y < 10; y++) for (let i = 0; i < 6; i++) put(px + i, y, i === 0 || i === 5 ? METAL[0] : i === 1 ? METAL[3] : i === 4 ? METAL[1] : METAL[2]);
    for (let y = 8; y < IN.y0; y++) for (let x = IN.x0 - 6; x <= IN.x1 + 6; x++) {
      const t = Math.min(x - (IN.x0 - 6), IN.x1 + 6 - x);
      let col = y === 8 || y === IN.y0 - 1 || t === 0 ? METAL[0] : y === 9 ? METAL[4] : y < 13 ? METAL[3] : y < 19 ? METAL[2] : y === 19 ? METAL[0] : METAL[1];
      if (y >= 11 && y <= 16 && (x - IN.x0) % 12 === 3) col = y === 11 ? METAL[4] : METAL[1];
      if (y === 21 && (x - IN.x0) % 10 === 5) col = METAL[4];
      put(x, y, col);
    }
    const cx = Math.round((IN.x0 + IN.x1) / 2);
    for (let y = 0; y < 9; y++) { const hw = Math.max(0, Math.floor((y - 1) / 2.5)); for (let i = -hw - 1; i <= hw + 1; i++) put(cx + i, y, Math.abs(i) > hw ? METAL[0] : i < 0 ? METAL[4] : METAL[2]); }
    put(cx, 5, L.glow); put(cx - 1, 5, L.light);
    for (let y = IN.y1 + 1; y < LH; y++) for (let x = IN.x0 - 8; x <= IN.x1 + 8; x++) {
      const t = Math.min(x - (IN.x0 - 8), IN.x1 + 8 - x);
      let col = t === 0 || y === IN.y1 + 1 || y === LH - 1 ? METAL[0] : y === IN.y1 + 2 ? L.glow : y === IN.y1 + 3 ? L.light : y === IN.y1 + 4 ? METAL[0] : y === IN.y1 + 5 ? METAL[4] : y < LH - 6 ? METAL[2] : METAL[1];
      if (y > IN.y1 + 7 && y < LH - 7 && Math.abs(x - cx) < 34 && (x - cx) % 3 === 0) col = METAL[0];
      if (y === IN.y1 + 9 && (x - IN.x0) % 14 === 2) col = METAL[4];
      put(x, y, col);
    }
    c.putImageData(im, 0, 0);
  }
  async function load(t) {
    const base = new URL(t + '/', BASE);
    const d = await (await fetch(new URL('parts.json', base))).json();
    const p = {};
    await Promise.all(d.layers.map(name => new Promise((res, rej) => { const im = new Image(); im.onload = () => { p[name] = im; res(); }; im.onerror = rej; im.src = new URL(name + '.png', base).href; })));
    data = d; parts = p;
  }

  function draw(dt) {
    const L = LIQUIDS[liquid], cv = canvas, t = clock;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(back, 0, 0, cv.width, cv.height);
    const bobAt = s => Math.sin(s / 6.5 * Math.PI * 2) * 3.2, driftAt = s => Math.sin(s / 11 * Math.PI * 2) * 1.4;
    const snap = v => Math.round(v * Z) / Z;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0 * Z, IN.surf * Z, (IN.x1 - IN.x0 + 1) * Z, (IN.y1 - IN.surf + 1) * Z); ctx.clip();
    let head = [0, 0];
    for (const name of data.layers) {
      const f = FLOAT[name] || { lag: 0, sway: 0, lift: 0 }, s = t - f.lag;
      const dx = driftAt(s) + Math.sin(s * 1.15) * f.sway * 0.5, dy = bobAt(s) + f.lift + Math.sin(s * 0.9 + 1) * f.sway * 0.25;
      if (name === 'head') head = [dx, dy];
      ctx.drawImage(parts[name], snap(PX + dx) * Z, snap(PY + dy) * Z, data.w * Z, data.h * Z);
    }
    if (data.eyes.length) {
      const ex = data.eyes.reduce((a, e) => a + e[0], 0) / data.eyes.length + PX + head[0] + .5;
      const ey = data.eyes.reduce((a, e) => a + e[1], 0) / data.eyes.length + PY + head[1] + .5;
      const g = ctx.createRadialGradient(ex * Z, ey * Z, 0, ex * Z, ey * Z, 6 * Z);
      g.addColorStop(0, data.eyeColor + '88'); g.addColorStop(1, data.eyeColor + '00');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect((ex - 6) * Z, (ey - 6) * Z, 12 * Z, 12 * Z);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 0.26; ctx.fillStyle = `rgb(${L.mid})`; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1;
    ctx.restore();

    const im = fxc.createImageData(LW, LH), d = im.data;
    const put = (x, y, col, a) => { x = Math.round(x); y = Math.round(y); if (x < IN.x0 + 1 || x > IN.x1 - 1 || y < IN.y0 || y > IN.y1) return; const o = (y * LW + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.max(d[o + 3], a); };
    if (caustics) for (let y = IN.surf + 1; y <= IN.y1; y++) for (let x = IN.x0 + 1; x < IN.x1; x++) {
      const v = Math.sin(x * 0.19 + t * 1.2 + Math.sin(y * 0.11 + t * 0.6) * 2.2) * Math.sin(y * 0.15 - t * 0.8 + x * 0.04);
      if (v > 0.74) put(x, y, L.glow, Math.round(26 + (v - 0.74) * 160 * (1 - (y - IN.surf) / 220)));
    }
    for (let x = IN.x0 + 1; x < IN.x1; x++) {
      const y = IN.surf + Math.round(Math.sin(x * 0.16 + t * 1.8) * 0.7 + Math.sin(x * 0.05 - t) * 0.5);
      put(x, y, L.glow, 150); put(x, y + 1, L.light, 80);
    }
    if (useBubbles) {
      if (rnd() < dt * 7) bub.push({ x: IN.x0 + 10 + rnd() * (IN.x1 - IN.x0 - 20), y: IN.y1 - 1, v: 12 + rnd() * 16, r: rnd() < .3 ? 2 : 1, ph: rnd() * 6 });
      if (rnd() < dt * 2.2) { const [vx, vy] = data.vents[rnd() < .5 ? 0 : 1]; bub.push({ x: PX + vx, y: PY + vy + bobAt(t), v: 10 + rnd() * 8, r: 1, ph: rnd() * 6 }); }
      for (let i = bub.length - 1; i >= 0; i--) {
        const b = bub[i];
        b.y -= b.v * dt; b.ph += dt * 3; b.v = Math.min(34, b.v + dt * 4);
        const x = b.x + Math.sin(b.ph) * 1.2;
        if (b.y < IN.surf + 1) { put(x, IN.surf, [255, 255, 255], 200); bub.splice(i, 1); continue; }
        if (b.r === 1) put(x, b.y, L.glow, 210);
        else { for (const [ox, oy] of [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2]]) put(x + ox, b.y + oy, L.glow, 170); put(x, b.y, [255, 255, 255], 230); }
      }
    }
    fxc.putImageData(im, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(fx, 0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(front, 0, 0, cv.width, cv.height);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!data || !isActive()) return;
    fit(); clock += dt; draw(dt);
  }
  drawBack(); drawFront();
  const ready = load(theme).catch(e => console.warn('pawn tank sprite', e));
  raf = requestAnimationFrame(t => { last = t; loop(t); });
  return {
    ready,
    size: () => [LW, LH],
    setLiquid(k) { if (LIQUIDS[k]) { liquid = k; drawBack(); drawFront(); } },
    setTheme(t) { theme = t; return load(t); },
    destroy() { cancelAnimationFrame(raf); },
  };
}
