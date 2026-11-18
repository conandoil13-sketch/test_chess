// 행성 바깥의 도트 우주 배경.
// 세계관상 CB-120에는 중심 항성과 달이 없으므로, 태양이나 달처럼 보이는 천체는 그리지 않는다.
// 먼 별, 성운, 다른 행성(시안), 별똥별, 궤도 물체만 그린다.
import { fbm, hash, rng } from './noise.js';

const P = 3; // 우주 1픽셀 = 화면 3px
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const STAR_COLORS = ['#ffffff', '#d6e6ff', '#ffe9c4', '#ffd0f0', '#a8f0ff'];
const NEB_A = [[24, 14, 44], [38, 20, 64], [58, 28, 88], [84, 40, 112]];
const NEB_B = [[10, 30, 42], [14, 46, 60], [22, 66, 78], [34, 92, 100]];
const BASE = [5, 6, 13];

const PLANETS = [
  { // 고리 있는 가스 행성
    fx: 0.36, fy: 0.15, r: 24, par: 0.02, drift: 0.35, rot: 0.06, tilt: -0.38, ring: true, seed: 3,
    pal: [[64, 34, 30], [120, 64, 46], [176, 104, 66], [214, 152, 98], [238, 206, 150]], bands: 5,
  },
  { // 얼음 행성
    fx: 0.83, fy: 0.12, r: 10, par: 0.035, drift: -0.5, rot: 0.14, tilt: 0.25, atmo: '#7fe9ff', seed: 9,
    pal: [[28, 58, 92], [44, 98, 140], [86, 156, 196], [170, 222, 240], [240, 252, 255]], ice: true,
  },
  { // 작은 암석 행성
    fx: 0.58, fy: 0.07, r: 5, par: 0.05, drift: 0.8, rot: 0.2, tilt: 0, seed: 21,
    pal: [[40, 30, 52], [70, 54, 86], [108, 88, 120], [150, 128, 158], [196, 180, 204]], rock: true,
  },
];

