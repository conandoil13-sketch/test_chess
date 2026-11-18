import { generateWorld, drawFx, cellLabel, N, C, W, OY, S } from './world.js';
import { drawChecian, spriteURL } from './sprites.js';
import { RANK_KO } from './rules.js';
import { sfx, setSound, soundOn, unlockAudio } from './audio.js';
import { createTiles } from './tiles.js';
import { createInspection } from './inspection.js';
import { rng } from './noise.js';
import { createSpace } from './space.js';
import { createStations } from './station.js';
import { createNave } from './nave.js';

const TILT = 42;
const COS = Math.cos((TILT * Math.PI) / 180);
const CELL = C * S;
const SIZE = N * CELL;
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const state = {
  pos: { x: 9, y: 10 },
  rank: store.get('cbc-rank', 'pawn'),
  mode: 'boot',          // boot | explore | inspect | moving
  selected: false,
  target: null,
  hover: null,
  reqNo: 41,
};
if (!RANK_KO[state.rank]) state.rank = 'pawn';

const els = {
  viewport: $('#viewport'), camera: $('#camera'), world: $('#world'), plane: $('#plane'),
  ground: $('#ground'), fx: $('#fx'), hits: $('#hits'), pieces: $('#pieces'),
  cursor: $('#cursor'), targetMark: $('#target-mark'), route: $('#route'), routeLine: $('#route-line'),
  status: $('#status'), rank: $('#rank'), portrait: $('#portrait'), posText: $('#pos-text'), posLabel: $('#pos-label'),
  hoverCoord: $('#hover-coord'), hoverLabel: $('#hover-label'), hoverMeta: $('#hover-meta'),
  dock: $('#dock'), mini: $('#minimap'), zoomText: $('#zoom-text'),
  explore: $('#explore'), modeSelect: $('#inspection-mode'), soundBtn: $('#sound-btn'),
};
document.documentElement.style.setProperty('--tilt', TILT + 'deg');
document.documentElement.style.setProperty('--cell', CELL + 'px');

// ---------- 월드 레이어 크기 ----------
for (const el of [els.world, els.plane]) { el.style.width = SIZE + 'px'; el.style.height = SIZE + 'px'; }
for (const cv of [els.ground, els.fx]) {
  cv.style.width = W * S + 'px';
  cv.style.height = (W + OY) * S + 'px';
  cv.style.top = -OY * S + 'px';
}
els.route.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
document.querySelectorAll('.cliff').forEach(c => c.style.setProperty('--size', SIZE + 'px'));

// ---------- 카메라 ----------
const cam = { x: (state.pos.x + 0.5) * CELL, y: (state.pos.y + 0.5) * CELL, z: 0.62 };
const camT = { ...cam };
const clampCam = () => {
  camT.x = Math.max(0, Math.min(SIZE, camT.x));
  camT.y = Math.max(-4 * CELL, Math.min(SIZE + 4 * CELL, camT.y)); // 행성 밖 승급소까지 볼 수 있게
};
function zoomBy(f) {
  camT.z = Math.max(0.3, Math.min(1.5, camT.z * f));
  els.zoomText.textContent = Math.round(camT.z * 100) + '%';
}
function focusCell(p) { camT.x = (p.x + 0.5) * CELL; camT.y = (p.y + 0.5) * CELL; clampCam(); }
let camStr = '';
const applyCam = () => {
  // 라이트: 소수점 둘째 자리까지만 쓰고, 값이 같으면 스타일을 건드리지 않는다
  const z = cam.z.toFixed(4);
  const s = `rotateX(${TILT}deg) scale3d(${z}, ${z}, ${z}) translate(${(-cam.x).toFixed(1)}px, ${(-cam.y).toFixed(1)}px)`;
  if (s !== camStr) { camStr = s; els.camera.style.transform = s; }
};

// ---------- 말 ----------
const SLOTS = [[0.28, 0.36], [0.72, 0.38], [0.3, 0.74], [0.72, 0.76], [0.5, 0.22], [0.5, 0.86]];
const occupancy = new Map();
const residents = [];
function makePiece(rank, color, cls) {
  const el = document.createElement('div');
  el.className = 'piece ' + cls;
  el.innerHTML = '<div class="shadow"></div><div class="stand"><img alt=""></div>';
  el.querySelector('img').src = spriteURL(rank, color);
  return el;
}
const placeAt = (el, fx, fy) => { el.style.transform = `translate(${fx * CELL}px, ${fy * CELL}px)`; };

