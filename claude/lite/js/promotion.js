// 승급 흐름 로직 (화면과 분리). DOM·타이머를 쓰지 않아 node 로 바로 시험할 수 있다.
//
// 흐름: idle → cutscene (로켓 비행) → arrived (승급소 도착, 비숍 인사)
//       → choosing (계급 고르기) → confirm (선택 확인) → transform (변화 컷씬) → promoted (승급 완료)
//       어느 단계에서든 abort() 하면 aborted (폰 그대로 지표면 귀환)
// 고를 수 있는 계급: 퀸·룩·비숍·나이트. 킹은 승급 대상이 아니고, 폰은 승급이 아니다.
import { RANK_KO } from './rules.js';

export const STEP = Object.freeze({
  IDLE: 'idle', CUTSCENE: 'cutscene', ARRIVED: 'arrived', CHOOSING: 'choosing',
  CONFIRM: 'confirm', TRANSFORM: 'transform', PROMOTED: 'promoted', ABORTED: 'aborted',
});

// 화면에 보이는 순서대로. 킹은 잠긴 선택지로만 보여 준다.
export const CHOICES = Object.freeze(['queen', 'rook', 'bishop', 'knight']);
export const LOCKED = Object.freeze({ king: '킹은 승급으로 오를 수 없는 자리입니다.' });

// 컷씬 장면(지금은 글자만). ms 는 자동으로 넘어가기까지의 시간.
export const CUTSCENE = Object.freeze([
  { id: 'ignite', ms: 1800, title: '점화', text: '승급소 로켓의 엔진이 깨어납니다.' },
  { id: 'liftoff', ms: 1800, title: '이륙', text: '발사대를 떠나 행성 표면이 멀어집니다.' },
  { id: 'orbit', ms: 2000, title: '궤도 진입', text: '구름 바다 위, 떠 있는 승급 타워가 보입니다.' },
  { id: 'dock', ms: 1800, title: '도킹', text: '승급소 계류탑에 로켓이 닿았습니다.' },
]);

// 계급을 정한 뒤 변화하러 들어가는 컷씬(지금은 글자만). 고른 계급에 따라 글이 바뀐다.
export const TRANSFORM = Object.freeze([
  { id: 'enter', ms: 1800, title: '입수', text: () => '폰이 승급의 수조 안으로 걸어 들어갑니다.' },
  { id: 'dissolve', ms: 1800, title: '해체', text: () => '빛이 차오르고, 폰의 갑주가 한 겹씩 풀려 떠오릅니다.' },
  { id: 'forge', ms: 2000, title: '재구성', text: r => `${RANK_KO[r]}의 형상이 빛 속에서 새겨집니다.` },
  { id: 'awaken', ms: 1800, title: '각성', text: r => `수조가 열리고, ${toward(RANK_KO[r])} 눈을 뜹니다.` },
]);
export const sceneList = step => (step === 'transform' ? TRANSFORM : CUTSCENE);

// 판정만 하는 순수 함수
export function canPromoteTo(rank) {
  if (CHOICES.includes(rank)) return { ok: true, rank };
  if (LOCKED[rank]) return { ok: false, rank, code: 'locked', message: LOCKED[rank] };
  if (rank === 'pawn') return { ok: false, rank, code: 'same', message: '폰은 이미 지금의 계급입니다.' };
  return { ok: false, rank, code: 'unknown', message: '알 수 없는 계급입니다.' };
}

// 받침 있으면 '으로', 없거나 ㄹ 받침이면 '로'
export const toward = w => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  const jong = c >= 0 && c < 11172 ? c % 28 : 0;
  return w + (jong && jong !== 8 ? '으로' : '로');
};

export function createPromotion({ from = 'pawn', onChange = () => {} } = {}) {
  let step = STEP.IDLE, scene = -1, choice = null, error = null;
  const emit = () => onChange(snapshot());
  const playing = () => step === STEP.CUTSCENE || step === STEP.TRANSFORM;
  const snapshot = () => {
    const sc = playing() ? sceneList(step)[scene] : null;
    return { step, scene, sceneInfo: sc ? { ...sc, text: typeof sc.text === 'function' ? sc.text(choice) : sc.text } : null, choice, error, from };
  };
  const go = s => { step = s; emit(); return true; };
  const only = (...ok) => ok.includes(step);

  return {
    get step() { return step; },
    get choice() { return choice; },
    get scene() { return scene; },
    snapshot,
    // 탑승 승인 직후
    start() {
      if (!only(STEP.IDLE)) return false;
      if (from !== 'pawn') { error = '폰만 승급소에 갈 수 있습니다.'; return go(STEP.ABORTED); }
      scene = 0; choice = null; error = null;
      return go(STEP.CUTSCENE);
    },
    // 컷씬 다음 장면. 마지막 장면 다음이면 (비행 → 도착, 변화 → 승급 완료)
    next() {
      if (!playing()) return false;
      const list = sceneList(step);
      if (scene < list.length - 1) { scene++; return go(step); }
      return this.skip();
    },
    skip() {
      if (!playing()) return false;
      scene = sceneList(step).length - 1;
      return go(step === STEP.CUTSCENE ? STEP.ARRIVED : STEP.PROMOTED);
    },
    // 비숍의 인사를 다 듣고 고르기 시작
    begin() { if (!only(STEP.ARRIVED)) return false; error = null; return go(STEP.CHOOSING); },
    pick(rank) {
      if (!only(STEP.CHOOSING)) return false;
      const r = canPromoteTo(rank);
      if (!r.ok) { error = r.message; emit(); return false; }
      choice = rank; error = null;
      return go(STEP.CONFIRM);
    },
    // 확인 단계에서 다시 고르기
    back() { if (!only(STEP.CONFIRM)) return false; choice = null; return go(STEP.CHOOSING); },
    // 확정하면 변화 컷씬이 시작되고, 끝나야 승급 완료
    confirm() { if (!only(STEP.CONFIRM)) return false; scene = 0; return go(STEP.TRANSFORM); },
    // 승급하지 않고 돌아가기 (승급 완료 뒤에는 의미 없음)
    // 변화가 시작된 뒤에는 되돌릴 수 없다
    abort() { if (only(STEP.TRANSFORM, STEP.PROMOTED, STEP.ABORTED, STEP.IDLE)) return false; choice = null; return go(STEP.ABORTED); },
    // 결과: 승급했으면 새 계급, 아니면 null
    get result() { return step === STEP.PROMOTED ? choice : null; },
  };
}

// 비숍 대사 (화면에서 쓴다)
export const BISHOP = Object.freeze({
  greet: ['세계의 끝을 건너온 폰이여, 승급의 탑에 온 것을 환영하네.', '나는 이 탑을 지키는 비숍이라네. 이제 자네가 될 모습을 고를 차례지.'],
  choose: '어떤 계급이 되고 싶은가? 킹의 자리는 승급으로 오를 수 없다네.',
  confirm: rank => `${toward(RANK_KO[rank])} 승급하겠는가? 한 번 오른 계급은 되돌릴 수 없다네.`,
  done: rank => `이제 자네는 ${RANK_KO[rank]}일세. 지표면으로 돌아가 새 걸음을 내딛게.`,
  abort: '언제든 다시 오게. 폰의 길도 귀한 길이라네.',
});