export function createSpace(canvas) {
  const ctx = canvas.getContext('2d');
  const r = rng(808);
  const VW = 1700, VH = 1100; // 별이 반복되는 가상 하늘 크기
  const layers = [
    { par: 0.008, zk: 0.16, stars: [] },
    { par: 0.018, zk: 0.3, stars: [] },
    { par: 0.034, zk: 0.5, stars: [] },
  ];
  layers[0].stars = Array.from({ length: 1000 }, () => ({ x: r() * VW, y: r() * VH, b: 0.25 + r() * 0.4, c: STAR_COLORS[Math.floor(r() * 5)], tw: 0.5 + r() * 2, ph: r() * 9, big: false }));
  layers[1].stars = Array.from({ length: 360 }, () => ({ x: r() * VW, y: r() * VH, b: 0.5 + r() * 0.4, c: STAR_COLORS[Math.floor(r() * 5)], tw: 1 + r() * 3, ph: r() * 9, big: false }));
  layers[2].stars = Array.from({ length: 64 }, () => ({ x: r() * VW, y: r() * VH, b: 0.85 + r() * 0.15, c: STAR_COLORS[Math.floor(r() * 5)], tw: 0.6 + r() * 1.5, ph: r() * 9, big: true }));

  let w = 0, h = 0, neb = null;
  let NM = 60; // 성운 패럴랙스·축소 여유
  const meteors = [];
  let nextMeteor = 0;
  const sat = { y: 0.3, speed: 6, ph: r() };

  function buildNebula() {
    const nw = w + NM * 2, nh = h + NM * 2;
    neb = document.createElement('canvas');
    neb.width = nw; neb.height = nh;
    const c = neb.getContext('2d');
    const img = c.createImageData(nw, nh);
    const D = img.data;
    for (let y = 0; y < nh; y++) {
      const grad = y / nh;
      for (let x = 0; x < nw; x++) {
        let col = [BASE[0] + grad * 4, BASE[1] + grad * 5, BASE[2] + grad * 10];
        const d = bay(x, y);
        const a = fbm(x * 0.011, y * 0.016, 31, 4) + (fbm(x * 0.05, y * 0.05, 32, 2) - 0.5) * 0.18;
        const b = fbm(x * 0.009 + 40, y * 0.013, 47, 4) + (fbm(x * 0.06, y * 0.06, 48, 2) - 0.5) * 0.16;
        // 은하수처럼 비스듬한 띠
        const band = Math.exp(-(((y - nh * 0.32) - (x - nw * 0.5) * 0.28) ** 2) / (2 * (nh * 0.16) ** 2));
        const ta = (a - 0.5) * 3.2 + band * 0.55 - 0.15;
        const tb = (b - 0.52) * 3.2 + band * 0.25;
        if (ta > 0) { const i = Math.min(3, Math.floor(ta * 4 + d - 0.5)); if (i >= 0) col = NEB_A[i]; }
        if (tb > 0.08) { const i = Math.min(3, Math.floor((tb - 0.08) * 4 + d - 0.5)); if (i >= 0) col = NEB_B[i]; }
        if (hash(x, y, 70) > 0.9965 - band * 0.006) { const v = 70 + hash(x, y, 71) * 90; col = [v, v, v + 20]; }
        const o = (y * nw + x) * 4;
        D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }

  function resize() {
    const nw = Math.ceil(innerWidth / P), nh = Math.ceil(innerHeight / P);
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    NM = 60 + Math.ceil(Math.max(w, h) * 0.12);
    canvas.width = w; canvas.height = h;
    buildNebula();
  }
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  resize();

  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, 1, 1); };
  const rgbStr = (c, k = 1) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;

  function drawStars(t, ox, oy, zr) {
    for (const L of layers) {
      const sx = ox * L.par, sy = oy * L.par;
      const k = zr ** L.zk;
      for (const s of L.stars) {
        const rx = ((s.x - sx) % VW + VW) % VW - VW / 2;
        const ry = ((s.y - sy) % VH + VH) % VH - VH / 2;
        const x = Math.floor(w / 2 + rx * k);
        const y = Math.floor(h / 2 + ry * k);
        if (x < -2 || y < -2 || x >= w + 2 || y >= h + 2) continue;
        const tw = 0.62 + 0.38 * Math.sin(t * 0.001 * s.tw + s.ph);
        ctx.globalAlpha = s.b * tw;
        px(x, y, s.c);
        if (s.big) {
          const arm = tw > 0.8 ? 2 : 1;
          ctx.globalAlpha = s.b * tw * 0.55;
          for (let k = 1; k <= arm; k++) { px(x + k, y, s.c); px(x - k, y, s.c); px(x, y + k, s.c); px(x, y - k, s.c); }
          if (tw > 0.93) { ctx.globalAlpha = 0.25; px(x + 1, y + 1, s.c); px(x - 1, y - 1, s.c); px(x + 1, y - 1, s.c); px(x - 1, y + 1, s.c); }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function planetColor(pl, nx, ny, nz, t) {
    const ct = Math.cos(pl.tilt), st = Math.sin(pl.tilt);
    const lat = ny * ct + nx * st;
    const lx = nx * ct - ny * st;
    const lon = Math.atan2(lx, nz) + t * 0.001 * pl.rot;
    const cu = Math.cos(lon) * 1.6, su = Math.sin(lon) * 1.6;
    let v;
    if (pl.ice) {
      const n = fbm(cu + 3, su + lat * 2.4, pl.seed, 3);
      v = Math.abs(lat) > 0.72 - n * 0.2 ? 4 : n > 0.56 ? 3 : n > 0.46 ? 2 : 1;
    } else if (pl.rock) {
      const n = fbm(cu * 1.6 + 2, su * 1.6 + lat * 3, pl.seed, 3);
      v = n > 0.6 ? 1 : n > 0.5 ? 2 : n > 0.4 ? 3 : 2;
    } else {
      const n = fbm(cu * 0.8 + 1, su * 0.8 + lat * 1.2, pl.seed, 3);
      const b = lat * pl.bands + (n - 0.5) * 2.2 + Math.sin(lon * 2 + lat * 9) * 0.15;
      v = [1, 2, 3, 4, 3, 2][((Math.floor(b + 20) % 6) + 6) % 6];
      if (Math.hypot(lat - 0.28, Math.sin(lon) * 0.5) < 0.09 && Math.cos(lon) > 0) v = 0; // 큰 폭풍 반점
    }
    return v;
  }

  function drawRing(pl, R, cx, cy, front) {
    const ct = Math.cos(pl.tilt), st = Math.sin(pl.tilt);
    const ext = Math.ceil(R * 2.2);
    for (let y = -ext; y <= ext; y++) for (let x = -ext; x <= ext; x++) {
      const u = x * ct + y * st, v = (-x * st + y * ct) / 0.3;
      if ((v > 0) !== front) continue;
      const d = Math.hypot(u, v) / R;
      if (d < 1.38 || d > 2.1 || (d > 1.66 && d < 1.74)) continue;
      if (front === false && x * x + y * y < R * R) continue;
      const shade = d < 1.66 ? 0.95 : 0.7;
      const lit = u < 0 ? 1 : 0.75;
      if (bay(cx + x, cy + y) > 0.85 && d > 1.95) continue;
      ctx.fillStyle = rgbStr([214, 186, 140], shade * lit);
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }

  function drawPlanet(pl, t, ox, oy, zr) {
    const k = zr ** 0.42;
    const R = Math.max(2, Math.round(pl.r * k));
    const span = w + pl.r * 6;
    let bx = pl.fx * w + pl.drift * t * 0.001 - ox * pl.par;
    bx = ((bx + pl.r * 3) % span + span) % span - pl.r * 3;
    // 행성은 위치를 유지하고 크기만 확대율에 따라 바뀐다 (축소해도 지도 뒤로 숨지 않게).
    const cx = Math.round(bx);
    const cy = Math.round(pl.fy * h - oy * pl.par);
    if (cx < -R * 3 || cx > w + R * 3) return;
    if (pl.ring) drawRing(pl, R, cx, cy, false);
    const L = [-0.62, -0.48, 0.62];
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d2 = x * x + y * y;
      if (d2 > R * R + R * 0.5) continue;
      const nx = x / R, ny = y / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const light = nx * L[0] + ny * L[1] + nz * L[2];
      const step = light + (bay(cx + x, cy + y) - 0.5) * 0.3;
      const k = step < -0.05 ? 0.16 : step < 0.25 ? 0.42 : step < 0.6 ? 0.72 : 1;
      const v = planetColor(pl, nx, ny, nz, t);
      ctx.fillStyle = rgbStr(pl.pal[v], k);
      ctx.fillRect(cx + x, cy + y, 1, 1);
      if (pl.atmo && d2 > (R - 1.3) ** 2 && light > -0.1) { ctx.fillStyle = pl.atmo; ctx.globalAlpha = 0.65; ctx.fillRect(cx + x, cy + y, 1, 1); ctx.globalAlpha = 1; }
    }
    if (pl.atmo) { // 바깥 대기 글로우
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pl.atmo;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        if (Math.cos(ang) * L[0] + Math.sin(ang) * L[1] < -0.2) continue;
        ctx.fillRect(Math.round(cx + Math.cos(ang) * (R + 1.5)), Math.round(cy + Math.sin(ang) * (R + 1.5)), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (pl.ring) drawRing(pl, R, cx, cy, true);
  }

  function spawnMeteor(t) {
    const dir = r() < 0.75 ? -1 : 1;
    const speed = 90 + r() * 110;
    const ang = (0.28 + r() * 0.35);
    meteors.push({
      x: dir < 0 ? w * (0.35 + r() * 0.75) : w * (r() * 0.6), y: -4 + r() * h * 0.25,
      vx: Math.cos(ang) * speed * dir, vy: Math.sin(ang) * speed,
      born: t, life: 700 + r() * 900, len: 8 + Math.floor(r() * 16), bright: r() < 0.25,
    });
    nextMeteor = t + 900 + r() * 3800;
    if (r() < 0.12) nextMeteor = t + 140; // 가끔 연달아 떨어진다
  }

  function drawMeteors(t) {
    if (t > nextMeteor) spawnMeteor(t);
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const age = t - m.born;
      if (age > m.life) { meteors.splice(i, 1); continue; }
      const k = age / m.life;
      const fade = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      const hx = m.x + (m.vx * age) / 1000, hy = m.y + (m.vy * age) / 1000;
      const sp = Math.hypot(m.vx, m.vy), dx = m.vx / sp, dy = m.vy / sp;
      for (let j = m.len; j >= 0; j--) {
        const qx = Math.round(hx - dx * j), qy = Math.round(hy - dy * j);
        const f = 1 - j / m.len;
        if (bay(qx, qy) > f * fade + 0.05) continue;
        ctx.fillStyle = j < 1 ? '#ffffff' : j < 3 ? '#fff4d6' : j < 7 ? (m.bright ? '#ffc98a' : '#bfe9ff') : (m.bright ? '#b0603a' : '#4f7fa8');
        ctx.fillRect(qx, qy, 1, 1);
      }
      if (m.bright && fade > 0.6) {
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = '#fff4d6';
        ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 3, 1);
        ctx.fillRect(Math.round(hx), Math.round(hy) - 1, 1, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawSatellite(t) {
    const span = w + 20;
    const x = Math.round(((t * 0.001 * sat.speed + sat.ph * span) % span) - 10);
    const y = Math.round(h * sat.y - x * 0.08);
    ctx.fillStyle = '#9aa3b5';
    ctx.fillRect(x, y, 1, 1);
    if (Math.floor(t / 600) % 3 === 0) { ctx.fillStyle = '#ff5468'; ctx.fillRect(x + 1, y, 1, 1); }
  }

  return {
    draw(t, ox, oy, zoom = 0.9) {
      // ox, oy: 월드 카메라가 중앙에서 벗어난 거리(월드 px), zoom: 월드 확대율
      // 확대할수록 가까운 층이 더 크게 벌어져 깊이감이 생긴다 (먼 성운은 조금, 가까운 별·행성은 많이).
      const zr = zoom / 0.9;
      const nk = zr ** 0.1;
      const nx = Math.round(ox * 0.025), ny = Math.round(oy * 0.025);
      const dw = neb.width * nk, dh = neb.height * nk;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(neb, Math.round(w / 2 - dw / 2 - nx * nk), Math.round(h / 2 - dh / 2 - ny * nk), Math.round(dw), Math.round(dh));
      drawStars(t, ox, oy, zr);
      drawSatellite(t);
      for (const pl of PLANETS) drawPlanet(pl, t, ox, oy, zr);
      drawMeteors(t);
    },
  };
}
