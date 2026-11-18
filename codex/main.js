import { canMove } from './rules.js';
import { buildingSprites } from './assets/buildings/sprites.js';
import { animatePaper, stopPaperAnimation } from './paper-animation.js';
import { inspectionLayers } from './assets/ui/inspection-layers.js';

const size = 20;
let position = { x: 9, y: 10 };
let selected = false;
let destination = null;
let transitioning = false;
let returnTimer = null;
let inspectionTimer = null;
let cameraStream = null;
let cameraRequest = 0;
let characterButton;
const map = document.querySelector('#map');
const rank = document.querySelector('#rank');
const status = document.querySelector('#status');
const exploration = document.querySelector('#exploration');
const transition = document.querySelector('#transition');
const inspection = document.querySelector('#inspection');
const result = document.querySelector('#result');
const detail = document.querySelector('#detail');
const check = document.querySelector('#check');
const close = document.querySelector('#close');
const modeSelect = document.querySelector('#inspection-mode');
const intro = document.querySelector('#inspection-intro');
const scannerSymbol = document.querySelector('#scanner-symbol');
const scannerLabel = document.querySelector('#scanner-label');
const cameraPreview = document.querySelector('#camera-preview');
const simulationNote = document.querySelector('#simulation-note');
function stopCameraFeed() {
  cameraRequest++;
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPreview.hidden = true;
  inspection.classList.remove('camera-live', 'camera-scanning');
}
async function startCamera() {
  const request = ++cameraRequest;
  if (!navigator.mediaDevices?.getUserMedia) {
    result.textContent = '카메라를 사용할 수 없습니다';
    detail.textContent = '카메라를 지원하는 브라우저와 보안 연결이 필요합니다.';
    return;
  }
  check.disabled = true;
  result.textContent = '카메라 연결 중';
  detail.textContent = '브라우저의 카메라 접근 요청을 확인해 주세요.';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (request !== cameraRequest || inspection.hidden || inspection.dataset.mode !== 'camera') {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    cameraStream = stream;
    cameraPreview.srcObject = stream;
    cameraPreview.hidden = false;
    inspection.classList.add('camera-live');
    await cameraPreview.play();
    if (request !== cameraRequest) return;
    result.textContent = '카메라 연결 완료';
    detail.textContent = '통행증을 화면에 맞춘 뒤 인식 시뮬레이션을 실행하세요.';
    check.textContent = '카메라 인식 시뮬레이션';
    scannerLabel.textContent = 'LIVE CAMERA / SIMULATED RECOGNITION';
    check.disabled = false;
  } catch (error) {
    if (request !== cameraRequest) return;
    stopCameraFeed();
    result.textContent = '카메라 연결 실패';
    detail.textContent = error.name === 'NotAllowedError' ? '카메라 권한을 허용한 뒤 다시 시도해 주세요.' : '카메라 연결 상태와 브라우저 설정을 확인해 주세요.';
    check.textContent = '카메라 다시 연결';
    check.disabled = false;
  }
}
window.addEventListener('pagehide', stopCameraFeed);
try { modeSelect.value = localStorage.getItem('cb120-inspection-mode') === 'camera' ? 'camera' : 'nfc'; } catch {}
modeSelect.addEventListener('change', () => { try { localStorage.setItem('cb120-inspection-mode', modeSelect.value); } catch {} });
const coordinates = p => `(${p.x + 1}, ${p.y + 1})`;
const cells = [];
// A failed or absent custom layer never removes the built-in fallback.
function loadInspectionLayers() {
  const architecture = document.querySelector('.station-architecture');
  const booth = document.querySelector('.checkpoint-booth');
  const errors = document.querySelector('#ui-layer-errors');
  const labels = { background: '배경', window: '창구·유리', counter: '카운터', terminal: '확인 장치' };
  const targets = {
    background: [architecture.querySelector('.scene-background'), architecture],
    window: [architecture.querySelector('.scene-window'), architecture],
    counter: [architecture.querySelector('.scene-counter'), architecture],
    terminal: [booth.querySelector('.terminal-layer'), booth],
  };
  const failures = new Map();
  const showErrors = () => {
    errors.hidden = failures.size === 0;
    errors.textContent = failures.size ? `이미지 연결 오류: ${[...failures.values()].join(', ')}. 해당 레이어는 기존 화면으로 표시합니다.` : '';
  };
  for (const [name, path] of Object.entries(inspectionLayers)) {
    if (!path || !targets[name]) continue;
    const [image, parent] = targets[name];
    image.onload = () => { image.hidden = false; parent.classList.add(`custom-${name}`); failures.delete(name); showErrors(); };
    image.onerror = () => { image.hidden = true; parent.classList.remove(`custom-${name}`); failures.set(name, labels[name]); showErrors(); };
    image.src = path;
  }
}
loadInspectionLayers();
// Stationary test residents; multiple pieces may share any district.
const residents = [
  { x: 9, y: 10, type: 'knight', color: 'dark' },
  { x: 9, y: 10, type: 'pawn', color: 'light' },
];
const residentTypes = ['pawn', 'knight', 'rook', 'bishop', 'queen'];
for (let i = 0; i < 55; i++) {
  residents.push({ x: (i * 7 + 3) % size, y: (i * 11 + Math.floor(i / 5) * 3 + 2) % size,
    type: residentTypes[i % residentTypes.length], color: i % 2 ? 'dark' : 'light' });
}
// null = unconfigured, ready = linked, error = configured but unavailable/invalid.
const spriteStates = Object.fromEntries(Object.entries(buildingSprites).map(([key, path]) => [key, { path, status: path ? 'loading' : 'unconfigured' }]));
const spriteSizes = { medieval: 256, cyber: 256, tower: 256, large: 512 };
function loadSprite(key, state) {
  return new Promise(resolve => {
    if (!state.path) { resolve(); return; }
    const image = new Image();
    image.onload = () => {
      const expected = spriteSizes[key];
      if (image.naturalWidth !== expected || image.naturalHeight !== expected) {
        state.status = 'error'; state.reason = `크기 ${image.naturalWidth}×${image.naturalHeight} (필요: ${expected}×${expected})`; resolve(); return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = expected;
        canvas.getContext('2d').drawImage(image, 0, 0);
        state.data = canvas.toDataURL('image/png');
        state.status = 'ready';
      } catch {
        state.status = 'error'; state.reason = '이미지 데이터를 읽을 수 없음';
      }
      resolve();
    };
    image.onerror = () => { state.status = 'error'; state.reason = '파일을 불러올 수 없음'; resolve(); };
    image.src = state.path;
  });
}
const residentSlots = [[28, 35], [72, 36], [30, 72], [72, 73], [50, 24], [50, 78]];

