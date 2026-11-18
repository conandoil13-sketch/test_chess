// 테스트 가정이며 CB-120의 공식 이동 법칙이 아니다. (chessworld_test/rules.js와 동일한 판정)
export function canMove(rank, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return false;
  switch (rank) {
    case 'pawn': return dx === 0 && dy === -1;
    case 'knight': return (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
    case 'rook': return dx === 0 || dy === 0;
    case 'bishop': return ax === ay;
    case 'queen': return dx === 0 || dy === 0 || ax === ay;
    case 'king': return ax <= 1 && ay <= 1;
    default: return false;
  }
}

export const RANK_KO = { pawn: '폰', knight: '나이트', rook: '룩', bishop: '비숍', queen: '퀸', king: '킹' };
export const RANK_EN = { pawn: 'PAWN', knight: 'KNIGHT', rook: 'ROOK', bishop: 'BISHOP', queen: 'QUEEN', king: 'KING' };
export const RULE_TEXT = {
  pawn: '정면(화면 위쪽) 한 칸',
  knight: 'L자 도약 (2·1)',
  rook: '수평·수직 직선',
  bishop: '대각선',
  queen: '직선·대각선',
  king: '모든 방향 한 칸',
};
