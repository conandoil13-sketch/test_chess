// 체시언 임시 마커를 코드로 그린 20×30 도트 스프라이트.
// 상반신(유기체) + 팔각 기계 하반신 + 여러 다리. 최종 캐릭터 디자인이 아니다.
const SW = 20, SH = 30;

const PAL = {
  white: { hi: '#fffdf5', base: '#e6dfcd', shade: '#a99f8b', metal: '#8f8b85', metalHi: '#bdb9b1', metalDark: '#5a5853', line: '#16130e', eye: '#2ee6ff' },
  black: { hi: '#8e8ea6', base: '#4b4b5c', shade: '#2d2d39', metal: '#3c3d47', metalHi: '#646777', metalDark: '#202129', line: '#040406', eye: '#ff4d6a' },
};
const GOLD = { hi: '#ffe39a', base: '#e2b449', shade: '#9c7426' };

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function drawChecian(canvas, rank, color = 'white') {
  canvas.width = SW;
  canvas.height = SH;
  const g = new Uint8Array(SW * SH);
  const set = (x, y, v = 1) => { if (x >= 1 && x < SW - 1 && y >= 1 && y < SH - 1) g[y * SW + x] = v; };
  const get = (x, y) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : g[y * SW + x]);
  const rect = (x, y, w, h, v = 1) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, v); };
  const disc = (cx, cy, r, v = 1) => {
    for (let j = Math.floor(cy - r); j <= cy + r; j++)
      for (let i = Math.floor(cx - r); i <= cx + r; i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r + 0.5) set(i, j, v);
  };
  const line = (x0, y0, x1, y1, v) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) set(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), v);
  };

  // 다리와 팔각 하반신 (기계)
  line(7, 23, 3, 28, 3); line(8, 24, 6, 28, 3); line(11, 24, 13, 28, 3); line(12, 23, 16, 28, 3);
  rect(6, 20, 8, 1, 3); rect(5, 21, 10, 3, 3); rect(6, 24, 8, 1, 3);
  // 허리·어깨·목 (유기체)
  rect(7, 17, 6, 3); rect(6, 14, 8, 3); rect(8, 12, 4, 2);

  switch (rank) {
    case 'pawn':
      disc(9.5, 9, 3.2); set(8, 9, 4); set(11, 9, 4); break;
    case 'knight':
      rect(7, 5, 6, 8); rect(4, 7, 4, 3); set(4, 10); set(5, 10);
      set(8, 4); set(11, 4); set(12, 3); rect(12, 6, 1, 6, 2); set(7, 7, 4); break;
    case 'rook':
      rect(6, 5, 8, 8); rect(6, 3, 2, 2); rect(9, 3, 2, 2); rect(12, 3, 2, 2); rect(7, 8, 6, 1, 4); break;
    case 'bishop':
      disc(9.5, 9, 3.2); rect(8, 4, 4, 2); rect(9, 3, 2, 1); set(9, 2); set(10, 2);
      set(11, 5, 0); set(10, 6, 0); set(8, 10, 4); set(11, 10, 4); rect(7, 12, 6, 1, 5); break;
    case 'queen':
      disc(9.5, 9.5, 3.2); rect(6, 5, 8, 2, 5);
      set(6, 4, 5); set(6, 3, 5); set(9, 3, 5); set(10, 3, 5); set(9, 2, 5); set(10, 2, 5); set(13, 4, 5); set(13, 3, 5);
      set(8, 10, 4); set(11, 10, 4); break;
    case 'king':
      disc(9.5, 9.5, 3.2); rect(7, 5, 6, 2, 5); rect(9, 1, 2, 4, 5); rect(8, 2, 4, 1, 5);
      set(8, 10, 4); set(11, 10, 4); break;
  }

  const P = PAL[color];
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SW, SH);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const v = get(x, y);
      let c = null;
      if (v) {
        const r = !get(x + 1, y), l = !get(x - 1, y), top = !get(x, y - 1);
        if (v === 1) c = r || (x > 10 && !get(x + 2, y)) ? P.shade : l || top ? P.hi : P.base;
        else if (v === 2) c = P.shade;
        else if (v === 3) c = r ? P.metalDark : top || l ? P.metalHi : P.metal;
        else if (v === 4) c = P.eye;
        else if (v === 5) c = r ? GOLD.shade : top ? GOLD.hi : GOLD.base;
      } else if (get(x + 1, y) || get(x - 1, y) || get(x, y + 1) || get(x, y - 1)) {
        c = P.line;
      }
      if (c) {
        const [rr, gg, bb] = rgb(c);
        const o = (y * SW + x) * 4;
        img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const cache = new Map();
export function spriteURL(rank, color) {
  const key = rank + ':' + color;
  if (!cache.has(key)) cache.set(key, drawChecian(document.createElement('canvas'), rank, color).toDataURL());
  return cache.get(key);
}

// ---------- 승급소 · 우주선 (시각 시안) ----------
// 값: 1 본체, 3 금속/테두리, 4 발광, 5 강조색(금/보라), 6 어두운 내부, 7 불꽃 심, 8 불꽃 바깥
const THEME = {
  white: { hi: '#ffffff', base: '#e9e3d2', shade: '#aca38d', m: '#7a7468', mHi: '#a39d90', mDark: '#4f4a42', line: '#17140f', glow: '#fff1b0', acc: ['#ffe39a', '#e2b449', '#9c7426'], dark: '#2a2219' },
  black: { hi: '#8d88a8', base: '#4e4a62', shade: '#302d40', m: '#3a3648', mHi: '#5c5672', mDark: '#1f1c28', line: '#06050a', glow: '#ead6ff', acc: ['#e3ccff', '#b48cff', '#6c4bb0'], dark: '#120f1a' },
};

function renderGrid(canvas, g, W, H, T) {
  canvas.width = W; canvas.height = H;
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : g[y * W + x]);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = get(x, y);
    let c = null;
    if (v) {
      const r = get(x + 1, y) !== v, l = get(x - 1, y) !== v, top = get(x, y - 1) !== v;
      const rr = !get(x + 2, y) || !get(x + 3, y);
      if (v === 1) c = r || rr ? T.shade : l || top ? T.hi : T.base;
      else if (v === 3) c = r || rr ? T.mDark : l || top ? T.mHi : T.m;
      else if (v === 4) c = T.glow;
      else if (v === 5) c = r || rr ? T.acc[2] : l || top ? T.acc[0] : T.acc[1];
      else if (v === 6) c = T.dark;
      else if (v === 7) c = '#f2fdff';
      else if (v === 8) c = top ? '#9fe8ff' : '#4f8dff';
      else if (v === 9) c = r || rr ? T.leaf[2] : l || top ? T.leaf[0] : T.leaf[1];
    } else if (get(x + 1, y) || get(x - 1, y) || get(x, y + 1) || get(x, y - 1)) {
      const nb = [get(x + 1, y), get(x - 1, y), get(x, y + 1), get(x, y - 1)];
      if (!nb.every(n => n === 0 || n === 7 || n === 8)) c = T.line;
    }
    if (c) {
      const [a, b, d] = rgb(c);
      const o = (y * W + x) * 4;
      img.data[o] = a; img.data[o + 1] = b; img.data[o + 2] = d; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function gridTools(W, H) {
  const g = new Uint8Array(W * H);
  const set = (x, y, v) => { if (x >= 1 && x < W - 1 && y >= 1 && y < H - 1) g[y * W + x] = v; };
  const rect = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, v); };
  const disc = (cx, cy, r, v) => { for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r + 0.5) set(i, j, v); };
  return { g, set, rect, disc };
}

