// 행성 밖에 떠 있는 승급소 2곳과, 양 끝 줄 발착장에서 오가는 우주선.
// 시각 연출 시안이다. 승급 조건·절차는 아직 구현하지 않았고 세계관에서도 미확정이다.
// 형태는 사용자 참고 이미지(구름 위 절벽의 고딕 첨탑, 원형 광장과 빛기둥, 착륙대가 있는 옆 탑)를 따른다.
import { drawShip, drawPromoTower, drawIsland, drawObelisk, drawDockTower, drawCypress, drawCloud, drawCliffWall } from './sprites.js';
import { rng } from './noise.js';

const ISLE = 256;   // 승급소 칸 크기(월드 px)
const TEX = 128;    // 바닥 텍스처 크기
const DEPTH = 128;  // 절벽 깊이
const DOCK_H = 139; // 도킹 탑 높이(css px)
const DOCK_TOP = DOCK_H * (1 - 4 / 58); // 착륙판 높이

const toTex = v => v * (TEX / ISLE) + TEX / 2;

function rotated(src) {
  const c = document.createElement('canvas');
  c.width = src.height; c.height = src.width;
  const x = c.getContext('2d');
  x.translate(0, src.width);
  x.rotate(-Math.PI / 2);
  x.drawImage(src, 0, 0);
  return c;
}

