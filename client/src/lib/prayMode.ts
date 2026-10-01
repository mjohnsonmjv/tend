// prayMode: feature flag, chime, and mute preference for one-button pray.
// The flag is localStorage-based so production behavior stays untouched
// until Mark enables it.

const FLAG_KEY = "tend_pray_mode";
const MUTE_KEY = "tend_pray_mute";
const DISCLOSED_KEY = "tend_pray_disclosed";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}
function remove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* private mode */ }
}

export function isPrayModeEnabled(): boolean {
  return read(FLAG_KEY) === "1";
}
export function setPrayModeEnabled(on: boolean): void {
  if (on) write(FLAG_KEY, "1"); else remove(FLAG_KEY);
}

export function isPrayMuted(): boolean {
  return read(MUTE_KEY) === "1";
}
export function setPrayMuted(muted: boolean): void {
  if (muted) write(MUTE_KEY, "1"); else remove(MUTE_KEY);
}

export function hasSeenMicDisclosure(): boolean {
  return read(DISCLOSED_KEY) === "1";
}
export function markMicDisclosureSeen(): void {
  write(DISCLOSED_KEY, "1");
}

/**
 * Soft two-tone chime, generated with the Web Audio API. No audio assets.
 * A low major-third swell that feels like an amen, not a reward.
 */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    gain.connect(ctx.destination);
    const notes: Array<[number, number]> = [
      [392.0, 0],     // G4
      [523.25, 0.32], // C5, a soft lift
    ];
    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.8);
    }
    osc_cleanup(ctx);
  } catch { /* audio is decorative; never break the session */ }
}

function osc_cleanup(ctx: AudioContext): void {
  setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 1600);
}