// 14×30 우주선: 고딕 첨탑을 닮은 로켓. 바늘 기수, 첨두창, 버팀벽 모양 날개. frame: 0 정지, 1·2 분사
export function drawShip(canvas, theme, frame = 0) {
  const W = 14, H = 30;
  const { g, set, rect } = gridTools(W, H);
  const both = (x, y, w, h, v) => { rect(x, y, w, h, v); rect(W - x - w, y, w, h, v); };
  rect(6, 1, 2, 2, 5);               // 꼭대기 장식
  rect(6, 3, 2, 3, 1);               // 바늘 기수
  rect(5, 6, 4, 3, 1);
  both(4, 6, 1, 2, 3);               // 작은 피너클
  rect(4, 8, 6, 1, 5);               // 왕관 띠
  rect(4, 9, 6, 11, 1);              // 몸체
  rect(6, 10, 2, 3, 4);              // 장미창
  both(5, 14, 1, 4, 4);              // 첨두 슬릿
  rect(3, 19, 8, 1, 5);              // 허리 띠
  rect(4, 20, 6, 3, 1);
  // 버팀벽 날개
  both(3, 15, 1, 3, 3); both(2, 18, 1, 2, 3); both(1, 20, 1, 4, 3); both(2, 13, 1, 3, 3);
  set(2, 12, 3); set(W - 3, 12, 3);
  rect(5, 23, 4, 2, 3);              // 엔진
  if (frame) {
    const len = frame === 1 ? 5 : 4;
    rect(5, 25, 4, 1, 7); rect(6, 26, 2, 1, 7);
    rect(5, 26, 1, len - 1, 8); rect(8, 26, 1, len - 2, 8); rect(6, 27, 2, len - 1, 8);
  }
  return renderGrid(canvas, g, W, H, GOTHIC[theme]);
}

