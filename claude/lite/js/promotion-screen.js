// 승급소 화면: 로켓 컷씬 → 도착 → 비숍과 계급 고르기 → 확인 → 귀환.
// 흐름 판단은 promotion.js 가 하고, 여기서는 버튼·글자·키보드만 다룬다.
// 비주얼은 아직 자리만 있다(컷씬은 글자 장면, 승급소 풍경은 폰 수조 예정 자리).
import { RANK_KO, RANK_EN, RULE_TEXT } from './rules.js';
import { createPromotion, CHOICES, LOCKED, STEP, BISHOP, sceneList } from './promotion.js';

export function createPromotionScreen({ sfx }) {
  const root = document.querySelector('#promotion');
  const $ = s => root.querySelector(s);
  const lineEl = $('#pr-line'), errEl = $('#pr-error'), list = $('#pr-choices');
  const cutTitle = $('#pr-cut-title'), cutText = $('#pr-cut-text'), cutSteps = $('#pr-cut-steps');

  let flow = null, resolve = null, timers = [], typing = null, from = 'pawn';
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; clearInterval(typing); };

  // 컷씬 두 가지: 로켓 비행(도착 전), 변화(계급 확정 뒤). 같은 자리를 쓰고 글만 바꾼다
  const CUT_LABEL = {
    cutscene: ['ROCKET FLIGHT · CB-120 → PROMOTION TOWER', '로켓 비행 컷씬 자리 (준비 중)'],
    transform: ['TRANSFORMATION · CHAMBER OF RANKS', '변화 컷씬 자리 · 폰 수조 (준비 중)'],
  };
  let cutKind = '';
  function setCutKind(kind, rank) {
    if (cutKind === kind) return;
    cutKind = kind;
    $('#pr-cut-over').textContent = kind === 'transform' ? `TRANSFORMATION · PAWN → ${RANK_EN[rank]}` : CUT_LABEL[kind][0];
    $('#pr-cut-ph').textContent = CUT_LABEL[kind][1];
    cutSteps.innerHTML = sceneList(kind).map(s => `<li data-id="${s.id}">${s.title}</li>`).join('');
  }
  // 선택지 버튼: 고를 수 있는 넷 + 잠긴 킹
  list.innerHTML = [...CHOICES, ...Object.keys(LOCKED)].map((r, i) => {
    const locked = !!LOCKED[r];
    return `<button type="button" class="pr-choice${locked ? ' locked' : ''}" data-rank="${r}"${locked ? ' aria-disabled="true"' : ''}>
      ${locked ? '<i>잠김</i>' : `<kbd>${i + 1}</kbd>`}<b>${RANK_KO[r]}</b><small>${RANK_EN[r]}</small><span>${RULE_TEXT[r]}</span></button>`;
  }).join('');

  function say(text, then) {
    clearInterval(typing);
    let i = 0;
    lineEl.textContent = '';
    typing = setInterval(() => {
      lineEl.textContent = text.slice(0, ++i);
      if (i % 2) sfx.tick();
      if (i >= text.length) { clearInterval(typing); then?.(); }
    }, 30);
  }

  // 단계가 바뀔 때마다 화면을 맞춘다
  function render(s) {
    const same = root.dataset.step === s.step && s.step !== STEP.CUTSCENE && s.step !== STEP.TRANSFORM;
    root.dataset.step = s.step;
    errEl.textContent = s.error || '';
    if (s.error) sfx.deny();
    if (same) return;          // 같은 단계 안의 변화(잘못 고른 경우 등)는 안내문만 바꾼다
    root.classList.toggle('transforming', s.step === STEP.TRANSFORM);
    if (s.step === STEP.CUTSCENE || s.step === STEP.TRANSFORM) {
      setCutKind(s.step, s.choice);
      const sc = s.sceneInfo;
      cutTitle.textContent = sc.title;
      cutText.textContent = sc.text;
      [...cutSteps.children].forEach((li, i) => { li.className = i < s.scene ? 'done' : i === s.scene ? 'now' : ''; });
      sfx.scan();
      clear();
      later(() => flow.next(), sc.ms);
    } else if (s.step === STEP.ARRIVED) {
      clear();
      sfx.door();
      const [a, b] = BISHOP.greet;
      later(() => say(a, () => later(() => say(b, () => { $('#pr-begin').disabled = false; $('#pr-begin').focus(); }), 700)), 500);
      $('#pr-begin').disabled = true;
    } else if (s.step === STEP.CHOOSING) {
      say(BISHOP.choose);
      list.querySelectorAll('.pr-choice').forEach(b => b.classList.remove('on'));
      list.querySelector('.pr-choice:not(.locked)')?.focus();
    } else if (s.step === STEP.CONFIRM) {
      sfx.target();
      list.querySelectorAll('.pr-choice').forEach(b => b.classList.toggle('on', b.dataset.rank === s.choice));
      $('#pr-confirm-text').textContent = `${RANK_KO[from]} → ${RANK_KO[s.choice]} · ${RANK_EN[s.choice]}`;
      say(BISHOP.confirm(s.choice));
      $('#pr-yes').focus();
    } else if (s.step === STEP.PROMOTED) {
      sfx.approve();
      say(BISHOP.done(s.choice), () => $('#pr-home').focus());
    } else if (s.step === STEP.ABORTED) {
      say(BISHOP.abort);
      later(() => finish(null), 1600);
    }
  }

  function open(rank) {
    from = rank;
    cutKind = '';
    clear();
    flow = createPromotion({ from: rank, onChange: render });
    root.dataset.step = 'idle';
    lineEl.textContent = '';
    errEl.textContent = '';
    root.hidden = false;
  }

  // 컷씬을 시작하고, 끝나면 새 계급(또는 null)으로 풀린다
  function play() {
    return new Promise(res => { resolve = res; flow.start(); });
  }

  function finish(v) {
    clear();
    const r = resolve;
    resolve = null;
    r?.(v);
  }

  function hide() { clear(); root.hidden = true; root.dataset.step = 'idle'; flow = null; }

  // ---------- 버튼 ----------
  $('#pr-skip').addEventListener('click', () => flow?.skip());
  $('#pr-begin').addEventListener('click', () => flow?.begin());
  list.addEventListener('click', e => { const b = e.target.closest('.pr-choice'); if (b) flow?.pick(b.dataset.rank); });
  $('#pr-yes').addEventListener('click', () => flow?.confirm());
  $('#pr-back').addEventListener('click', () => flow?.back());
  $('#pr-home').addEventListener('click', () => { if (flow?.step === STEP.PROMOTED) finish(flow.result); });
  $('#pr-abort').addEventListener('click', () => flow?.abort());

  // ---------- 키보드 (화면이 열려 있을 때만) ----------
  document.addEventListener('keydown', e => {
    if (root.hidden || !flow || !resolve) return;
    const st = flow.step;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (st === STEP.CUTSCENE || st === STEP.TRANSFORM) flow.skip();
      else if (st === STEP.CONFIRM) flow.back();
    } else if (e.key === 'Enter' && !e.repeat) {
      // 포커스된 버튼은 브라우저가 누르므로, 버튼이 아닌 곳에서만 대신 누른다
      if (document.activeElement?.tagName === 'BUTTON' && root.contains(document.activeElement)) return;
      e.preventDefault();
      if (st === STEP.ARRIVED && !$('#pr-begin').disabled) flow.begin();
      else if (st === STEP.CONFIRM) flow.confirm();
      else if (st === STEP.PROMOTED) finish(flow.result);
    } else if (st === STEP.CHOOSING && /^[1-9]$/.test(e.key)) {
      const r = CHOICES[+e.key - 1];
      if (r) flow.pick(r);
    }
  });

  return { open, play, hide, isOpen: () => !!resolve };
}
