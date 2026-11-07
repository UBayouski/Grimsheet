import { CUE_NOTES } from './sound-events';
import type { Cue, SoundPlayer } from './types';

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface OscillatorLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  start(time: number): void;
  stop(time: number): void;
  onended: (() => void) | null;
}
export interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void> | undefined;
  close(): Promise<void> | undefined;
}

export interface AudioOptions {
  /** Returns a context or undefined when Web Audio is missing. May throw. Default: new globalThis.AudioContext(). */
  readonly createContext?: () => AudioContextLike | undefined;
}

const PEAK = 0.05;
const ATTACK = 0.004;
const RELEASE = 0.012;
const LEAD = 0.01;

function defaultContext(): AudioContextLike | undefined {
  const ctor = (globalThis as { AudioContext?: unknown }).AudioContext;
  if (typeof ctor !== 'function') return undefined;
  return new (ctor as new () => AudioContextLike)();
}

export function createAudio(options?: AudioOptions): SoundPlayer {
  const make = options?.createContext ?? defaultContext;
  let ctx: AudioContextLike | undefined;
  let failed = false;
  let destroyed = false;
  let muted = false;

  function unlock(): void {
    if (destroyed) return;
    try {
      if (ctx === undefined && !failed) {
        ctx = make();
        if (ctx === undefined) failed = true;
      }
      if (ctx !== undefined && ctx.state === 'suspended') {
        ctx.resume()?.catch(() => undefined);
      }
    } catch {
      failed = true;
      ctx = undefined;
    }
  }

  function play(cues: readonly Cue[]): void {
    if (destroyed || muted || ctx === undefined) return;
    try {
      let t = ctx.currentTime + LEAD;
      for (const cue of cues) {
        for (const note of CUE_NOTES[cue]) {
          const end = t + note.ms / 1000;
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(note.hz, t);
          const amp = ctx.createGain();
          amp.gain.setValueAtTime(0, t);
          amp.gain.linearRampToValueAtTime(PEAK, t + ATTACK);
          amp.gain.setValueAtTime(PEAK, Math.max(t + ATTACK, end - RELEASE));
          amp.gain.linearRampToValueAtTime(0, end);
          osc.connect(amp);
          amp.connect(ctx.destination);
          osc.onended = () => {
            osc.disconnect();
            amp.disconnect();
          };
          osc.start(t);
          osc.stop(end);
          t = end;
        }
      }
    } catch {
      // Silent: a failing Web Audio call must never reach the app.
    }
  }

  function setMuted(value: boolean): void {
    muted = value;
  }

  function destroy(): void {
    destroyed = true;
    const closing = ctx;
    ctx = undefined;
    try {
      closing?.close()?.catch(() => undefined);
    } catch {
      // Ignore close failures.
    }
  }

  return { unlock, play, setMuted, destroy };
}