// ---------- 승급소 (고딕 첨탑 시안) ----------
// 회색 돌, 하얗게 빛나는 첨두창, 수많은 작은 첨탑. 백은 밝은 돌, 흑은 어두운 보랏빛 돌.
const GOTHIC = {
  white: { hi: '#f2f0f6', base: '#c4c2cc', shade: '#85838f', m: '#a3a1ad', mHi: '#d8d6de', mDark: '#64626e', line: '#14131b', glow: '#eef9ff', acc: ['#ffffff', '#cfe8ff', '#7fa9d6'], dark: '#1a1f2c', leaf: ['#4f7a52', '#2f5236', '#1b3022'] },
  black: { hi: '#8a84a0', base: '#585467', shade: '#35313f', m: '#48445a', mHi: '#6b6680', mDark: '#24202e', line: '#05040a', glow: '#eadcff', acc: ['#f4e9ff', '#b48cff', '#6c4bb0'], dark: '#0f0c17', leaf: ['#3f5a4e', '#253a33', '#141f1c'] },
};

// 52×170 고딕 첨탑. 위로 갈수록 좁아지는 5단과 바늘 첨탑.
export function drawPromoTower(canvas, theme) {
  const W = 52, H = 170, cx = 25.5;
  const { g, set, rect, disc } = gridTools(W, H);
  const band = (y0, y1, hw, v) => {
    for (let y = y0; y <= y1; y++) {
      const h = typeof hw === 'function' ? hw(y) : hw;
      const a = Math.round(cx - h), b = Math.round(cx + h);
      rect(a, y, b - a, 1, v);
    }
  };
  const mir = (x, w) => W - x - w;
  // 첨두창: 폭 w, y0 꼭짓점 ~ y1
  const lancet = (x, w, y0, y1) => {
    for (const xx of [x, mir(x, w)]) {
      if (w >= 3) rect(xx + 1, y0, w - 2, 1, 4);
      rect(xx, y0 + (w >= 3 ? 1 : 0), w, y1 - y0, 4);
    }
  };
  // 작은 첨탑(피너클): 뾰족한 끝 + 2px 몸통
  const pin = (x, yTop, yBot) => {
    for (const xx of [x, mir(x, 2)]) {
      rect(xx + (xx < cx ? 1 : 0), yTop, 1, 3, 1);
      rect(xx, yTop + 3, 2, yBot - yTop - 3, 1);
      for (let y = yTop + 8; y < yBot - 4; y += 9) set(xx + (xx < cx ? -1 : 2), y, 1); // 크로켓 돌기
    }
  };
  // 단 꼭대기의 뾰족한 톱니
  const crown = (y, hw) => {
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    for (let x = a; x < b; x++) if ((x - a) % 3 === 1 || x === a || x === b - 1) { set(x, y - 1, 1); if ((x - a) % 6 === 1) set(x, y - 2, 1); }
  };

  // 바늘 첨탑과 꼭대기 빛
  disc(cx, 3, 1.6, 4);
  band(5, 22, y => 0.6 + ((y - 5) / 17) * 2.6, 1);
  rect(25, 9, 2, 3, 4);
  band(16, 17, 3.6, 3);
  // T1
  crown(23, 5); band(23, 43, 5, 1);
  lancet(25, 2, 27, 39);
  pin(19, 16, 43);
  band(43, 44, 7, 3);
  // T2
  crown(45, 8); band(45, 71, 8, 1);
  lancet(20, 3, 50, 67);
  rect(25, 53, 2, 10, 4);
  pin(15, 36, 71);
  band(71, 72, 10.5, 3);
  // T3
  crown(73, 11); band(73, 103, 11, 1);
  lancet(17, 3, 79, 99);
  lancet(24, 4, 76, 100);
  pin(12, 62, 103);
  band(103, 104, 13.5, 3);
  // T4 + 버팀벽
  crown(105, 14); band(105, 135, 14, 1);
  lancet(14, 3, 111, 131);
  lancet(20, 3, 109, 131);
  rect(25, 108, 2, 6, 4);
  pin(9, 94, 135);
  for (const x of [9, mir(9, 2)]) rect(x - (x < cx ? 1 : -1), 120, 2, 15, 1);
  band(135, 136, 17, 3);
  // T5 기단부: 장미창, 정문, 측창
  crown(137, 18); band(137, 163, 18, 1);
  disc(cx, 142, 3.4, 4); set(25, 142, 6); set(26, 142, 6); set(25, 139, 6); set(26, 145, 6);
  rect(22, 150, 8, 14, 6); rect(23, 148, 6, 2, 6); rect(24, 147, 4, 1, 6);
  rect(24, 152, 4, 1, 4);
  lancet(12, 3, 143, 159);
  lancet(17, 2, 141, 157);
  pin(5, 118, 163);
  for (const x of [6, mir(6, 3)]) rect(x, 138, 3, 26, 1);
  band(164, 167, 20.5, 3);
  return renderGrid(canvas, g, W, H, GOTHIC[theme]);
}

