let ctx: AudioContext | null = null;
let lastImpact = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  getCtx();
}

export function playDrop(): void {
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
  gain.gain.setValueAtTime(0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

export function playImpact(speed: number): void {
  const audio = getCtx();
  if (!audio) return;
  const t = performance.now();
  if (t - lastImpact < 80) return;
  lastImpact = t;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const intensity = Math.min(1, speed / 10);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(70 + intensity * 90, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
  gain.gain.setValueAtTime(0.02 + intensity * 0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}