// Visual prototype only: biome and occupancy never change movement rules.
function terrainAt(x, y) {
  if (x === 13) return 'river';
  const city = Math.hypot(x - 8, y - 9);
  const secondCity = Math.hypot(x - 17, y - 4);
  if (city < 2.5 || secondCity < 1.8) return 'city';
  if (city < 5 || secondCity < 3.2) return 'village';
  if ((x < 5 && y > 11) || (x > 15 && y > 11)) return 'meadow';
  return 'rural';
}

function makeLandscape(kind, seed) {
  let state = seed + 1;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const parts = [];
  const buildings = [];
  const rect = (x,y,w,h,c) => parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  const poly = (pts,c) => parts.push(`<polygon points="${pts}" fill="${c}"/>`);
  rect(0,0,256,256,kind === 'city' ? '#66756a' : '#718c65');
  for(let i=0;i<550;i++) rect(Math.floor(random()*256),Math.floor(random()*256),2,1,random()>.5?'#a5b98a':'#5c7959');
  const tree = (x,y) => {
    rect(x+5,y+14,3,6,'#544c3a'); rect(x+1,y+7,12,9,'#294c3b'); rect(x+3,y+2,9,11,'#436d4c');
    rect(x+5,y,5,5,'#78945e'); rect(x+3,y+5,3,2,'#9aad72'); rect(x+9,y+10,3,3,'#274a38');
  };
  const building = (x,y,type) => {
    const tower = type === 2, tech = type === 1 || type === 2;
    const w = tower ? 22 : 29, h = tower ? 31 : 20, d = 11;
    rect(x+5,y+10,w+5,h+10,'#1d302c66');
    rect(x,y+d,w,h,tech?'#697c7a':'#b6ac91');
    poly(`${x+w},${y+d} ${x+w+6},${y+d-5} ${x+w+6},${y+d+h-5} ${x+w},${y+d+h}`,tech?'#344e50':'#777d6e');
    if (tech) {
      rect(x,y+5,w,d-5,'#495f60'); rect(x+2,y+5,w-4,2,'#91b1a4');
      rect(x+w-8,y-3,3,8,'#8bb3ae'); rect(x+w-9,y-4,5,2,'#e487b1');
      rect(x+3,y+d+3,w-7,2,'#74d8c9'); rect(x+5,y+d+7,8,2,'#d889ae');
    } else {
      poly(`${x-2},${y+12} ${x+Math.floor(w/2)},${y-2} ${x+w+2},${y+12}`, '#755e50');
      poly(`${x+3},${y+10} ${x+Math.floor(w/2)},${y+1} ${x+w-3},${y+10}`, '#9c806a');
      rect(x+4,y+8,5,1,'#c5a991'); rect(x+w-8,y+5,3,1,'#c5a991');
      rect(x+w-8,y-4,4,7,'#71695b');
    }
    for(let row=0;row<Math.floor((h-3)/7);row++) for(let col=0;col<Math.floor((w-5)/6);col++) {
      let wx=x+3+col*6, wy=y+d+3+row*7; rect(wx,wy,3,4,'#344a45'); rect(wx,wy,1,2,tech?'#9bf1de':'#e8d29b');
    }
    rect(x+Math.floor(w/2)-2,y+d+h-5,4,5,'#414840');
    if(tech) { rect(x+2,y+d+h-2,w-4,1,'#e18cae'); rect(x+w+2,y+d+2,1,h-5,'#78cdbd'); }
  };
  if(kind === 'river') {
    rect(95,0,66,256,'#526f6b'); rect(101,0,54,256,'#477d82'); rect(109,0,35,256,'#528d91');
    for(let i=0;i<85;i++) rect(104+Math.floor(random()*47),Math.floor(random()*256),2+Math.floor(random()*8),1,random()>.5?'#91c6bb':'#376c72');
    rect(90,112,76,20,'#7f8170'); rect(90,112,76,3,'#d2c4a3'); rect(90,129,76,3,'#484f49');
  }
  if(kind === 'city' || kind === 'village' || kind === 'rural') {
    rect(0,119,256,18,'#a79c7d'); rect(119,0,18,256,'#a79c7d');
    rect(0,120,256,1,'#d8c9a8'); rect(120,0,1,256,'#d8c9a8');
    if(kind === 'river') rect(95,112,66,20,'#a79c7d');
  }
  // Registered sprites replace their matching fallback, without changing placement.
  const spriteBuilding = (x, y, type, large = false) => {
    const key = large ? 'large' : ['medieval', 'cyber', 'tower'][type];
    const sprite = spriteStates[key];
    const size = large ? 92 : 46;
    const start = parts.length;
    if (sprite.status === 'ready') {
      parts.push(`<image x="${x}" y="${y}" width="${size}" height="${size}" href="${sprite.data}" preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated"/>`);
    } else {
      if (large) parts.push(`<g transform="translate(${x},${y}) scale(2)">`);
      building(large ? 3 : x + 4, large ? 4 : y + 8, type);
      if (large) parts.push('</g>');
      if (sprite.status === 'error') {
        rect(x + size - 12, y, 12, 12, '#b52727');
        parts.push(`<text x="${x + size - 6}" y="${y + 10}" text-anchor="middle" font-size="10" font-weight="bold" fill="white">!</text>`);
      }
    }
    // Keep the sprite in its own plane, separate from the ground SVG.
    const art = parts.splice(start).join('');
    const height = size + 16;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="${x} ${y - 8} ${size} ${height}" shape-rendering="crispEdges">${art}</svg>`;
    buildings.push({ x, y: y - 8, width: size, height, src: `data:image/svg+xml,${encodeURIComponent(svg)}` });
  };
  // Large buildings use a 2×2 plot footprint; the remaining plots stay independent.
  const occupied = new Set();
  const largeChance = { city: .42, village: .20, rural: .05, meadow: .02, river: 0 }[kind];
  if (random() < largeChance) {
    const col = Math.floor(random() * 2) * 2, row = Math.floor(random() * 2) * 2;
    const x = 12 + col * 61, y = 12 + row * 61;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) occupied.add(`${col + dx},${row + dy}`);
    rect(x - 2, y + 5, 107, 100, '#818b76');
    spriteBuilding(x, y, 2, true);
  }
  // Divide each district into 4×4 plots. Each plot decides whether and what to build.
  const probability = {city:.87, village:.52, rural:.20, meadow:.04, river:.12}[kind];
  for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
    const x=12+col*61, y=12+row*61;
    if (occupied.has(`${col},${row}`)) continue;
    if(kind === 'river' && (col===1 || col===2)) continue;
    const built = random() < probability;
    if(built) {
      rect(x-2,y+5,46,45,'#818b76');
      const type = Math.floor(random()*3); spriteBuilding(x,y,type);
      if(random() < .35) { rect(x+32,y+30,8,6,'#5c746d'); rect(x+33,y+30,6,1,'#82dec9'); }
      if(random() < .45) tree(x+30,y+23);
    } else if(random() < (kind === 'meadow' ? .28 : .65)) {
      tree(x+Math.floor(random()*20),y+Math.floor(random()*19));
      if(random() < .6) tree(x+23,y+21);
    } else {
      for(let j=0;j<9;j++) rect(x+Math.floor(random()*40),y+Math.floor(random()*40),2,2,random()>.5?'#c2c186':'#8ea76f');
    }
  }
  // Each region has perimeter walls and openings aligned with the roads or water.
  for(const [x,y,w,h] of [[0,0,115,7],[141,0,115,7],[0,244,115,7],[141,244,115,7],[0,0,7,115],[0,141,7,115],[249,0,7,115],[249,141,7,115]]) {
    if(kind==='river' && (y===0 || y===244) && w===115) {
      // The water passes beneath a low arch in this test illustration.
    }
    rect(x+2,y+9,w,h,'#263c32aa'); rect(x,y+4,w,h+6,'#526354'); rect(x,y,w,h,'#8b9480'); rect(x,y,w,2,'#d5cbb2');
  }
  for(let i=10;i<245;i+=14) { if(i>=108 && i<=148) continue; rect(i,0,6,6,'#d4cbb4'); rect(i,244,6,6,'#aeb8a4'); rect(0,i,6,6,'#c3c3ad'); rect(249,i,6,6,'#9da994'); }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" shape-rendering="crispEdges">${parts.join('')}</svg>`;
  return { background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, buildings };
}
const landscapes = new Map();
function landscapeAt(x,y) {
  const kind = terrainAt(x,y);
  const seed = ((x*73+y*137+x*y*17)%24);
  const key = `${kind}-${seed}`;
  if (!landscapes.has(key)) landscapes.set(key,makeLandscape(kind,seed));
  return landscapes.get(key);
}

function pieceMarker(type) {
  const heads = {
    pawn: '<path d="M23 5h10v2h4v4h2v9h-2v4h-4v2H23v-2h-4v-4h-2v-9h2V7h4z"/>',
    knight: '<path d="M20 25V13h3V8h5V4h7v4h4v5h4v4h3v5h-5v-2h-6v5z"/>',
    rook: '<path d="M16 6h5v5h4V6h6v5h4V6h5v5h4v7h-3v8H19v-8h-3z"/>',
    bishop: '<path d="M27 3h4v3h4v5h3v8h-3v5h-3v3h-7v-3h-3v-5h-3v-8h3V6h5z"/>',
    queen: '<path d="M15 8h4v4h4V7h5v5h4V7h5v5h4V8h4l-4 18H19z"/>',
    king: '<path d="M27 2h4v5h5v4h-5v4h6v4h3v7H20v-7h3v-4h4v-4h-5V7h5z"/>'
  };
  const details = {
    pawn: '<path d="M23 7h7v1h-7z M19 13h2v5h-2z M32 21h3v2h-3z" fill="#fff1ce"/>',
    knight: '<path d="M25 6h5v2h-5z M22 10h5v2h-5z M21 15h4v2h-4z M34 14h3v2h-3z" fill="#fff1ce"/><path d="M35 13h2v2h-2z M40 18h3v1h-3z M25 21h8v2h-8z M26 17h2v3h-2z" fill="#655d4d"/>',
    rook: '<path d="M18 8h2v5h-2z M27 8h2v5h-2z M37 8h2v5h-2z M20 16h20v2H20z" fill="#fff1ce"/><path d="M23 20h14v1H23z M27 21h2v4h-2z M35 21h2v4h-2z" fill="#766b55"/>',
    bishop: '<path d="M28 5h2v4h-2z M24 10h2v6h-2z" fill="#fff1ce"/><path d="M30 10h2v3h-2z M28 13h2v3h-2z M26 16h2v3h-2z M24 20h11v2H24z" fill="#716652"/>',
    queen: '<path d="M16 8h3v3h-3z M26 7h3v3h-3z M36 7h3v3h-3z M42 8h3v3h-3z M21 18h17v2H21z" fill="#fff1ce"/><path d="M23 21h3v3h-3z M28 20h3v4h-3z M33 21h3v3h-3z" fill="#8b7659"/>',
    king: '<path d="M28 3h2v6h-2z M24 8h9v1h-9z M23 18h12v2H23z" fill="#fff1ce"/><path d="M25 21h10v2H25z M27 23h6v2h-6z" fill="#796d57"/>'
  };
  return `<svg class="avatar" viewBox="0 0 112 168" aria-hidden="true" shape-rendering="crispEdges"><g transform="scale(2)"><ellipse cx="28" cy="80" rx="23" ry="4" fill="#15251d" opacity=".45"/><g fill="#343c32" stroke="#343c32" stroke-width="3" stroke-linejoin="round">${heads[type] || heads.pawn}<path d="M22 23h12v5h-2v9h2v8h2v6h3v5h3v4H14v-4h3v-5h3v-6h2v-8h2v-9h-2z"/><path d="M14 59h28v4h3v5H11v-5h3z M9 68h38v4h3v5H6v-5h3z"/></g><g fill="#d9cfad">${heads[type] || heads.pawn}<path d="M22 23h12v5h-2v9h2v8h2v6h3v5h3v4H14v-4h3v-5h3v-6h2v-8h2v-9h-2z"/><path d="M14 59h28v4h3v5H11v-5h3z M9 68h38v4h3v5H6v-5h3z"/></g>${details[type] || details.pawn}<path d="M24 29h3v14h-2v7h-3v5h-3v3h5v-4h3v-8h2V29z M13 63h26v2H13z M9 72h34v2H9z" fill="#fff1ce" opacity=".8"/><path d="M35 29h-2v12h2v7h2v5h3v4h-5v-4h-3v-6h-2v-8h2V29z M39 64h5v3H12v-1h27z M44 73h4v3H8v-1h36z" fill="#837b64" opacity=".8"/><path d="M24 31h1v6h-1z M31 31h1v6h-1z M22 48h1v4h-1z M33 48h1v4h-1z M16 60h24v1H16z M12 69h32v1H12z" fill="#f8ebc8" opacity=".8"/><path d="M17 66h22v1H17z M12 76h32v1H12z M23 25h10v1H23z" fill="#655d4e" opacity=".7"/><path d="M21.5 11.5h.5v4h-.5z M23.5 8.5h5v.5h-5z M25.5 29h.5v12h-.5z M24.5 42h.5v7h-.5z M22.5 50h.5v4h-.5z M18 61h18v.5H18z M15 64h23v.5H15z M12 70h29v.5H12z M10 73h33v.5H10z" fill="#fff5d8" opacity=".75"/><path d="M34.5 30h.5v8h-.5z M35.5 42h.5v6h-.5z M37.5 52h.5v3h-.5z M18 67h22v.5H18z M14 77h30v.5H14z" fill="#625b4b" opacity=".55"/></g><path d="M40 125h32v1H40z M31 139h50v1H31z M30 148h52v1H30z M48 55h1v20h-1z M64 55h1v20h-1z M43 103h1v5h-1z M68 103h1v5h-1z" fill="#fff3d4" opacity=".65"/></svg>`;
}

function render() {
  status.textContent = `현재 위치 ${coordinates(position)}. ${selected ? '이동할 칸을 선택하세요.' : '캐릭터를 선택하세요.'}`;
  for (const { button, x, y } of cells) {
    const isCharacter = x === position.x && y === position.y;
    if (isCharacter) characterButton = button;
    const tint = (x + y) % 2 === 0 ? 'rgba(237, 224, 193, .12)' : 'rgba(24, 39, 32, .30)';
    const landscape = landscapeAt(x, y);
    button.style.backgroundImage = `linear-gradient(${tint}, ${tint}), ${landscape.background}`;
    const buildings = landscape.buildings.map(item => `<img class="world-building" alt="" draggable="false" src="${item.src}" style="left:${(item.x + item.width / 2) / 256 * 100}%;top:${(item.y + item.height) / 256 * 100}%;width:${item.width / 256 * 100}%">`).join('');
    const inhabitants = residents.filter(piece => piece.x === x && piece.y === y);
    const markers = inhabitants.map((piece, index) => {
      const [left, top] = residentSlots[index % residentSlots.length];
      return pieceMarker(piece.type).replace('class="avatar"', `class="avatar resident ${piece.color}" style="left:${left}%;top:${top}%"`);
    }).join('');
    button.innerHTML = buildings + (isCharacter ? pieceMarker(rank.value).replace('</svg>', '<g class="player-marker"><rect x="18" y="-65" width="76" height="38" rx="6" fill="#e9f2cf" stroke="#304a3b" stroke-width="3"/><path d="M47 -27h18l-9 13z" fill="#e9f2cf"/><text x="56" y="-38" text-anchor="middle" fill="#263c30" font-size="24" font-family="NeoDGM, sans-serif" font-weight="bold">나</text></g></svg>') : '') + markers;
    button.className = `cell terrain-${terrainAt(x, y)} ${(x + y) % 2 === 0 ? 'district-light' : 'district-dark'}${isCharacter ? ' character' : ''}${inhabitants.length ? ' inhabited' : ''}${landscape.buildings.length ? ' has-buildings' : ''}${isCharacter && selected ? ' selected' : ''}`;
    button.setAttribute('aria-label', `${x + 1}열 ${y + 1}행${isCharacter ? ', 내 캐릭터' : ''}${inhabitants.length ? `, 다른 말 ${inhabitants.length}개` : ''}`);
  }
}

function openInspection(target) {
  destination = target;
  document.querySelector('#origin').textContent = coordinates(position);
  document.querySelector('#destination').textContent = coordinates(destination);
  document.querySelector('#applicant').textContent = rank.options[rank.selectedIndex].text;
  inspection.classList.remove('rejected');
  stopCameraFeed();
  const cameraMode = modeSelect.value === 'camera';
  inspection.dataset.mode = modeSelect.value;
  intro.textContent = cameraMode ? '카메라를 켜고 통행증을 화면에 맞춰 주세요.' : 'NFC 통행증을 확인하는 흐름입니다.';
  scannerSymbol.textContent = cameraMode ? 'CAM' : 'NFC';
  scannerLabel.textContent = cameraMode ? 'CAMERA / SIMULATION' : 'NFC / SIMULATION';
  result.textContent = cameraMode ? '카메라 연결 대기' : '통행증 태그 대기';
  result.className = '';
  detail.textContent = cameraMode ? '카메라 연결 버튼을 누르면 브라우저의 접근 허가를 요청합니다.' : '통행증을 판독기에 갖다 대는 상황을 가정합니다.';
  check.textContent = cameraMode ? '카메라 연결' : 'NFC 태그 시뮬레이션';
  simulationNote.textContent = cameraMode ? '카메라는 실제 영상입니다. 이미지 인식과 승인 판정은 테스트 시뮬레이션입니다.' : '테스트 시뮬레이션 · 실제 NFC 기기와 연결되지 않았습니다.';
  check.disabled = false;
  check.hidden = false;
  close.hidden = false;
  close.textContent = '신청 취소';
  exploration.inert = true;
  transitioning = true;
  transition.classList.add('active');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => { inspection.hidden = false; animatePaper(); }, reduced ? 0 : 850);
  setTimeout(() => { transition.classList.remove('active'); transitioning = false; inspection.focus(); }, reduced ? 0 : 1700);
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (x === position.x && y === position.y) { selected = !selected; render(); return; }
      if (selected) openInspection({ x, y });
    });
    map.append(button);
    cells.push({ button, x, y });
  }
}
check.addEventListener('click', () => {
  if (transitioning || !destination || check.disabled) return;
  const cameraMode = inspection.dataset.mode === 'camera';
  if (cameraMode && !cameraStream) { startCamera(); return; }
  check.disabled = true;
  if (cameraMode) inspection.classList.add('camera-scanning');
  result.textContent = cameraMode ? '이미지 인식 중' : '통행증 확인 중';
  detail.textContent = cameraMode ? '가상의 인식 결과를 처리하고 있습니다.' : '가상의 태그 정보를 확인하고 있습니다.';
  inspectionTimer = setTimeout(() => {
    inspectionTimer = null;
    if (!destination || inspection.hidden) return;
    stopCameraFeed();
    const approved = canMove(rank.value, position, destination);
    if (approved) position = destination;
    selected = false;
    result.textContent = approved ? '이동 승인' : '이동 거절';
    result.className = approved ? 'approved' : 'denied';
    if (!approved) inspection.classList.add('rejected');
    detail.textContent = approved ? '이동 규칙 확인 완료. 목적지로 이동했습니다.' : '이동 규칙에 맞지 않아 현재 위치에 남습니다.';
    check.hidden = true;
    close.hidden = true;
    render();
    returnTimer = setTimeout(() => returnToMap(true), 2200);
  }, cameraMode ? 2400 : 1200);
});
function returnToMap(animated = false) {
  if (transitioning) return;
  stopPaperAnimation();
  stopCameraFeed();
  clearTimeout(returnTimer);
  clearTimeout(inspectionTimer);
  returnTimer = null;
  inspectionTimer = null;
  if (!animated) {
    inspection.hidden = true;
    exploration.inert = false;
    destination = null;
    characterButton.focus();
    return;
  }
  transitioning = true;
  transition.classList.add('returning');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    inspection.hidden = true;
    exploration.inert = false;
    destination = null;
    characterButton.focus();
  }, reduced ? 0 : 850);
  setTimeout(() => {
    transition.classList.remove('returning');
    transitioning = false;
  }, reduced ? 0 : 1700);
}
close.addEventListener('click', () => returnToMap());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !inspection.hidden && !check.hidden) returnToMap();
});
rank.addEventListener('change', () => { selected = false; render(); });
render();
Promise.all(Object.entries(spriteStates).map(([key, state]) => loadSprite(key, state))).then(() => {
  landscapes.clear();
  render();
  const errors = Object.entries(spriteStates).filter(([, state]) => state.status === 'error');
  const notice = document.querySelector('#sprite-errors');
  notice.hidden = errors.length === 0;
  notice.textContent = errors.length ? `스프라이트 연결 오류: ${errors.map(([key, state]) => `${key} — ${state.reason}`).join(' / ')}` : '';
});

