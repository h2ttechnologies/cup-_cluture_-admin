// New-order alarm: a loud repeating ring made with the Web Audio API (no sound files needed).
// Browsers only allow sound after the page has been clicked or tapped once, so `unlockAudio`
// is called on the first click anywhere in the admin site.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ringTimer: number | null = null;
let stopTimer: number | null = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // A compressor lets the ring be loud without crackling.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  return ctx;
}

/** Call from a click/tap. Returns true once sound is allowed. */
export function unlockAudio() {
  const c = context();
  if (!c) return false;
  if (c.state === "suspended") void c.resume();
  return c.state === "running";
}

export const audioReady = () => !!ctx && ctx.state === "running";

function tone(freq: number, start: number, length: number, type: OscillatorType = "square", level = 0.6) {
  const c = context();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
  gain.gain.setValueAtTime(level, start + length - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** One "ring": three fast high-low bursts, like a shop doorbell alarm. */
function ring() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t = c.currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    tone(1318, t + i * 0.32, 0.14);
    tone(988, t + i * 0.32 + 0.15, 0.14);
  }
}

/** Rings every 1.6 seconds for `seconds` (default 60), then stops by itself. */
export function startAlarm(seconds = 60, onEnd?: () => void) {
  stopAlarm();
  ring();
  ringTimer = window.setInterval(ring, 1600);
  stopTimer = window.setTimeout(() => { stopAlarm(); onEnd?.(); }, seconds * 1000);
}

export function stopAlarm() {
  if (ringTimer !== null) { window.clearInterval(ringTimer); ringTimer = null; }
  if (stopTimer !== null) { window.clearTimeout(stopTimer); stopTimer = null; }
}

export const alarmRinging = () => ringTimer !== null;

/** Short two-note chime, used when sound is switched on so you can hear it works. */
export function chime() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t = c.currentTime + 0.02;
  tone(880, t, 0.18, "sine", 0.4);
  tone(1175, t + 0.16, 0.25, "sine", 0.4);
}
