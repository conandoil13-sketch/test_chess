// 통행증 확인 단말을 도트로 찍는다. 이동관리국(#inspection)과 승급소 탑승장(#boarding)이 함께 쓴다.
// 글자·버튼·로그는 그대로 HTML이고, 그 뒤에 같은 크기의 저해상도 캔버스를 깔아
// 돌 케이스, 첨두 지붕과 상태 렌즈, 볼트, 홈, CRT 화면(주사선·비네트·NFC 물결·스캔 빔)을 그린다.
// 상태는 root 의 클래스(scanning / approved / denied)를 읽는다.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y, f) => f * 16 > BAYER[(y & 3) * 4 + (x & 3)];
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pal = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map(rgb) : rgb(v)]));

const K = pal({
  ink: '#05040a', edge: '#0b0a10', hi: '#b9b6c8', lit: '#8b8998',
  body: ['#3a3848', '#2f2d3c', '#262432', '#1e1c28', '#17161f'],
  well: '#0e0d14', wellHi: '#4a4858', rivet: '#6c6a7c', rivetHi: '#d4d0e0', violet: '#c79bff',
});
// CRT 화면 색: 어두운 계단 4단 + 글자/빛 색
const SCREEN = {
  idle: pal({ r: ['#03070c', '#061019', '#0a1b29', '#10293d'], a: '#7fe9ff', lens: '#9ad6e4' }),
  scanning: pal({ r: ['#0a0602', '#170f05', '#271a08', '#3a280c'], a: '#ffd25e', lens: '#ffd25e' }),
  approved: pal({ r: ['#020a05', '#05180d', '#0a2918', '#103d24'], a: '#4dff95', lens: '#4dff95' }),
  denied: pal({ r: ['#0c0203', '#1c050a', '#2e0910', '#440e19'], a: '#ff4a58', lens: '#ff4a58' }),
};
const CREST = 13;   // 지붕 높이(도트)

