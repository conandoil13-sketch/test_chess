// 체스판 타일이 대각선 물결로 덮였다가 걷히는 화면 전환.
export function createTiles(root, cols = 16, rows = 9) {
  root.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  root.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  const tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = document.createElement('i');
    d.className = 't ' + ((r + c) % 2 ? 'dark' : 'light');
    root.append(d);
    tiles.push({ d, r, c });
  }
  const label = document.createElement('div');
  label.className = 'tiles-label';
  const setLabel = (over = 'CB-120', title = 'MOVEMENT AUTHORITY', sub = '이동관리국 연결 중') => {
    label.innerHTML = `<span>${over}</span><b>${title}</b><small>${sub}</small>`;
  };
  setLabel();
  root.append(label);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = [];
  const clear = () => { running.forEach(a => a.cancel()); running = []; };

  async function play(from, to, labelFrom, labelTo, ease) {
    clear();
    root.hidden = false;
    if (reduced) {
      tiles.forEach(({ d }) => running.push(d.animate([{ transform: to }], { duration: 1, fill: 'forwards' })));
      running.push(label.animate([{ opacity: labelTo }], { duration: 1, fill: 'forwards' }));
      return;
    }
    tiles.forEach(({ d, r, c }) => running.push(d.animate([{ transform: from }, { transform: to }], { duration: 360, delay: (c + r) * 24, easing: ease, fill: 'forwards' })));
    running.push(label.animate([{ opacity: labelFrom }, { opacity: labelTo }], { duration: 220, delay: labelTo ? 380 : 0, fill: 'forwards' }));
    await Promise.all(running.map(a => a.finished.catch(() => {})));
  }

  return {
    // 전환 중 가운데 표지 글자. 인자 없이 부르면 이동관리국 기본값으로 돌아간다
    label: setLabel,
    async cover() { await play('scale(0) rotate(-90deg)', 'scale(1.03) rotate(0deg)', 0, 1, 'cubic-bezier(.6,0,.3,1)'); },
    async uncover() {
      await play('scale(1.03) rotate(0deg)', 'scale(0) rotate(90deg)', 1, 0, 'cubic-bezier(.6,0,.3,1)');
      clear();
      root.hidden = true;
    },
  };
}
