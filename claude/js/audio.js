// 짧은 합성 효과음. 외부 파일 없이 WebAudio로 만든다.
let ac = null;
let on = true;
try { on = localStorage.getItem('cbc-sound') !== 'off'; } catch {}

function ctx() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ac = new A();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, { type = 'square', vol = 0.035, at = 0, to = null } = {}) {
  if (!on) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, vol = 0.2, at = 0, freq = 800) {
  if (!on) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  tick: () => tone(1400, 0.018, { vol: 0.008 }),
  select: () => { tone(660, 0.06); tone(990, 0.09, { at: 0.06 }); },
  deselect: () => tone(520, 0.08, { to: 330 }),
  target: () => { tone(520, 0.05, { vol: 0.03 }); tone(780, 0.06, { vol: 0.025, at: 0.05 }); },
  error: () => tone(150, 0.12, { vol: 0.03 }),
  confirm: () => { tone(392, 0.07); tone(523, 0.07, { at: 0.07 }); tone(784, 0.14, { at: 0.14 }); },
  door: () => { noise(0.45, 0.12, 0, 260); tone(70, 0.4, { type: 'sine', vol: 0.06 }); },
  paper: () => noise(0.25, 0.08, 0, 3000),
  scan: () => tone(1046, 0.04, { type: 'sine', vol: 0.025 }),
  stamp: () => { noise(0.14, 0.45, 0, 420); tone(90, 0.12, { type: 'sine', vol: 0.12 }); },
  approve: () => { tone(523, 0.12, { type: 'triangle', vol: 0.07 }); tone(659, 0.12, { type: 'triangle', vol: 0.07, at: 0.1 }); tone(1046, 0.26, { type: 'triangle', vol: 0.07, at: 0.2 }); },
  deny: () => { tone(196, 0.32, { type: 'sawtooth', vol: 0.045 }); tone(185, 0.32, { type: 'sawtooth', vol: 0.045, at: 0.38 }); tone(196, 0.32, { type: 'sawtooth', vol: 0.045, at: 0.76 }); },
  hop: () => tone(600, 0.06, { to: 1100, vol: 0.02 }),
  land: () => noise(0.06, 0.12, 0, 500),
};

export function setSound(v) {
  on = v;
  try { localStorage.setItem('cbc-sound', v ? 'on' : 'off'); } catch {}
  if (v) ctx();
}
export const soundOn = () => on;
export const unlockAudio = () => { if (on) ctx(); };