// 9×44 빛기둥 분수(광장 중앙)
export function drawObelisk(canvas, theme) {
  const W = 11, H = 44;
  const { g, rect, set } = gridTools(W, H);
  set(5, 2, 4); rect(5, 3, 1, 3, 4);
  rect(4, 6, 3, 28, 1); rect(5, 7, 1, 26, 4);
  rect(3, 33, 5, 2, 3);
  rect(2, 35, 7, 2, 1);
  rect(1, 37, 9, 4, 3); rect(2, 38, 7, 1, 4);
  return renderGrid(canvas, g, W, H, GOTHIC[theme]);
}

// 20×58 도킹 탑: 꼭대기에 우주선이 내려앉는 착륙판
export function drawDockTower(canvas, theme) {
  const W = 22, H = 58, cx = 10.5;
  const { g, rect, set } = gridTools(W, H);
  const band = (y0, y1, hw, v) => { for (let y = y0; y <= y1; y++) { const h = typeof hw === 'function' ? hw(y) : hw; const a = Math.round(cx - h), b = Math.round(cx + h); rect(a, y, b - a, 1, v); } };
  band(3, 5, 10, 3);
  for (const x of [1, 5, 16, 20]) set(x, 3, 4);
  band(6, 11, y => 9 - (y - 6) * 1.1, 3);
  band(12, 50, y => 3 + ((y - 12) / 38) * 1.5, 1);
  for (let y = 16; y < 46; y += 8) rect(10, y, 2, 4, 4);
  rect(4, 18, 2, 2, 3); rect(16, 18, 2, 2, 3);
  band(51, 55, 6, 3);
  return renderGrid(canvas, g, W, H, GOTHIC[theme]);
}

// 8×26 사이프러스
export function drawCypress(canvas, theme, seed = 0) {
  const W = 9, H = 26, cx = 4.5;
  const { g, rect } = gridTools(W, H);
  for (let y = 1; y < 22; y++) {
    const k = (y - 1) / 21;
    const h = Math.max(0.6, Math.min(3.2, k < 0.35 ? k * 9 : 3.2 - (k - 0.75) * (k > 0.75 ? 8 : 0)));
    const wob = ((y + seed) % 5 === 0) ? 0.6 : 0;
    const a = Math.round(cx - h - wob), b = Math.round(cx + h);
    rect(a, y, b - a, 1, 9);
  }
  rect(4, 22, 1, 3, 3);
  return renderGrid(canvas, g, W, H, GOTHIC[theme]);
}

