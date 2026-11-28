export type SfxType =
  | 'click'
  | 'card'
  | 'chip'
  | 'chess'
  | 'chessCapture'
  | 'clack'
  | 'wood'
  | 'pocket'
  | 'cushion'
  | 'uno'
  | 'win'
  | 'lose'
  | 'foul'
  | 'launcherSafe'
  | 'launcherFire';

let audioCtx: AudioContext | null = null;
const lastPlayedAt: Partial<Record<SfxType, number>> = {};
const sampleCache: Partial<Record<'chess' | 'chessCapture', AudioBuffer>> = {};
let preloadStarted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (!preloadStarted) {
    preloadStarted = true;
    preloadSamples(audioCtx);
  }
  return audioCtx;
}

function preloadSamples(ctx: AudioContext): void {
  const entries: Array<['chess' | 'chessCapture', string]> = [
    ['chess', '/assets/audio/Move.mp3'],
    ['chessCapture', '/assets/audio/Capture.mp3'],
  ];
  for (const [key, url] of entries) {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('Audio fetch failed'))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        sampleCache[key] = decoded;
      })
      .catch(() => {
        // Fallback to procedural synthesizer if offline or decode fails
      });
  }
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, gainVal = 0.45): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = gainVal;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function playTone(
  ctx: AudioContext,
  freq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainVal = 0.12,
  delay = 0
): void {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainVal, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playCardSwoosh(ctx: AudioContext): void {
  const duration = 0.065;
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1600, ctx.currentTime);
  filter.Q.setValueAtTime(1.2, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

export function playSfx(type: SfxType, enabled = true): void {
  if (!enabled) return;
  try {
    const now = performance.now();
    const cooldown =
      type === 'clack' || type === 'wood' ? 45 : type === 'cushion' ? 50 : type === 'chip' ? 28 : 0;
    if (cooldown > 0 && now - (lastPlayedAt[type] ?? 0) < cooldown) {
      return;
    }
    lastPlayedAt[type] = now;

    const ctx = getCtx();
    if (!ctx) return;

    switch (type) {
      case 'click':
        playTone(ctx, 640, 500, 0.04, 'triangle', 0.075);
        break;
      case 'card':
        playCardSwoosh(ctx);
        playTone(ctx, 320, 175, 0.045, 'triangle', 0.055);
        break;
      case 'chip':
        playTone(ctx, 1850, 1450, 0.055, 'sine', 0.065);
        playTone(ctx, 2400, 2100, 0.05, 'sine', 0.045, 0.025);
        break;
      case 'chess':
        if (sampleCache.chess) playBuffer(ctx, sampleCache.chess, 0.55);
        else playTone(ctx, 215, 95, 0.065, 'triangle', 0.13);
        break;
      case 'chessCapture':
        if (sampleCache.chessCapture) playBuffer(ctx, sampleCache.chessCapture, 0.6);
        else playTone(ctx, 270, 80, 0.09, 'triangle', 0.16);
        break;
      case 'clack':
        playTone(ctx, 1180, 440, 0.038, 'triangle', 0.1);
        break;
      case 'wood':
        playTone(ctx, 330, 145, 0.05, 'sine', 0.09);
        break;
      case 'pocket':
        playTone(ctx, 240, 110, 0.16, 'sine', 0.13);
        playTone(ctx, 480, 320, 0.12, 'triangle', 0.055, 0.04);
        break;
      case 'cushion':
        playTone(ctx, 165, 68, 0.055, 'sine', 0.085);
        break;
      case 'uno':
        playTone(ctx, 523.25, 523.25, 0.09, 'square', 0.06, 0);
        playTone(ctx, 783.99, 1046.5, 0.18, 'triangle', 0.095, 0.09);
        break;
      case 'win':
        playTone(ctx, 523.25, 523.25, 0.14, 'triangle', 0.09, 0);
        playTone(ctx, 659.25, 659.25, 0.14, 'triangle', 0.09, 0.075);
        playTone(ctx, 783.99, 783.99, 0.16, 'triangle', 0.1, 0.15);
        playTone(ctx, 987.77, 987.77, 0.2, 'triangle', 0.095, 0.225);
        playTone(ctx, 1174.66, 1174.66, 0.34, 'sine', 0.11, 0.3);
        break;
      case 'lose':
        playTone(ctx, 340, 260, 0.14, 'sawtooth', 0.045, 0);
        playTone(ctx, 240, 150, 0.25, 'sawtooth', 0.045, 0.14);
        break;
      case 'foul':
        playTone(ctx, 220, 140, 0.16, 'sawtooth', 0.065, 0);
        playTone(ctx, 180, 110, 0.2, 'sawtooth', 0.065, 0.12);
        break;
      case 'launcherSafe':
        playTone(ctx, 980, 620, 0.035, 'square', 0.055);
        playTone(ctx, 740, 880, 0.07, 'sine', 0.06, 0.04);
        break;
      case 'launcherFire':
        playTone(ctx, 180, 72, 0.14, 'sawtooth', 0.11);
        playCardSwoosh(ctx);
        playTone(ctx, 420, 680, 0.045, 'square', 0.05, 0.02);
        playTone(ctx, 520, 820, 0.045, 'square', 0.05, 0.07);
        playTone(ctx, 640, 960, 0.05, 'triangle', 0.065, 0.12);
        break;
    }
  } catch {
    // Ignore audio errors when autoplay/audio context is blocked
  }
}
