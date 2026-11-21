// 이동관리국 심사관: 정면 상반신 룩이 숨을 쉰다.
// 파츠(PNG)를 부위별로 조금씩 늦게 들어 올리고, 위치는 화면 픽셀 단위로 미끄러져 부드럽다.
// pixelfx로 눈빛(glow)과 내쉴 때 목 옆 통풍구의 김(disc)을 얹는다.
import { createFrame, clearFrame, composite, painterFor, hex } from './vendor/pixelfx/core/index.js';

const BASE = new URL('../assets/sprites/rook/bust/', import.meta.url);
const PAD = 14;

export function createOfficer(canvas, { theme = 'black', zoom: zoomOpt = 4, fps = 60, vapor: useVapor = true, isActive = () => true, getMood = () => 'idle' } = {}) {
  let data = null, parts = {}, ctx = null, zoom = 0;
  const getZoom = typeof zoomOpt === 'function' ? zoomOpt : () => zoomOpt;
  // 화면 1px = 캔버스 1px. 도트 한 칸이 zoom×zoom 정수 블록이 되어 홀 배경과 같은 격자를 쓴다
  function fit() {
    const z = getZoom();
    if (z === zoom || !data) return;
    zoom = z;
    canvas.width = (data.w + PAD * 2) * zoom; canvas.height = (data.h + PAD * 2) * zoom;
    canvas.style.width = canvas.width + 'px'; canvas.style.height = canvas.height + 'px';
    ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  }
  let frame, glowF, img, gimg, small, gsmall;
  let clock = 0, last = 0, lastDraw = 0, lastBreath = 0, raf = 0;
  const vapor = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const ready = (async () => {
    const base = new URL(theme + '/', BASE);
    data = await (await fetch(new URL('parts.json', base))).json();
    await Promise.all(data.layers.map(name => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { parts[name] = im; res(); };
      im.onerror = rej;
      im.src = new URL(name + '.png', base).href;
    })));
    const W = data.w + PAD * 2, H = data.h + PAD * 2;
    frame = createFrame(W, H); glowF = createFrame(W, H);
    img = new ImageData(W, H); gimg = new ImageData(W, H);
    small = Object.assign(document.createElement('canvas'), { width: W, height: H });
    gsmall = Object.assign(document.createElement('canvas'), { width: W, height: H });
    fit();
    draw(0);
  })().catch(e => console.warn('officer sprite', e));

  // 0(내쉼) ~ 1(들이쉼)
  const breathAt = (t, delay) => {
    const p = (((t / data.breath.cycle) - delay) % 1 + 1) % 1;
    return 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
  };

  function draw(dt) {
    const w = data.w;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let headY = 0;
    for (const name of data.layers) {
      const b = data.breath.parts[name] || { amp: 0, delay: 0 };
      const dy = Math.round(-breathAt(clock, b.delay) * b.amp * zoom) / zoom;
      if (name === 'head') headY = dy;
      ctx.drawImage(parts[name], PAD * zoom, Math.round((PAD + dy) * zoom), w * zoom, data.h * zoom);
    }
    const breath = breathAt(clock, 0);

    // 눈빛: 심사 중엔 더 밝고, 판정에 따라 조금 더 세진다
    clearFrame(glowF);
    const gp = painterFor(glowF), eyeC = hex(data.eyeColor);
    const mood = getMood();
    const boost = mood === 'scanning' ? 1.5 : mood === 'idle' ? 1 : 1.3;
    for (const g of [data.eyes.filter(e => e[0] < w / 2), data.eyes.filter(e => e[0] >= w / 2)]) {
      if (!g.length) continue;
      const cx = g.reduce((s, e) => s + e[0], 0) / g.length + 0.5 + PAD;
      const cy = g.reduce((s, e) => s + e[1], 0) / g.length + 0.5 + PAD + headY;
      gp.glow(cx, cy, 7, eyeC, (0.16 + 0.2 * breath) * boost);
      gp.glow(cx, cy, 2.5, eyeC, (0.22 + 0.25 * breath) * boost);
    }
    composite(glowF, gimg.data, null);
    gsmall.getContext('2d').putImageData(gimg, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(gsmall, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // 김: 내쉬기 시작할 때 목 양옆 통풍구에서
    if (!useVapor) return;
    if (lastBreath > 0.9 && breath <= 0.9) {
      for (const [vx, vy] of data.vents) {
        const side = vx < w / 2 ? -1 : 1;
        for (let k = 0; k < 7; k++) vapor.push({ x: vx + PAD + 0.5, y: vy + PAD, vx: side * (2 + rnd() * 5), vy: -(3 + rnd() * 6), life: 0, max: 1.2 + rnd(), r: 0.8 + rnd() * 1.2, d: k * 0.09 });
      }
    }
    lastBreath = breath;
    if (!vapor.length) return;
    clearFrame(frame);
    const p = painterFor(frame), vc = hex(theme === 'white' ? '#dfe9ee' : '#c9c3d6');
    for (let i = vapor.length - 1; i >= 0; i--) {
      const q = vapor[i];
      if (q.d > 0) { q.d -= dt; continue; }
      q.life += dt;
      if (q.life > q.max) { vapor.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.97; q.vy *= 0.985;
      const f = q.life / q.max;
      p.disc(q.x, q.y, q.r + f * 2.2, vc, 0.4 * (1 - f) * Math.min(1, q.life * 5));
    }
    composite(frame, img.data, null);
    small.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  }

  // 화면에 보일 때만 돈다
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!data || !isActive()) { last = now; return; }
    fit();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    clock += dt;
    if (now - lastDraw < 1000 / fps - 2) return;
    draw(Math.min(0.1, (now - lastDraw) / 1000)); lastDraw = now;
  }
  raf = requestAnimationFrame(t => { last = lastDraw = t; loop(t); });

  return {
    ready,
    destroy() { cancelAnimationFrame(raf); },
  };
}