// 72×32 도트 구름(반투명 디더, 위가 밝고 아래가 어두운 뭉게구름)
export function drawCloud(canvas, theme, seed = 1) {
  const W = 72, H = 32;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const blobs = [];
  for (let i = 0; i < 6; i++) { const x = 12 + i * 9.5 + rnd() * 4; const mid = 1 - Math.abs(i - 2.5) / 3; blobs.push({ x, y: 22 - mid * 6 - rnd() * 3, r: 6 + mid * 6 + rnd() * 3 }); }
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const P = theme === 'white' ? ['#ffffff', '#e3e7f1', '#b8bfd2', '#868ca3'] : ['#b9b0d4', '#8f86ab', '#635b80', '#3f3858'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y > 27) continue; // 바닥은 평평하게
    let d = 0, top = 1;
    for (const b of blobs) {
      const v = 1 - Math.hypot(x - b.x, y - b.y) / b.r;
      if (v > d) { d = v; top = (y - (b.y - b.r)) / (2 * b.r); }
    }
    if (d <= 0) continue;
    const th = bayer[(y % 4) * 4 + (x % 4)] / 16;
    if (d < 0.18 && d / 0.18 < th) continue;
    const yy = y / 28;
    const k = top * 0.55 + yy * 0.55;
    c.fillStyle = k < 0.42 ? P[0] : k < 0.62 ? P[1] : k < 0.8 ? P[2] : P[3];
    c.fillRect(x, y, 1, 1);
  }
  return canvas;
}

// 128×128 승급소 바닥: 돌 타일, 원형 광장, 난간, 도킹 패드
// lay: { tower:[x,y], plaza:[x,y], docks:[[x,y],...] } (텍스처 좌표)
export function drawIsland(canvas, theme, lay) {
  const W = 128;
  canvas.width = W; canvas.height = W;
  const c = canvas.getContext('2d');
  const T = theme === 'white'
    ? { t1: '#b6b4bf', t2: '#aeacb8', t3: '#bebcc6', grout: '#8e8c99', path: '#cfcdd6', ring: '#e8e6ee', ringDk: '#777584', glow: '#eef9ff', rail: '#dedce4', railDk: '#6f6d7a', acc: '#cfe8ff', bed: '#3a4a3c' }
    : { t1: '#4a4658', t2: '#443f52', t3: '#504b60', grout: '#2c2837', path: '#5c576d', ring: '#7d7795', ringDk: '#24202e', glow: '#eadcff', rail: '#6c6782', railDk: '#1d1a26', acc: '#c79bff', bed: '#1f2a26' };
  const px = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
  // 돌 타일
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const tx = x >> 3, ty = y >> 3;
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const col = (x & 7) === 7 || (y & 7) === 7 ? T.grout : [T.t1, T.t2, T.t3][h % 3];
    px(x, y, col);
  }
  // 길: 광장 → 탑, 광장 → 도킹 패드
  const [plx, ply] = lay.plaza, [twx, twy] = lay.tower;
  c.fillStyle = T.path;
  c.fillRect(plx - 5, Math.min(twy, ply), 10, Math.abs(ply - twy));
  for (const [dx, dy] of lay.docks) {
    const n = Math.ceil(Math.hypot(dx - plx, dy - ply));
    for (let i = 0; i <= n; i++) { const k = i / n; c.fillRect(Math.round(plx + (dx - plx) * k) - 3, Math.round(ply + (dy - ply) * k) - 3, 6, 6); }
  }
  // 탑 기단 테라스
  c.fillStyle = T.railDk; c.fillRect(twx - 34, twy - 10, 68, 16);
  c.fillStyle = T.ring; c.fillRect(twx - 33, twy - 9, 66, 14);
  c.fillStyle = T.t2; c.fillRect(twx - 31, twy - 7, 62, 10);
  // 원형 광장
  for (let y = -32; y <= 32; y++) for (let x = -32; x <= 32; x++) {
    const d = Math.hypot(x, y);
    if (d > 31.5) continue;
    const a = Math.atan2(y, x);
    let col = null;
    if (d > 29.5) col = T.ring;
    else if (d > 28.5) col = T.ringDk;
    else if (d > 21) col = (Math.abs(((a / (Math.PI / 8)) % 1 + 1) % 1 - 0.5) > 0.44) ? T.ringDk : ((d | 0) % 3 === 0 ? T.t3 : T.t1);
    else if (d > 19.5) col = T.ring;
    else if (d > 13) col = (d | 0) % 2 ? T.t2 : T.path;
    else if (d > 11.5) col = T.ring;
    else if (d > 6.5) col = T.ringDk;
    else if (d > 5) col = T.acc;
    else col = T.glow;
    px(plx + x, ply + y, col);
  }
  // 광장 둘레 화단(사이프러스 자리)
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const bx = Math.round(plx + Math.cos(a) * 36), by = Math.round(ply + Math.sin(a) * 36);
    c.fillStyle = T.railDk; c.fillRect(bx - 3, by - 3, 6, 6);
    c.fillStyle = T.bed; c.fillRect(bx - 2, by - 2, 4, 4);
  }
  // 도킹 패드
  for (const [dx, dy] of lay.docks) {
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
      const d = Math.hypot(x, y);
      if (d > 11) continue;
      px(dx + x, dy + y, d > 9.6 ? T.acc : d > 8.4 ? '#1b1f28' : (Math.abs(x) < 1 || Math.abs(y) < 1) ? T.ringDk : '#2a2f3b');
    }
  }
  // 난간
  c.fillStyle = T.railDk; c.fillRect(0, 0, W, 5); c.fillRect(0, W - 5, W, 5); c.fillRect(0, 0, 5, W); c.fillRect(W - 5, 0, 5, W);
  c.fillStyle = T.rail; c.fillRect(1, 1, W - 2, 2); c.fillRect(1, W - 4, W - 2, 2); c.fillRect(1, 1, 2, W - 2); c.fillRect(W - 4, 1, 2, W - 2);
  c.fillStyle = T.ring;
  for (let i = 4; i < W - 4; i += 6) { c.fillRect(i, 0, 2, 4); c.fillRect(i, W - 4, 2, 4); c.fillRect(0, i, 4, 2); c.fillRect(W - 4, i, 4, 2); }
  return canvas;
}