const zoom = document.querySelector('#zoom');
const zoomValue = document.querySelector('#zoom-value');
const stage = document.querySelector('.world-stage');
function updateZoom() {
  stage.style.zoom = `${zoom.value}%`;
  zoomValue.textContent = `${zoom.value}%`;
}
zoom.addEventListener('input', updateZoom);
document.querySelector('#zoom-in').addEventListener('click', () => { zoom.stepUp(); updateZoom(); });
document.querySelector('#zoom-out').addEventListener('click', () => { zoom.stepDown(); updateZoom(); });
updateZoom();

const mapArea = document.querySelector('.map-area');
function centerCharacter() {
  if (!characterButton) return;
  const area = mapArea.getBoundingClientRect();
  const character = characterButton.getBoundingClientRect();
  mapArea.scrollLeft += character.left + character.width / 2 - (area.left + area.width / 2);
  mapArea.scrollTop += character.top + character.height / 2 - (area.top + area.height / 2);
}
// Browsers expose trackpad pinch as a Ctrl+wheel gesture.
mapArea.addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const before = map.getBoundingClientRect();
  const previous = Number(zoom.value);
  const next = Math.max(Number(zoom.min), Math.min(Number(zoom.max), previous * Math.exp(-event.deltaY * 0.01)));
  zoom.value = String(next);
  updateZoom();
  const after = map.getBoundingClientRect();
  const ratio = Number(zoom.value) / previous;
  mapArea.scrollLeft += (event.clientX - before.left) * (ratio - 1) + (after.left - before.left);
  mapArea.scrollTop += (event.clientY - before.top) * (ratio - 1) + (after.top - before.top);
}, { passive: false });
requestAnimationFrame(() => requestAnimationFrame(centerCharacter));

