// 승급소 탑승장 관문 로직 (아트와 아직 연결하지 않음). DOM·캔버스를 전혀 쓰지 않는다.
// 규칙: 폰만 승급소 로켓에 탈 수 있다. 나머지 계급은 나이트가 막는다.
// 상태 이름은 boarding.js 의 getState() 가 받는 값과 같다: 'idle' | 'checking' | 'granted' | 'denied'
//
// 사용 예 (나중에 아트와 합칠 때):
//   import { createBoardingGate } from './boarding-gate.js';
//   const gate = createBoardingGate({ onChange: (s, r) => console.log(s, r && r.message) });
//   createBoarding(canvas, { getState: () => gate.state });
//   gate.request({ rank: state.rank, color: 'white' });
import { RANK_KO } from './rules.js';

// 받침이 있으면 '은', 없으면 '는'
const topic = w => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? '은' : '는'); };

export const GATE = Object.freeze({ IDLE: 'idle', CHECKING: 'checking', GRANTED: 'granted', DENIED: 'denied' });

// 한 번의 판정. 순수 함수라 바로 시험할 수 있다.
export function checkBoarding(piece) {
  if (!piece || typeof piece !== 'object') return { ok: false, code: 'no-piece', message: '심사할 말이 없습니다.' };
  const rank = piece.rank;
  if (!RANK_KO[rank]) return { ok: false, code: 'unknown-rank', message: '계급을 확인할 수 없습니다.' };
  if (rank !== 'pawn') return { ok: false, code: 'not-pawn', rank, message: `${topic(RANK_KO[rank])} 승급소에 갈 수 없습니다. 폰만 탑승할 수 있습니다.` };
  return { ok: true, code: 'pawn', rank, message: '폰 확인. 승급소 로켓에 탑승하세요.' };
}

// 관문 상태 기계: idle → checking → granted | denied → (holdMs 뒤) idle
// 심사 중에는 새 요청을 받지 않는다. 시간 함수는 시험용으로 바꿔 끼울 수 있다.
export function createBoardingGate({
  checkMs = 1600, holdMs = 2600, onChange = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id),
} = {}) {
  let state = GATE.IDLE, result = null, timer = null;
  const set = (s, r = result) => { state = s; result = r; onChange(state, result); };
  const later = (fn, ms) => { if (timer !== null) clearTimer(timer); timer = setTimer(() => { timer = null; fn(); }, ms); };
  return {
    get state() { return state; },
    get result() { return result; },
    // 말이 관문 앞에 섰을 때. 받아들였으면 true
    request(piece) {
      if (state === GATE.CHECKING) return false;
      const r = checkBoarding(piece);
      set(GATE.CHECKING, null);
      later(() => {
        set(r.ok ? GATE.GRANTED : GATE.DENIED, r);
        later(() => set(GATE.IDLE, null), holdMs);
      }, checkMs);
      return true;
    },
    reset() { if (timer !== null) clearTimer(timer); timer = null; set(GATE.IDLE, null); },
  };
}