// 절벽 벽면: 위는 빛나는 아치창이 박힌 석벽, 아래는 거친 바위
export function drawCliffWall(canvas, theme, w = 128, h = 64, seed = 3) {
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  const T = theme === 'white'
    ? { s1: '#9d9ba8', s2: '#8a8896', s3: '#73717f', mortar: '#5c5a68', rock: ['#6b6878', '#55525f', '#403d4a', '#2c2a35'], glow: '#eef9ff', glow2: '#a9d4ff' }
    : { s1: '#46425a', s2: '#3b374c', s3: '#2f2c3e', mortar: '#1d1a27', rock: ['#3a3549', '#2c2838', '#1f1c29', '#14121b'], glow: '#eadcff', glow2: '#a983ff' };
  const wallH = Math.round(h * 0.42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let col;
    if (y < wallH) {
      const row = y >> 2, off = (row & 1) * 4;
      const bx = (x + off) >> 3;
      col = (y & 3) === 3 || ((x + off) & 7) === 7 ? T.mortar : [T.s1, T.s2, T.s3][(bx * 7 + row * 3) % 3];
      if (y < 2) col = T.s1;
    } else {
      const n = Math.sin(x * 0.37 + seed) * Math.cos(y * 0.23 + x * 0.05) + Math.sin(x * 0.11 - y * 0.31 + seed * 2);
      const k = (y - wallH) / (h - wallH);
      col = T.rock[Math.min(3, Math.max(0, Math.floor(k * 2.4 + n * 0.55 + 0.4)))];
    }
    c.fillStyle = col; c.fillRect(x, y, 1, 1);
  }
  // 아치창
  for (let x = 6; x < w - 6; x += 14) {
    const ah = wallH - 8;
    c.fillStyle = T.glow2; c.fillRect(x - 1, 4, 6, ah + 1);
    c.fillStyle = T.glow; c.fillRect(x, 4, 4, ah); c.clearRect(x, 4, 1, 1); c.clearRect(x + 3, 4, 1, 1);
    c.fillStyle = T.glow2; c.fillRect(x, 4, 1, 1); c.fillRect(x + 3, 4, 1, 1);
  }
  return canvas;
}