export function createStations({ worldEl, piecesEl, CELL, SIZE, S, pads }) {
  const r = rng(4242);
  const tilt = 42 * Math.PI / 180;
  const sides = {
    top: { theme: 'white', x: SIZE / 2, y: -2.9 * CELL, ph: 0, dy: 1 },
    bottom: { theme: 'black', x: SIZE / 2, y: SIZE + 2.9 * CELL, ph: 2.1, dy: -1 },
  };

  for (const [side, st] of Object.entries(sides)) {
    const th = st.theme;
    const lay = { tower: [0, -46], plaza: [0, 40], docks: [[-90, 90 * st.dy], [90, 90 * st.dy]] };
    st.docks = lay.docks;
    const g = document.createElement('div');
    g.className = `station station-${th}`;
    g.innerHTML = `
      <div class="isle" style="width:${ISLE}px;height:${ISLE}px;left:${-ISLE / 2}px;top:${-ISLE / 2}px">
        <canvas class="isle-floor"></canvas>
        <div class="isle-face s"></div><div class="isle-face w"></div><div class="isle-face e"></div>
      </div>`;
    drawIsland(g.querySelector('.isle-floor'), th, {
      tower: lay.tower.map(toTex), plaza: lay.plaza.map(toTex), docks: lay.docks.map(d => d.map(toTex)),
    });
    const wallS = drawCliffWall(document.createElement('canvas'), th, 128, 64, 3);
    g.querySelector('.isle-face.s').append(wallS);
    for (const [k, seed] of [['w', 5], ['e', 8]]) g.querySelector('.isle-face.' + k).append(rotated(drawCliffWall(document.createElement('canvas'), th, 128, 64, seed)));

    // 빌보드 배치 (y가 작은 것부터 = 먼 것부터)
    const bbs = [];
    const add = (cls, x, y, w, h, canvas, z = 0, extra = '') => {
      const el = document.createElement('div');
      el.className = 'bb ' + cls;
      el.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
      el.innerHTML = `<div class="stand" style="width:${w}px;height:${h}px">${extra}</div>`;
      if (canvas) el.querySelector('.stand').append(canvas);
      bbs.push({ el, y });
      return el;
    };
    const mk = () => document.createElement('canvas');
    add('tower', lay.tower[0], lay.tower[1], 135, 442, drawPromoTower(mk(), th), 0,
      `<span class="tower-tag">${th === 'white' ? '백' : '흑'} 승급소 · PROMOTION</span>`);
    add('obelisk', lay.plaza[0], lay.plaza[1], 29, 114, drawObelisk(mk(), th), 0, '<div class="beam"></div><div class="halo"></div>');
    for (const [dx, dy] of lay.docks) add('docktower', dx, dy, 53, DOCK_H, drawDockTower(mk(), th));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      const cx = lay.plaza[0] + Math.cos(a) * 72, cy = lay.plaza[1] + Math.sin(a) * 72;
      add('cypress', cx, cy, 22, 62, drawCypress(mk(), th, i));
    }
    // 테두리 모서리 사이프러스
    for (const [x, y] of [[-112, -112], [112, -112], [-112, 30], [112, 30]]) add('cypress', x, y, 22, 62, drawCypress(mk(), th, x + y));
    bbs.sort((a, b) => a.y - b.y).forEach(b => g.append(b.el));

    // 구름: 섬 아래와 가장자리에 흘러간다
    st.clouds = [];
    const spots = [[-170, -60, -30], [175, 20, -40], [-120, 140, -70], [130, 150, -60], [0, 175, -110], [-210, 90, -140], [215, -110, -120], [60, -150, -90]];
    spots.forEach(([x, y, z], i) => {
      const w = 216 * (0.75 + (i % 3) * 0.2);
      const el = add('cloud', x, y, w, w * 32 / 72, drawCloud(mk(), th, i + (side === 'top' ? 1 : 11)), z);
      g.append(el);
      st.clouds.push({ el, x, y, z, ph: i * 1.7, amp: 10 + (i % 4) * 6 });
    });

    worldEl.append(g);
    st.el = g;
    st.z = 40;
  }

  // 우주선
  const frames = {};
  for (const th of ['white', 'black']) frames[th] = [0, 1, 2].map(f => drawShip(document.createElement('canvas'), th, f).toDataURL());
  const ships = pads.map(p => {
    const theme = sides[p.side].theme;
    const el = document.createElement('div');
    el.className = 'ship';
    el.innerHTML = '<div class="shadow"></div><div class="stand"><img alt=""></div>';
    const img = el.querySelector('img');
    img.src = frames[theme][0];
    piecesEl.append(el);
    const s = { el, img, theme, side: p.side, x0: p.x * S, y0: p.y * S, state: 'idle', t0: 0, x: p.x * S, y: p.y * S, z: 0 };
    place(s);
    return s;
  });

  const setSrc = (s, src) => { if (s.src !== src) { s.src = src; s.img.src = src; } };
  function place(s, lean = 0) {
    s.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, ${s.z.toFixed(1)}px)`;
    s.img.style.setProperty('--lean', lean.toFixed(1) + 'deg');
  }

  const ease = k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const dockZ = DOCK_TOP * Math.sin(tilt);
  let nextLaunch = 1500;

  function launch(t) {
    const idle = ships.filter(s => s.state === 'idle');
    if (!idle.length) return;
    const s = idle[Math.floor(r() * idle.length)];
    const st = sides[s.side];
    s.state = 'ignite';
    s.t0 = t;
    const [dx, dy] = st.docks[s.x0 < st.x ? 0 : 1];
    // 빌보드 꼭대기는 화면 위쪽(-y)과 위(+z)로 함께 올라간다
    s.dock = { x: st.x + dx, y: st.y + dy - DOCK_TOP * Math.cos(tilt) };
    s.cruise = 1600 + Math.hypot(s.dock.x - s.x0, s.dock.y - s.y0) * 0.9;
    s.el.classList.add('flying');
  }

  function updateShip(s, t) {
    const st = sides[s.side];
    const age = t - s.t0;
    const flame = frames[s.theme][1 + (Math.floor(t / 70) % 2)];
    const land = st.z + dockZ;
    switch (s.state) {
      case 'idle': return;
      case 'ignite': {
        setSrc(s, flame);
        s.x = s.x0 + (Math.random() - 0.5) * 2;
        if (age > 700) { s.state = 'ascent'; s.t0 = t; }
        break;
      }
      case 'ascent': {
        const k = Math.min(1, age / 1300);
        setSrc(s, flame);
        s.x = s.x0;
        s.z = k * k * 170;
        if (k >= 1) { s.state = 'cruise'; s.t0 = t; }
        break;
      }
      case 'cruise': {
        const k = Math.min(1, age / s.cruise), e = ease(k);
        setSrc(s, flame);
        s.x = s.x0 + (s.dock.x - s.x0) * e;
        s.y = s.y0 + (s.dock.y - s.y0) * e;
        s.z = 170 + (land + 90 - 170) * e + Math.sin(Math.PI * k) * 90;
        place(s, Math.max(-28, Math.min(28, (s.dock.x - s.x0) / 40)) * Math.sin(Math.PI * k));
        if (k >= 1) { s.state = 'dock'; s.t0 = t; }
        return;
      }
      case 'dock': {
        const k = Math.min(1, age / 1300);
        setSrc(s, k < 0.75 ? flame : frames[s.theme][0]);
        s.x = s.dock.x; s.y = s.dock.y;
        s.z = land + 90 * (1 - ease(Math.min(1, k / 0.8)));
        s.el.style.opacity = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
        if (k >= 1) { s.state = 'away'; s.t0 = t; s.wait = 5000 + r() * 7000; s.el.style.opacity = 0; }
        break;
      }
      case 'away': {
        if (age > s.wait) {
          s.state = 'return'; s.t0 = t;
          s.x = s.x0; s.y = s.y0; s.z = 0;
          setSrc(s, frames[s.theme][0]);
          s.el.classList.remove('flying');
        }
        break;
      }
      case 'return': {
        const k = Math.min(1, age / 700);
        s.el.style.opacity = k;
        if (k >= 1) { s.state = 'idle'; s.el.style.opacity = ''; }
        break;
      }
    }
    place(s);
  }

  return {
    update(t) {
      for (const st of Object.values(sides)) {
        st.z = 40 + Math.sin(t * 0.0009 + st.ph) * 9;
        st.el.style.transform = `translate3d(${st.x}px, ${st.y}px, ${st.z.toFixed(1)}px)`;
        for (const c of st.clouds) {
          const ox = Math.sin(t * 0.00012 + c.ph) * c.amp;
          c.el.style.transform = `translate3d(${(c.x + ox).toFixed(1)}px, ${c.y}px, ${(c.z - (st.z - 40)).toFixed(1)}px)`;
        }
      }
      if (t > nextLaunch) { launch(t); nextLaunch = t + 1800 + r() * 3200; }
      for (const s of ships) if (s.state !== 'idle') updateShip(s, t);
    },
  };
}
