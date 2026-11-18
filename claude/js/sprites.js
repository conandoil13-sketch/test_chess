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
