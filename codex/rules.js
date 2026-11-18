// These are test assumptions, not a complete definition of CB-120's laws.
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