const me = makePiece(state.rank, 'white', 'me');
me.insertAdjacentHTML('afterbegin', '<div class="ring"></div>');
me.querySelector('.stand').insertAdjacentHTML('beforeend', '<span class="tag">나</span>');
me.querySelector('.stand').addEventListener('click', e => { e.stopPropagation(); onCell(state.pos.x, state.pos.y); });

// ---------- HUD ----------
function setStatus(text, tone = '') {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}
function setStep(n) {
  document.querySelectorAll('.steps li').forEach((li, i) => li.classList.toggle('active', i === n));
}
function updateMe() {
  me.classList.toggle('selected', state.selected);
  placeAt(me, state.pos.x + 0.5, state.pos.y + 0.55);
  els.posText.textContent = `(${state.pos.x + 1}, ${state.pos.y + 1})`;
  els.posLabel.textContent = world ? cellLabel(world, state.pos.x, state.pos.y) : '';
}
function drawPortrait() {
  drawChecian(els.portrait, state.rank, 'white');
  me.querySelector('img').src = spriteURL(state.rank, 'white');
}

function showHover(p) {
  state.hover = p;
  if (!p) { els.cursor.hidden = true; return; }
  els.cursor.hidden = false;
  els.cursor.style.transform = `translate(${p.x * CELL}px, ${p.y * CELL}px)`;
  const mine = p.x === state.pos.x && p.y === state.pos.y;
  els.cursor.classList.toggle('go', state.selected && !mine);
  els.hoverCoord.textContent = `(${p.x + 1}, ${p.y + 1})`;
  els.hoverLabel.textContent = cellLabel(world, p.x, p.y);
  const n = occupancy.get(p.y * N + p.x) || 0;
  els.hoverMeta.textContent = (mine ? '내 위치 · ' : '') + (n ? `주민 ${n}` : '주민 없음');
}

function drawRoute() {
  const t = state.target;
  els.targetMark.hidden = !t;
  els.route.classList.toggle('on', !!t);
  if (!t) return;
  els.targetMark.style.transform = `translate(${t.x * CELL}px, ${t.y * CELL}px)`;
  const a = els.routeLine;
  a.setAttribute('x1', (state.pos.x + 0.5) * CELL); a.setAttribute('y1', (state.pos.y + 0.5) * CELL);
  a.setAttribute('x2', (t.x + 0.5) * CELL); a.setAttribute('y2', (t.y + 0.5) * CELL);
}

function setTarget(t) {
  state.target = t;
  drawRoute();
  els.dock.hidden = !t;
  if (t) {
    $('#dock-from').textContent = `(${state.pos.x + 1}, ${state.pos.y + 1})`;
    $('#dock-to').textContent = `(${t.x + 1}, ${t.y + 1})`;
    $('#dock-label').textContent = cellLabel(world, t.x, t.y);
    $('#dock-rank').textContent = RANK_KO[state.rank];
    els.dock.classList.remove('pop'); void els.dock.offsetWidth; els.dock.classList.add('pop');
    setStatus('신청서를 제출하면 이동관리국 심사로 넘어갑니다.', 'go');
    setStep(2);
  }
}

function onCell(x, y) {
  if (state.mode !== 'explore') return;
  const mine = x === state.pos.x && y === state.pos.y;
  if (mine) {
    state.selected = !state.selected;
    setTarget(null);
    updateMe();
    if (state.selected) { sfx.select(); setStatus('가고 싶은 구역을 고르세요. 어디든 선택할 수 있습니다.', 'go'); setStep(1); }
    else { sfx.deselect(); setStatus('내 캐릭터를 눌러 선택하세요.'); setStep(0); }
    if (state.hover) showHover(state.hover);
    return;
  }
  if (!state.selected) {
    sfx.error();
    setStatus('먼저 내 캐릭터(‘나’)를 선택하세요.', 'warn');
    me.classList.remove('nudge'); void me.offsetWidth; me.classList.add('nudge');
    return;
  }
  sfx.target();
  setTarget({ x, y });
}

