type SoundName = "place" | "flip" | "pass" | "win" | "lose" | "draw" | "illegal" | "ui";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio(): void {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
}

export function setMuted(next: boolean): void {
  muted = next;
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 0.7, ctx.currentTime, 0.03);
  }
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  audio: AudioContext,
  dest: GainNode,
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
  slideTo?: number,
) {
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + duration);
  g.gain.setValueAtTime(0, t);
  g.gain.setTargetAtTime(gain, t, 0.008);
  g.gain.setTargetAtTime(0.0001, t + duration * 0.55, 0.04);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.08);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

export function playSound(name: SoundName): void {
  if (muted) return;
  const audio = getCtx();
  if (!audio || !master) return;
  if (audio.state === "suspended") return;

  const dest = master;
  const rate = 1 + (Math.random() * 0.08 - 0.04);

  switch (name) {
    case "place":
      tone(audio, dest, 190 * rate, 0.12, "triangle", 0.22);
      tone(audio, dest, 680 * rate, 0.07, "sine", 0.08);
      break;
    case "flip":
      tone(audio, dest, 410 * rate, 0.06, "square", 0.04);
      break;
    case "pass":
      tone(audio, dest, 260, 0.16, "sine", 0.08, 0, 180);
      break;
    case "win":
      tone(audio, dest, 440, 0.16, "triangle", 0.16);
      tone(audio, dest, 554, 0.2, "triangle", 0.14, 0.12);
      tone(audio, dest, 659, 0.28, "sine", 0.12, 0.24);
      break;
    case "lose":
      tone(audio, dest, 320, 0.2, "triangle", 0.12, 0, 180);
      tone(audio, dest, 180, 0.28, "sine", 0.1, 0.12, 110);
      break;
    case "draw":
      tone(audio, dest, 330, 0.18, "sine", 0.1);
      tone(audio, dest, 330, 0.18, "sine", 0.08, 0.16);
      break;
    case "illegal":
      tone(audio, dest, 110, 0.12, "square", 0.06);
      break;
    case "ui":
      tone(audio, dest, 620, 0.05, "sine", 0.05);
      break;
    default:
      break;
  }
}

export function playFlips(count: number): void {
  const n = Math.min(count, 8);
  for (let i = 0; i < n; i++) {
    window.setTimeout(() => playSound("flip"), 70 + i * 42);
  }
}
