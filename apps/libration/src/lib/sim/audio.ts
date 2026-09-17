type AudioApi = {
  unlock: () => void;
  setMute: (mute: boolean) => void;
  drop: () => void;
  perturb: () => void;
  absorb: () => void;
  close: () => void;
};

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let muted = false;
  let lastDrop = 0;

  function ensure() {
    if (ctx) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    sfx.gain.value = 0.65;
    master.gain.value = muted ? 0 : 0.8;
    sfx.connect(master);
    master.connect(ctx.destination);
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  function beep(freq: number, dur: number, type: OscillatorType, gain = 0.1, slide = 0) {
    if (!ctx || !sfx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock() {
      resume();
    },
    setMute(next) {
      muted = next;
      if (master) master.gain.value = muted ? 0 : 0.8;
    },
    drop() {
      resume();
      const now = performance.now();
      if (now - lastDrop < 70) return;
      lastDrop = now;
      beep(420, 0.09, "sine", 0.06, 1.4);
    },
    perturb() {
      resume();
      beep(180, 0.14, "triangle", 0.05, 0.7);
    },
    absorb() {
      resume();
      beep(140, 0.18, "sine", 0.05, 0.45);
    },
    close() {
      if (ctx) void ctx.close();
      ctx = null;
      master = null;
      sfx = null;
    },
  };
}
