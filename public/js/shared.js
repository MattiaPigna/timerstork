// ─── SOCKET ──────────────────────────────────────────────────────────────────
const socket = io();

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', gain = 0.5) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function playPlayerEntryAlert() {
  // Three ascending beeps
  playTone(440, 0.18, 'square', 0.4);
  setTimeout(() => playTone(550, 0.18, 'square', 0.4), 220);
  setTimeout(() => playTone(660, 0.35, 'square', 0.4), 440);
}

function playGoalSound() {
  const notes = [523, 659, 784, 1047, 1047];
  notes.forEach((n, i) => setTimeout(() => playTone(n, 0.45, 'sawtooth', 0.35), i * 130));
}

function playCardSound() {
  // Whoosh then impact
  playTone(1200, 0.12, 'sine', 0.3);
  setTimeout(() => playTone(200, 0.35, 'square', 0.4), 100);
}

function playYellowCardSound() {
  playTone(880, 0.2, 'square', 0.5);
  setTimeout(() => playTone(660, 0.4, 'square', 0.4), 200);
}

function playRedCardSound() {
  playTone(330, 0.2, 'sawtooth', 0.5);
  setTimeout(() => playTone(220, 0.5, 'sawtooth', 0.4), 200);
}

function playPhaseEndSound() {
  const notes = [784, 659, 523];
  notes.forEach((n, i) => setTimeout(() => playTone(n, 0.4, 'square', 0.45), i * 250));
}

function playPhaseStartSound() {
  const notes = [523, 659, 784];
  notes.forEach((n, i) => setTimeout(() => playTone(n, 0.3, 'square', 0.4), i * 200));
}

function playRigorePresSound() {
  // Dramatic whistle + stab chords
  playTone(1400, 0.08, 'sine', 0.35);
  setTimeout(() => playTone(1100, 0.12, 'sine', 0.35), 90);
  setTimeout(() => playTone(1250, 0.25, 'sine', 0.3),  200);

  const chord1 = [220, 277, 330, 415];
  const chord2 = [165, 208, 247, 311];
  const chord3 = [196, 247, 294, 370];

  setTimeout(() => chord1.forEach(n => playTone(n, 0.7, 'sawtooth', 0.28)), 700);
  setTimeout(() => chord2.forEach(n => playTone(n, 0.7, 'sawtooth', 0.25)), 1300);
  setTimeout(() => chord3.forEach(n => playTone(n, 1.4, 'sawtooth', 0.38)), 1900);
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function cardImageUrl(filename) {
  return '/carte/' + encodeURIComponent(filename);
}