// ---------- 이동관리국 흐름 ----------
let tiles, insp;
async function submit() {
  if (state.mode !== 'explore' || !state.target) return;
  state.mode = 'inspect';
  const t = state.target;
  sfx.confirm();
  els.dock.hidden = true;
  setTimeout(() => sfx.door(), 120);
  await tiles.cover();
  els.explore.inert = true;
  insp.prepare({
    no: ++state.reqNo, rank: state.rank, mode: els.modeSelect.value,
    from: { ...state.pos }, to: { ...t },
    fromLabel: cellLabel(world, state.pos.x, state.pos.y), toLabel: cellLabel(world, t.x, t.y),
  });
  await tiles.uncover();
  const result = await insp.enter();
  sfx.door();
  await tiles.cover();
  insp.hide();
  els.explore.inert = false;
  state.selected = false;
  setTarget(null);
  updateMe();
  focusCell(state.pos);
  cam.x = camT.x; cam.y = camT.y;
  await tiles.uncover();
  if (result === true) {
    state.mode = 'moving';
    await hopTo(t);
    setStatus(`통행 허가 — (${t.x + 1}, ${t.y + 1}) ${cellLabel(world, t.x, t.y)}에 도착했습니다.`, 'ok');
  } else if (result === false) {
    me.classList.remove('denied'); void me.offsetWidth; me.classList.add('denied');
    setStatus('통행 불가 — 현재 위치에 남았습니다.', 'bad');
  } else {
    setStatus('신청을 취소했습니다.');
  }
  setStep(0);
  state.mode = 'explore';
}

function hopTo(t) {
  return new Promise(done => {
    const from = { ...state.pos };
    const dist = Math.hypot(t.x - from.x, t.y - from.y);
    const dur = Math.min(1600, 420 + dist * 90);
    const stand = me.querySelector('.stand');
    const start = performance.now();
    sfx.hop();
    const step = now => {
      const k = Math.min(1, (now - start) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const fx = from.x + (t.x - from.x) * e, fy = from.y + (t.y - from.y) * e;
      placeAt(me, fx + 0.5, fy + 0.55);
      stand.style.setProperty('--hop', `${-Math.sin(Math.PI * k) * Math.min(160, 50 + dist * 14)}px`);
      camT.x = (fx + 0.5) * CELL; camT.y = (fy + 0.5) * CELL;
      if (k < 1) requestAnimationFrame(step);
      else {
        stand.style.setProperty('--hop', '0px');
        state.pos = { ...t };
        updateMe();
        sfx.land();
        me.classList.remove('landed'); void me.offsetWidth; me.classList.add('landed');
        done();
      }
    };
    requestAnimationFrame(step);
  });
}

// ---------- 입력 ----------
const keys = new Set();
const isField = el => el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (state.mode === 'inspect' && insp.isOpen() && !insp.isBusy()) insp.cancel();
    else if (state.mode === 'explore' && state.target) { setTarget(null); setStatus('가고 싶은 구역을 고르세요.', 'go'); setStep(1); }
    else if (state.mode === 'explore' && state.selected) onCell(state.pos.x, state.pos.y);
    return;
  }
  if (e.key === 'Enter' && state.mode === 'explore' && state.target && !isField(e.target)) { e.preventDefault(); submit(); return; }
  if (state.mode !== 'explore' && state.mode !== 'moving') return;
  if (isField(e.target) || e.metaKey || e.ctrlKey) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
  if (e.code === 'KeyF') focusCell(state.pos);
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let drag = null, suppressClick = false;
els.viewport.addEventListener('pointerdown', e => {
  if (e.button !== 0 || state.mode === 'boot') return;
  drag = { x: e.clientX, y: e.clientY, cx: camT.x, cy: camT.y, moved: false };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; els.viewport.classList.add('dragging'); }
  if (drag.moved) {
    camT.x = drag.cx - dx / camT.z;
    camT.y = drag.cy - dy / (camT.z * COS);
    clampCam();
    cam.x = camT.x; cam.y = camT.y;
  }
});
window.addEventListener('pointerup', () => {
  if (drag?.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
  drag = null;
  els.viewport.classList.remove('dragging');
});
els.viewport.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
els.viewport.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey) zoomBy(Math.exp(-e.deltaY * 0.01));
  else { camT.x += e.deltaX / camT.z; camT.y += e.deltaY / (camT.z * COS); clampCam(); }
}, { passive: false });

