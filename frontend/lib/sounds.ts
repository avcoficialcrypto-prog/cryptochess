// ============================================================
// CryptoChess - Sound Effects (Web Audio API)
// Zero external files needed — generates tones in real-time
// ============================================================

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playNoise(duration: number, volume = 0.05) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * volume;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {}
}

export const sounds = {
  /** Piece move — short click */
  move() {
    playNoise(0.06, 0.12);
    playTone(800, 0.05, 'sine', 0.08);
  },

  /** Capture — deeper thud */
  capture() {
    playTone(200, 0.15, 'triangle', 0.2);
    playNoise(0.1, 0.15);
  },

  /** Check — alert chime */
  check() {
    playTone(880, 0.12, 'sine', 0.15);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.12), 80);
  },

  /** Checkmate — victory fanfare */
  checkmate() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'sine', 0.15), i * 150);
    });
  },

  /** Game start — ascending chime */
  gameStart() {
    playTone(440, 0.15, 'sine', 0.1);
    setTimeout(() => playTone(660, 0.15, 'sine', 0.1), 100);
    setTimeout(() => playTone(880, 0.2, 'sine', 0.12), 200);
  },

  /** Draw — neutral tone */
  draw() {
    playTone(440, 0.3, 'sine', 0.08);
    setTimeout(() => playTone(440, 0.3, 'sine', 0.08), 200);
  },

  /** Loss — descending */
  lose() {
    playTone(600, 0.2, 'sine', 0.12);
    setTimeout(() => playTone(400, 0.3, 'sine', 0.1), 150);
    setTimeout(() => playTone(300, 0.4, 'sine', 0.08), 300);
  },

  /** Invalid move — error buzz */
  error() {
    playTone(200, 0.15, 'sawtooth', 0.08);
  },

  /** Button click */
  click() {
    playTone(600, 0.04, 'sine', 0.06);
  },

  /** Resign */
  resign() {
    playTone(500, 0.15, 'triangle', 0.1);
    setTimeout(() => playTone(300, 0.3, 'triangle', 0.08), 150);
  },
};