// Use physical key positions so the controls work with Korean input too.
const pressedKeys = new Set();
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
let cameraFrame = null;
let previousFrame = null;
let velocityX = 0;
let velocityY = 0;
let remainderX = 0;
let remainderY = 0;
function stopCamera() {
  pressedKeys.clear();
  velocityX = velocityY = remainderX = remainderY = 0;
  previousFrame = null;
  if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
  cameraFrame = null;
}
function moveCamera(time) {
  if (!inspection.hidden || transitioning || document.hidden) { stopCamera(); return; }
  const delta = previousFrame === null ? 0 : Math.min((time - previousFrame) / 1000, .05);
  previousFrame = time;
  let dx = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
  let dy = Number(pressedKeys.has('KeyS')) - Number(pressedKeys.has('KeyW'));
  const length = Math.hypot(dx, dy) || 1;
  dx /= length; dy /= length;
  const blend = 1 - Math.exp(-12 * delta);
  velocityX += (dx * 600 - velocityX) * blend;
  velocityY += (dy * 600 - velocityY) * blend;
  remainderX += velocityX * delta;
  remainderY += velocityY * delta;
  const stepX = Math.trunc(remainderX), stepY = Math.trunc(remainderY);
  remainderX -= stepX; remainderY -= stepY;
  mapArea.scrollBy(stepX, stepY);
  if (!pressedKeys.size && Math.hypot(velocityX, velocityY) < 1) { stopCamera(); return; }
  cameraFrame = requestAnimationFrame(moveCamera);
}
document.addEventListener('keydown', event => {
  if (!inspection.hidden || transitioning || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if (movementKeys.has(event.code)) {
    event.preventDefault();
    pressedKeys.add(event.code);
    if (cameraFrame === null) cameraFrame = requestAnimationFrame(moveCamera);
  } else if ((event.code === 'KeyQ' || event.code === 'KeyE') && !event.repeat) {
    event.preventDefault();
    if (event.code === 'KeyQ') zoom.stepDown(); else zoom.stepUp();
    updateZoom();
  }
});
document.addEventListener('keyup', event => pressedKeys.delete(event.code));
window.addEventListener('blur', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