export function createTerminal(device, { root, getScale = () => 3, isActive = () => true } = {}) {
  device.classList.add('term');
  const cv = Object.assign(document.createElement('canvas'), { className: 'term-art' });
  cv.setAttribute('aria-hidden', 'true');
  device.prepend(cv);
  const ctx = cv.getContext('2d');
  let img = null, W = 0, H = 0, k = 0, raf = 0, last = 0;

  const mood = () => {
    const c = root.classList;
    return c.contains('denied') ? 'denied' : c.contains('approved') ? 'approved' : c.contains('scanning') ? 'scanning' : 'idle';
  };
  // 자식 요소의 위치를 도트 단위로 (캔버스 원점 = 장치 왼쪽 위에서 지붕만큼 위)
  function box(el) {
    if (!el || !el.offsetParent) return null;
    const d = device.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: Math.round((r.left - d.left) / k), y: Math.round((r.top - d.top) / k) + CREST, w: Math.round(r.width / k), h: Math.round(r.height / k) };
  }

  function draw(t) {
    const d = device.getBoundingClientRect();
    if (!d.width) return;
    k = getScale();
    const w = Math.ceil(d.width / k), h = Math.ceil(d.height / k) + CREST;
    if (w !== W || h !== H || !img) {
      W = w; H = h; cv.width = W; cv.height = H; img = ctx.createImageData(W, H);
      Object.assign(cv.style, { width: W * k + 'px', height: H * k + 'px', top: -CREST * k + 'px' });
    }
    const px = img.data;
    px.fill(0);
    const put = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a;
    };
    const m = mood(), S = SCREEN[m];
    const blinkOff = m === 'denied' && Math.floor(t * 4) % 2;
    const top = CREST;

    // 1) 몸체: 모서리를 2도트 깎은 석판, 위로 밝고 아래로 어두운 계단 + 디더
    const inBody = (x, y) => {
      if (y < top || y >= H || x < 0 || x >= W) return false;
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y - top, H - 1 - y);
      return cx + cy >= 2;
    };
    for (let y = top; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inBody(x, y)) continue;
      const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
      if (edge) { put(x, y, K.ink); continue; }
      const inner = !inBody(x - 2, y) || !inBody(x + 2, y) || !inBody(x, y - 2) || !inBody(x, y + 2);
      if (inner) { put(x, y, (x < W / 2 && !inBody(x, y - 2)) || !inBody(x - 2, y) ? K.lit : K.edge); continue; }
      const v = (y - top) / (H - top) * 3.6, f = Math.floor(v);
      put(x, y, K.body[Math.min(4, f + (dith(x, y, v - f) ? 1 : 0))]);
    }
    // 옆면 손잡이 홈 (가운데 높이에 짧은 가로줄들)
    for (let y = Math.round(H * 0.45); y < H * 0.7; y += 3) for (const x of [3, 4, W - 5, W - 4]) put(x, y, K.edge);
    // 네 모서리 볼트
    for (const [x, y] of [[4, top + 4], [W - 6, top + 4], [4, H - 6], [W - 6, H - 6]]) {
      put(x, y, K.rivetHi); put(x + 1, y, K.rivet); put(x, y + 1, K.rivet); put(x + 1, y + 1, K.edge);
    }

    // 오목한 판(머리 글자판, 신청 칸, 버튼 받침): 위/왼쪽은 그늘, 아래/오른쪽은 빛
    const well = (b, pad = 1) => {
      if (!b) return;
      const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad - 1, y1 = b.y + b.h + pad - 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const c = y === y0 || x === x0 ? K.ink : y === y1 || x === x1 ? K.wellHi : K.well;
        put(x, y, c);
      }
    };
    const head = box(device.querySelector('.device-head'));
    well(head, 1);
    well(box(device.querySelector('.bd-who')), 0);
    const acts = box(device.querySelector('.device-actions'));
    well(acts, 2);
    // 머리 아래 홈 한 줄
    if (head) for (let x = 4; x < W - 4; x++) { put(x, head.y + head.h + 3, K.ink); put(x, head.y + head.h + 4, K.lit); }
    // 상태등
    const led = box(device.querySelector('.led'));
    if (led) {
      const lx = led.x + Math.floor(led.w / 2) - 1, ly = led.y + Math.floor(led.h / 2) - 1;
      const on = m === 'idle' ? Math.floor(t / 0.7) % 2 === 0 : m === 'scanning' ? Math.floor(t * 8) % 2 === 0 : !blinkOff;
      const lc = m === 'idle' ? [60, 255, 138] : S.a;
      for (let y = -1; y <= 2; y++) for (let x = -1; x <= 2; x++) put(lx + x, ly + y, x === -1 || y === -1 || x === 2 || y === 2 ? K.ink : on ? (x === 0 && y === 0 ? [255, 255, 255] : lc) : K.edge);
    }

    // 2) CRT 화면: 위가 둥근 창, 두꺼운 검은 베젤
    const sc = box(device.querySelector('.screen'));
    if (sc) {
      const ARC = Math.max(3, Math.round(sc.h * 0.16));
      const inScr = (x, y, g) => {
        const lx = x - sc.x + g, ly = y - sc.y + g, ww = sc.w + g * 2, hh = sc.h + g * 2, arc = ARC + g;
        if (lx < 0 || ly < 0 || lx >= ww || ly >= hh) return false;
        if (ly >= arc) return true;
        const u = (lx + 0.5) / ww * 2 - 1, need = arc * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
        return ly >= need;
      };
      // 베젤: 바깥 밝은 테 → 검은 베젤
      for (let y = sc.y - 3; y < sc.y + sc.h + 3; y++) for (let x = sc.x - 3; x < sc.x + sc.w + 3; x++) {
        if (!inScr(x, y, 3)) continue;
        if (!inScr(x, y, 2)) put(x, y, y < sc.y + sc.h / 2 ? K.lit : K.wellHi);
        else if (!inScr(x, y, 0)) put(x, y, K.ink);
      }
      // 유리면: 가운데가 밝은 비네트 + 주사선 + 천천히 내려가는 밝은 띠
      const cx = sc.x + sc.w / 2, cy = sc.y + sc.h * 0.48, roll = sc.y + ((t * 9) % (sc.h + 8)) - 4;
      const dim = blinkOff ? 1 : 0;
      for (let y = sc.y; y < sc.y + sc.h; y++) for (let x = sc.x; x < sc.x + sc.w; x++) {
        if (!inScr(x, y, -1)) { if (inScr(x, y, 0)) put(x, y, K.ink); continue; }
        const e = Math.hypot((x + 0.5 - cx) / (sc.w * 0.62), (y + 0.5 - cy) / (sc.h * 0.62));
        let v = Math.max(0, 1 - e) * 3.4, f = Math.floor(v), lv = Math.min(3, f + (dith(x, y, v - f) ? 1 : 0));
        if ((y & 1) && lv > 0) lv--;                       // 주사선
        if (Math.abs(y - roll) < 1.5 && lv < 3) lv++;       // 굴러가는 띠
        lv = Math.max(0, lv - dim);
        put(x, y, S.r[lv]);
      }
      // 유리 반사: 왼쪽 위 곡면에 짧은 빛
      for (let i = 0; i < 4; i++) put(sc.x + 2 + i, sc.y + ARC - 1 - Math.floor(i / 2), [120, 140, 160], 120);

      const root2 = root.classList;
      // NFC 대기 물결: 도트 원이 퍼지며 옅어진다
      const nfc = device.querySelector('.nfc-idle');
      const nfcOn = nfc && getComputedStyle(nfc).display !== 'none' && !root2.contains('done') && !root2.contains('cam-live');
      if (nfcOn) {
        const ox = cx, oy = sc.y + sc.h * 0.46, R = Math.min(sc.w, sc.h) * 0.42, speed = m === 'scanning' ? 1.5 : 0.48;
        for (let n = 0; n < 3; n++) {
          const ph = (t * speed + n / 3) % 1, r = 3 + ph * R, fade = 1 - ph;
          const steps = Math.ceil(r * 7);
          for (let s = 0; s < steps; s++) {
            const a = s / steps * Math.PI * 2, x = Math.round(ox + Math.cos(a) * r - 0.5), y = Math.round(oy + Math.sin(a) * r - 0.5);
            if (inScr(x, y, -1) && dith(x, y, fade)) put(x, y, S.a);
          }
        }
      }
      // 스캔 빔: 위아래로 오가는 한 줄 + 위아래 디더 번짐
      if (m === 'scanning') {
        const p = (t / 0.9) % 2, f = p < 1 ? p : 2 - p, by = Math.round(sc.y + ARC * 0.6 + f * (sc.h - ARC * 0.6 - 3));
        for (let x = sc.x; x < sc.x + sc.w; x++) {
          if (inScr(x, by, -1)) put(x, by, [255, 244, 200]);
          for (const [dy, fr] of [[-1, 0.7], [1, 0.7], [-2, 0.3], [2, 0.3]]) if (inScr(x, by + dy, -1) && dith(x, by + dy, fr)) put(x, by + dy, S.a);
        }
      }
    }

    // 3) 지붕: 첨두 박공 + 상태 렌즈 + 꼭대기 장식
    const cw = Math.max(16, Math.round(W * 0.46)) | 0, half = cw / 2, gx = W / 2;
    const inGable = (x, y) => {
      if (y < 2 || y > top + 1) return false;
      const fy = (y - 2) / (top - 1), hw = half * Math.pow(Math.min(1, fy), 0.75);
      return Math.abs(x + 0.5 - gx) <= hw;
    };
    for (let y = 0; y <= top + 1; y++) for (let x = 0; x < W; x++) {
      if (!inGable(x, y)) continue;
      const edge = !inGable(x - 1, y) || !inGable(x + 1, y) || !inGable(x, y - 1);
      if (edge) { put(x, y, K.ink); continue; }
      const left = x + 0.5 < gx, rim = !inGable(x - 2, y) || !inGable(x + 2, y) || !inGable(x, y - 2);
      put(x, y, rim ? (left ? K.lit : K.edge) : K.body[left ? 1 : 2]);
    }
    // 크로켓(가장자리 작은 돌기)
    for (let y = 5; y < top - 1; y += 3) for (const side of [-1, 1]) {
      let x = Math.round(gx);
      while (inGable(x + side, y)) x += side;
      put(x + side, y, K.ink); put(x + side, y - 1, K.lit);
    }
    // 꼭대기 첨탑
    const gxi = Math.floor(gx - 0.5);
    for (let y = 0; y < 3; y++) { put(gxi, y, y ? K.lit : K.ink); put(gxi + 1, y, y ? K.edge : K.ink); }
    // 상태 렌즈
    const lx = gx, ly = top - 5.5, lc = S.lens, pulse = 0.5 + 0.5 * Math.sin(t * (m === 'scanning' ? 9 : 2.4));
    for (let y = Math.floor(ly - 4); y <= ly + 4; y++) for (let x = Math.floor(lx - 4); x <= lx + 4; x++) {
      const r = Math.hypot(x + 0.5 - lx, y + 0.5 - ly);
      if (r > 3.9) continue;
      if (r > 3.0) put(x, y, K.ink);
      else if (r > 2.2) put(x, y, K.rivet);
      else if (blinkOff) put(x, y, K.edge);
      else put(x, y, r < 1 && dith(x, y, pulse) ? [255, 255, 255] : lc);
    }
    // 렌즈 빛이 지붕 돌에 번진다
    if (!blinkOff) for (let y = Math.floor(ly - 7); y <= ly + 7; y++) for (let x = Math.floor(lx - 8); x <= lx + 8; x++) {
      const r = Math.hypot(x + 0.5 - lx, y + 0.5 - ly);
      if (r <= 3.9 || r > 7.5 || !inGable(x, y)) continue;
      if (dith(x, y, (1 - (r - 3.9) / 3.6) * 0.45 * (0.6 + 0.4 * pulse))) put(x, y, lc.map(v => v * 0.55));
    }

    ctx.putImageData(img, 0, 0);
  }

  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (!isActive()) return;
    if (now - last < 110) return;     // 도트 단말답게 9fps 정도로 끊는다
    last = now;
    draw(now / 1000);
  };
  raf = requestAnimationFrame(loop);
  return { redraw: () => draw(performance.now() / 1000) };
}
