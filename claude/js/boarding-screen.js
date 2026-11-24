// 승급소 탑승장 관문 심사 장면. 이동관리국(inspection.js)과 같은 흐름을 따른다:
//   prepare(req) → enter() → (검사 실행) → 승인 / 거절 → Promise 가 true | false | null 로 끝난다.
// 판정은 boarding-gate.js 의 폰 전용 규칙만 쓰고, 그 상태(idle/checking/granted/denied)가 그대로 아트를 움직인다.
import { createBoarding, W, H } from './boarding.js';
import { createBoardingGate, GATE } from './boarding-gate.js';
import { RANK_KO, RANK_EN } from './rules.js';

export function createBoardingScreen({ sfx }) {
  const root = document.querySelector('#boarding');
  const $ = s => root.querySelector(s);
  const canvas = $('#boarding-art'), log = $('#bd-log'), lineEl = $('#bd-line');
  const stateEl = $('#bd-state'), verdictEl = $('#bd-verdict'), banner = $('#bd-banner');
  const checkBtn = $('#bd-check'), cancelBtn = $('#bd-cancel'), rankSel = $('#bd-rank');
  const shown = () => !root.hidden;

  let req = null, resolve = null, busy = false, lastOk = false, timers = [], typing = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const LOG_MS = 330, LINES = 6;

  // 화면을 빈틈없이 덮는 정수 배율 (가운데 정렬, 넘치는 부분은 잘린다)
  const zoom = () => Math.max(1, Math.ceil(Math.max(innerWidth / W, innerHeight / H)));
  let art = null;

  const gate = createBoardingGate({
    checkMs: 260 + LINES * LOG_MS + 300, holdMs: 2600,
    onChange: (s, r) => {
      if (s === GATE.GRANTED || s === GATE.DENIED) verdict(r);
      else if (s === GATE.IDLE && busy) finish(lastOk);
    },
  });

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

  function prepare(r) {
    req = r;
    gate.reset();
    root.classList.remove('scanning', 'approved', 'denied', 'done');
    banner.className = 'banner';
    verdictEl.textContent = '';
    log.textContent = '';
    lineEl.textContent = '';
    $('#bd-no').textContent = 'No. ' + String(r.no).padStart(4, '0');
    rankSel.value = r.rank;   // 시험용: 다른 계급의 통행증을 내밀어 거절도 볼 수 있다
    rankSel.disabled = false;
    stateEl.textContent = '탑승권을 관문 장치에 대 주세요';
    checkBtn.disabled = true;
    cancelBtn.disabled = true;
    root.hidden = false;
    if (!art) art = createBoarding(canvas, { theme: r.theme || 'white', zoom, getState: () => gate.state, isActive: shown });
    else art.setTheme(r.theme || 'white');
  }

  function enter() {
    later(() => say('정지. 승급소 탑승 자격을 확인하겠습니다.'), 400);
    later(() => { checkBtn.disabled = false; cancelBtn.disabled = false; checkBtn.focus(); }, 800);
    return new Promise(res => { resolve = res; });
  }

  function check() {
    if (busy || !resolve) return;
    const rank = rankSel.value;
    if (!gate.request({ rank })) return;
    busy = true;
    rankSel.disabled = true;
    stateEl.textContent = '판독 중 ...';
    checkBtn.disabled = true;
    cancelBtn.disabled = true;
    root.classList.add('scanning');
    say('관문을 지나가십시오. 계급을 판독합니다.');
    const id = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const lines = ['> 탑승권 신호 감지', `> 태그 ID 0x${id}`, `> 신원 대조: ${RANK_EN[rank]}`, '> 위치 확인: 세계의 끝', '> 승인 조건: PAWN ONLY', '> 판정 산출 ...'];
    log.textContent = '';
    lines.forEach((l, i) => later(() => { log.textContent += l + '\n'; sfx.scan(); }, 260 + i * LOG_MS));
  }

  function verdict(r) {
    const ok = r.ok;
    lastOk = ok;
    root.classList.remove('scanning');
    root.classList.add('done', ok ? 'approved' : 'denied');
    verdictEl.textContent = ok ? '승인' : '거절';
    stateEl.textContent = ok ? 'BOARDING GRANTED' : 'BOARDING DENIED';
    later(() => (ok ? sfx.approve() : sfx.deny()), 200);
    banner.querySelector('b').textContent = ok ? '탑승 승인' : '탑승 거절';
    banner.querySelector('span').textContent = r.message;
    banner.classList.add('show', ok ? 'ok' : 'no');
    say(ok ? '폰 확인. 승급소 로켓에 탑승하십시오.' : `${RANK_KO[r.rank]} 통행증입니다. 폰만 지나갈 수 있습니다.`);
  }

  function cancel() {
    if (busy || !resolve) return;
    finish(null);
  }

  function finish(v) {
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
    gate.reset();
    root.classList.remove('scanning', 'approved', 'denied', 'done');
  }

  checkBtn.addEventListener('click', check);
  cancelBtn.addEventListener('click', cancel);

  return { prepare, enter, hide, cancel, isOpen: () => !!resolve, isBusy: () => busy };
}
