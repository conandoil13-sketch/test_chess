// 이동관리국 통행 심사 장면.
// 판정은 rules.js의 테스트 행마법만 사용한다. NFC·이미지 인식은 시뮬레이션이다.
import { canMove, RANK_KO, RANK_EN, RULE_TEXT } from './rules.js';
import { createOfficer } from './officer.js';
import { createBooth, createCounter, createSign } from './booth.js';
import { N } from './world.js';
import { createNave } from './nave.js';
import { createLanterns } from './lanterns.js';

const coord = p => `(${p.x + 1}, ${p.y + 1})`;
const vec = (a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const parts = [];
  if (dx) parts.push(`${dx > 0 ? '→' : '←'}${Math.abs(dx)}`);
  if (dy) parts.push(`${dy < 0 ? '↑' : '↓'}${Math.abs(dy)}`);
  return parts.join('  ') || '—';
};

export function createInspection({ sfx }) {
  const root = document.querySelector('#inspection');
  const $ = s => root.querySelector(s);
  const paper = $('#paper'), stamp = $('#stamp'), log = $('#scan-log'), video = $('#cam-video');
  const camBtn = $('#cam-btn'), checkBtn = $('#check-btn'), cancelBtn = $('#cancel-btn');
  const lineEl = $('#officer-line'), state = $('#screen-state'), verdictEl = $('#screen-verdict');
  const banner = $('#banner'), inner = $('.insp-inner');
  // 홀 배경: 평소엔 하늘인 척하는 스테인드글라스, 판정에 따라 초록/빨강으로 켜진다
  const hallState = () => root.classList.contains('denied') ? 'denied' : root.classList.contains('approved') ? 'approved' : root.classList.contains('scanning') ? 'scanning' : 'idle';
  let hall = null, lanterns = null;
  // 라이트: 3배 해상도, 30fps, 김 효과 끔
  // 홀 배경과 같은 도트 격자(화면 px/도트, 정수)
  const hallScale = () => { const c = $('#hall-nave'); const k = c.width ? parseFloat(c.style.width) / c.width : 0; return k || Math.max(2, Math.round(innerHeight / 235)); };
  const shown = () => !root.hidden;
  createOfficer($('#officer'), { theme: 'black', zoom: hallScale, isActive: shown, getMood: hallState, fps: 30, vapor: false });
  createBooth($('.booth'), { getMood: hallState, isActive: shown, getScale: hallScale, officer: $('#officer') });
  createCounter($('.counter'), { getScale: hallScale, isActive: shown, getMood: hallState });
  createSign($('.sign'), { getScale: hallScale, isActive: shown, getMood: hallState, booth: $('.booth') });

  let req = null, resolve = null, busy = false, stream = null, camReq = 0, timers = [], typing = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function say(text) {
    clearInterval(typing);
    let i = 0;
    lineEl.textContent = '';
    typing = setInterval(() => {
      lineEl.textContent = text.slice(0, ++i);
      if (i % 2) sfx.tick();
      if (i >= text.length) clearInterval(typing);
    }, 32);
  }

  function stopCam() {
    camReq++;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    root.classList.remove('cam-live');
  }

  async function startCam() {
    const id = ++camReq;
    if (!navigator.mediaDevices?.getUserMedia) { state.textContent = '이 브라우저에서는 카메라를 쓸 수 없습니다'; return; }
    camBtn.disabled = true;
    state.textContent = '카메라 권한을 확인해 주세요';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (id !== camReq || !resolve) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      video.hidden = false;
      root.classList.add('cam-live');
      await video.play().catch(() => {});
      state.textContent = '통행증을 화면 중앙에 맞춰 주세요';
    } catch (e) {
      if (id !== camReq) return;
      state.textContent = e.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다 · 시뮬레이션으로 진행 가능' : '카메라 연결 실패 · 시뮬레이션으로 진행 가능';
    } finally {
      camBtn.disabled = false;
    }
  }

  function drawMap(from, to) {
    const cv = $('#p-map'), c = cv.getContext('2d'), k = cv.width / N;
    c.fillStyle = '#e6dcc2'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(60,45,30,.16)';
    for (let i = 0; i <= N; i++) { c.fillRect(i * k, 0, 1, cv.height); c.fillRect(0, i * k, cv.width, 1); }
    c.strokeStyle = '#2b241a'; c.lineWidth = 2; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo((from.x + 0.5) * k, (from.y + 0.5) * k); c.lineTo((to.x + 0.5) * k, (to.y + 0.5) * k); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#2b241a'; c.fillRect(from.x * k + 1, from.y * k + 1, k - 2, k - 2);
    c.strokeStyle = '#b3242f'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(to.x * k + 1, to.y * k + 1); c.lineTo(to.x * k + k - 1, to.y * k + k - 1);
    c.moveTo(to.x * k + k - 1, to.y * k + 1); c.lineTo(to.x * k + 1, to.y * k + k - 1); c.stroke();
  }

  function prepare(r) {
    req = r;
    root.dataset.mode = r.mode;
    root.classList.remove('scanning', 'approved', 'denied', 'done', 'cam-live');
    paper.classList.remove('fly');
    stamp.className = 'stamp';
    stamp.innerHTML = '';
    banner.className = 'banner';
    verdictEl.textContent = '';
    log.textContent = '';
    lineEl.textContent = '';
    $('#queue-no').textContent = String(r.no).padStart(3, '0');
    $('#paper-no').textContent = 'No. ' + String(r.no).padStart(4, '0');
    $('#p-rank').textContent = `${RANK_KO[r.rank]} · ${RANK_EN[r.rank]}`;
    $('#p-mode').textContent = r.mode === 'camera' ? '카메라 이미지 인식' : 'NFC 통행증';
    $('#p-from').textContent = `${coord(r.from)} ${r.fromLabel}`;
    $('#p-to').textContent = `${coord(r.to)} ${r.toLabel}`;
    $('#p-vec').textContent = vec(r.from, r.to);
    drawMap(r.from, r.to);
    state.textContent = r.mode === 'camera' ? '카메라를 연결하거나 바로 검사를 실행하세요' : '통행증을 장치에 대 주세요';
    checkBtn.textContent = r.mode === 'camera' ? '인식 실행' : '태그 · 검사 실행';
    checkBtn.disabled = true;
    cancelBtn.disabled = true;
    root.hidden = false;
    if (!hall) { hall = createNave($('#hall-nave'), { scene: 'hall', getState: hallState }); lanterns = createLanterns($('#hall-lanterns'), hallState); }
    else { hall.start(); lanterns.start(); }
  }

  function enter() {
    paper.classList.add('fly');
    later(() => sfx.paper(), 120);
    later(() => say('다음 분. 통행증을 확인하겠습니다.'), 500);
    later(() => { checkBtn.disabled = false; cancelBtn.disabled = false; checkBtn.focus(); }, 900);
    return new Promise(res => { resolve = res; });
  }

  function check() {
    if (busy || !resolve) return;
    busy = true;
    checkBtn.disabled = true;
    cancelBtn.disabled = true;
    root.classList.add('scanning');
    say(req.mode === 'camera' ? '화면에 비춰진 통행증을 판독합니다.' : '통행증 신호를 읽고 있습니다.');
    const id = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const lines = req.mode === 'camera'
      ? ['> 영상 프레임 수집 ...', '> 통행증 윤곽 추출 ...', `> 계급 분류: ${RANK_EN[req.rank]} (SIM)`, `> 이동 벡터 ${vec(req.from, req.to)}`, `> 규정 대조: ${RULE_TEXT[req.rank]}`, '> 판정 산출 ...']
      : ['> 통행증 신호 감지', `> 태그 ID 0x${id}`, `> 신원 대조: ${RANK_EN[req.rank]}`, `> 이동 벡터 ${vec(req.from, req.to)}`, `> 규정 대조: ${RULE_TEXT[req.rank]}`, '> 판정 산출 ...'];
    log.textContent = '';
    lines.forEach((l, i) => later(() => { log.textContent += l + '\n'; sfx.scan(); }, 260 + i * 330));
    later(() => verdict(canMove(req.rank, req.from, req.to)), 260 + lines.length * 330 + 300);
  }

  function verdict(ok) {
    root.classList.remove('scanning');
    root.classList.add('done', ok ? 'approved' : 'denied');
    stopCam();
    verdictEl.textContent = ok ? '승인' : '거절';
    state.textContent = ok ? 'PASSAGE GRANTED' : 'PASSAGE DENIED';
    stamp.className = 'stamp ' + (ok ? 'ok' : 'no');
    stamp.innerHTML = ok ? '통행 허가<small>APPROVED</small>' : '통행 불가<small>DENIED</small>';
    void stamp.offsetWidth;
    stamp.classList.add('hit');
    later(() => { sfx.stamp(); inner.classList.remove('shake'); void inner.offsetWidth; inner.classList.add('shake'); }, 150);
    later(() => (ok ? sfx.approve() : sfx.deny()), 320);
    banner.querySelector('b').textContent = ok ? '이동 승인' : '이동 거절';
    banner.querySelector('span').textContent = ok
      ? `${coord(req.to)} 으로 통행을 허가합니다`
      : `${RANK_KO[req.rank]}의 이동 규정(${RULE_TEXT[req.rank]})을 벗어납니다 · 현재 위치에 남습니다`;
    banner.classList.add('show', ok ? 'ok' : 'no');
    say(ok ? '확인되었습니다. 통과하십시오.' : '통행할 수 없습니다. 원위치로 돌아가십시오.');
    later(() => finish(ok), 2600);
  }

  function cancel() {
    if (busy || !resolve) return;
    finish(null);
  }

  function finish(v) {
    stopCam();
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(typing);
    busy = false;
    const r = resolve;
    resolve = null;
    r?.(v);
  }

  function hide() {
    root.hidden = true;
    hall?.stop();
    lanterns?.stop();
    root.classList.remove('scanning', 'approved', 'denied', 'done');
    inner.classList.remove('shake');
  }

  checkBtn.addEventListener('click', check);
  cancelBtn.addEventListener('click', cancel);
  camBtn.addEventListener('click', startCam);
  window.addEventListener('pagehide', stopCam);

  return { prepare, enter, hide, cancel, isOpen: () => !!resolve, isBusy: () => busy };
}