$('#zoom-in').addEventListener('click', () => zoomBy(1.18));
$('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.18));
$('#focus-me').addEventListener('click', () => focusCell(state.pos));
$('#dock-submit').addEventListener('click', submit);
$('#dock-cancel').addEventListener('click', () => { setTarget(null); setStatus('가고 싶은 구역을 고르세요.', 'go'); setStep(1); });

els.rank.value = state.rank;
els.rank.addEventListener('change', () => {
  state.rank = els.rank.value;
  store.set('cbc-rank', state.rank);
  state.selected = false;
  setTarget(null);
  drawPortrait();
  updateMe();
  setStatus(`${RANK_KO[state.rank]}로 계급을 바꿨습니다. 내 캐릭터를 눌러 선택하세요.`);
  setStep(0);
});
els.modeSelect.value = store.get('cbc-mode', 'nfc') === 'camera' ? 'camera' : 'nfc';
els.modeSelect.addEventListener('change', () => store.set('cbc-mode', els.modeSelect.value));
const syncSound = () => { els.soundBtn.textContent = soundOn() ? '♪ ON' : '♪ OFF'; els.soundBtn.setAttribute('aria-pressed', soundOn()); };
els.soundBtn.addEventListener('click', () => { setSound(!soundOn()); syncSound(); });
syncSound();

// ---------- 미니맵 ----------
const miniBase = document.createElement('canvas');
const miniCtx = els.mini.getContext('2d');
function buildMini() {
  miniBase.width = els.mini.width; miniBase.height = els.mini.height;
  const c = miniBase.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.drawImage(els.ground, 0, OY, W, W, 0, 0, miniBase.width, miniBase.height);
}
function drawMini(t) {
  const m = els.mini.width, k = m / N;
  miniCtx.drawImage(miniBase, 0, 0);
  miniCtx.fillStyle = 'rgba(8,10,16,.25)';
  miniCtx.fillRect(0, 0, m, m);
  if (state.target) {
    miniCtx.strokeStyle = '#4fe3ff'; miniCtx.lineWidth = 2;
    miniCtx.strokeRect(state.target.x * k + 1, state.target.y * k + 1, k - 2, k - 2);
  }
  const blink = Math.floor(t / 400) % 2;
  miniCtx.fillStyle = blink ? '#f2c14e' : '#fff3c8';
  miniCtx.fillRect(state.pos.x * k + 2, state.pos.y * k + 2, k - 4, k - 4);
  const vw = innerWidth / cam.z / SIZE * m, vh = innerHeight * 0.75 / (cam.z * COS) / SIZE * m;
  const cx = cam.x / SIZE * m, cy = cam.y / SIZE * m;
  miniCtx.strokeStyle = 'rgba(255,255,255,.75)'; miniCtx.lineWidth = 1;
  miniCtx.strokeRect(Math.round(cx - vw / 2) + 0.5, Math.round(cy - vh * 0.62) + 0.5, Math.round(vw), Math.round(vh));
}
els.mini.addEventListener('click', e => {
  const r = els.mini.getBoundingClientRect();
  camT.x = (e.clientX - r.left) / r.width * SIZE;
  camT.y = (e.clientY - r.top) / r.height * SIZE;
  clampCam();
});

// ---------- 루프 ----------
let world = null, stations = null, fxCtx = null, last = performance.now(), fxLast = 0, spaceLast = 0;
const space = createSpace($('#space'));
let bootDone = false;
function frame(t) {
  if (!bootDone) { last = t; requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  let kx = 0, ky = 0;
  if (keys.has('KeyA')) kx--; if (keys.has('KeyD')) kx++;
  if (keys.has('KeyW')) ky--; if (keys.has('KeyS')) ky++;
  if (kx || ky) {
    const sp = (900 * dt) / camT.z / Math.hypot(kx, ky);
    camT.x += kx * sp; camT.y += (ky * sp) / COS;
    clampCam();
  }
  if (keys.has('KeyQ')) zoomBy(Math.exp(-1.3 * dt));
  if (keys.has('KeyE')) zoomBy(Math.exp(1.3 * dt));
  const k = 1 - Math.exp(-dt * 11);
  cam.x += (camT.x - cam.x) * k;
  cam.y += (camT.y - cam.y) * k;
  cam.z += (camT.z - cam.z) * k;
  applyCam();
  if (stations && state.mode !== 'inspect') stations.update(t);
  if (t - spaceLast > 50 && state.mode !== 'inspect') {
    spaceLast = t;
    space.draw(t, cam.x - SIZE / 2, cam.y - SIZE / 2, cam.z);
  }
  if (t - fxLast > 100 && world && state.mode !== 'inspect') {
    fxLast = t;
    drawFx(fxCtx, world, t);
    drawMini(t);
  }
  requestAnimationFrame(frame);
}

// ---------- 부팅 ----------
async function boot() {
  const bootStatus = $('#boot-status');
  const bar = $('#boot-bar');
  const planet = createNave($('#boot-nave'), { scene: 'boot' });
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
  bar.style.width = '18%';
  await nextFrame();
  bootStatus.textContent = '지형 · 성벽 · 구역 생성 중…';
  await nextFrame();
  world = generateWorld(els.ground);
  planet.setTexture(els.ground, OY, W);
  bar.style.width = '72%';
  bootStatus.textContent = '주민 위치 수신 중…';
  await nextFrame();

  els.fx.width = els.ground.width;
  els.fx.height = els.ground.height;
  fxCtx = els.fx.getContext('2d');

  // 클릭 영역
  const frag = document.createDocumentFragment();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = document.createElement('div');
    d.className = 'hit';
    d.dataset.x = x; d.dataset.y = y;
    frag.append(d);
  }
  els.hits.append(frag);
  els.hits.addEventListener('pointerover', e => {
    const h = e.target.closest('.hit');
    if (!h) return;
    const p = { x: +h.dataset.x, y: +h.dataset.y };
    if (!state.hover || state.hover.x !== p.x || state.hover.y !== p.y) { showHover(p); if (state.mode === 'explore') sfx.tick(); }
  });
  els.hits.addEventListener('pointerleave', () => showHover(null));
  els.hits.addEventListener('click', e => {
    const h = e.target.closest('.hit');
    if (h) onCell(+h.dataset.x, +h.dataset.y);
  });

  // 테스트용 고정 주민 (한 구역에 여러 말이 함께 있을 수 있다)
  const r = rng(120);
  const ranks = ['pawn', 'pawn', 'pawn', 'pawn', 'knight', 'knight', 'rook', 'rook', 'bishop', 'bishop', 'queen'];
  let guard = 0;
  while (residents.length < 74 && guard++ < 2000) {
    const x = Math.floor(r() * N), y = Math.floor(r() * N);
    if (world.cells[y][x].b === 'lake') continue;
    const key = y * N + x;
    const n = occupancy.get(key) || 0;
    if (n >= 4) continue;
    const el = makePiece(ranks[Math.floor(r() * ranks.length)], r() < 0.5 ? 'white' : 'black', 'resident');
    const [sx, sy] = SLOTS[(n + Math.floor(r() * 6)) % SLOTS.length];
    placeAt(el, x + sx, y + sy);
    el.style.setProperty('--d', (-r() * 2.4).toFixed(2) + 's');
    els.pieces.append(el);
    residents.push(el);
    occupancy.set(key, n + 1);
  }
  els.pieces.append(me);
  stations = createStations({ worldEl: els.world, piecesEl: els.pieces, CELL, SIZE, S, pads: world.pads });

  buildMini();
  drawPortrait();
  updateMe();
  setStatus('내 캐릭터를 눌러 선택하세요.');
  setStep(0);
  zoomBy(1);
  tiles = createTiles($('#tiles'));
  insp = createInspection({ sfx });

  bar.style.width = '100%';
  bootStatus.textContent = '관측 준비 완료';
  const startBtn = $('#boot-start');
  startBtn.hidden = false;
  startBtn.focus();
  requestAnimationFrame(frame);
  startBtn.addEventListener('click', () => {
    unlockAudio();
    sfx.confirm();
    bootDone = true;
    $('#boot').classList.add('gone');
    setTimeout(() => { planet.stop(); $('#boot').remove(); }, 900);
    state.mode = 'explore';
    camT.z = 0.9;
    zoomBy(1);
  }, { once: true });
}
boot();
