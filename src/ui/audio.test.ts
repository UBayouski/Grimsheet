import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createAudio } from './audio';
import type { AudioContextLike, GainLike, OscillatorLike } from './audio';
import { CUE_NOTES } from './sound-events';
import type { Cue } from './types';

interface FakeOsc extends OscillatorLike {
  freqCalls: Array<[number, number]>;
  startedAt: number | undefined;
  stoppedAt: number | undefined;
  disconnect: Mock<() => void>;
}
interface FakeGain extends GainLike {
  setCalls: Array<[number, number]>;
  rampCalls: Array<[number, number]>;
  disconnect: Mock<() => void>;
}

function makeFake(initial: { state?: string; currentTime?: number } = {}) {
  const oscs: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  const destination = { name: 'destination' };
  const ctx = {
    currentTime: initial.currentTime ?? 1,
    state: initial.state ?? 'running',
    destination,
    resume: vi.fn((): Promise<void> | undefined => Promise.resolve()),
    close: vi.fn((): Promise<void> | undefined => Promise.resolve()),
    createOscillator(): OscillatorLike {
      const osc: FakeOsc = {
        type: '',
        freqCalls: [],
        startedAt: undefined,
        stoppedAt: undefined,
        frequency: {
          value: 0,
          setValueAtTime(v: number, t: number) {
            osc.freqCalls.push([v, t]);
          },
          linearRampToValueAtTime() {},
        },
        connect: vi.fn<(d: unknown) => void>(),
        disconnect: vi.fn<() => void>(),
        start(t: number) {
          osc.startedAt = t;
        },
        stop(t: number) {
          osc.stoppedAt = t;
        },
        onended: null,
      };
      oscs.push(osc);
      return osc;
    },
    createGain(): GainLike {
      const g: FakeGain = {
        setCalls: [],
        rampCalls: [],
        gain: {
          value: 0,
          setValueAtTime(v: number, t: number) {
            g.setCalls.push([v, t]);
          },
          linearRampToValueAtTime(v: number, t: number) {
            g.rampCalls.push([v, t]);
          },
        },
        connect: vi.fn<(d: unknown) => void>(),
        disconnect: vi.fn<() => void>(),
      };
      gains.push(g);
      return g;
    },
  };
  return { ctx, oscs, gains, destination };
}

function setup(initial: { state?: string; currentTime?: number } = {}) {
  const fake = makeFake(initial);
  const factory = vi.fn((): AudioContextLike | undefined => fake.ctx);
  const audio = createAudio({ createContext: factory });
  return { ...fake, factory, audio };
}

const CUES: Cue[] = ['move', 'edit', 'damage', 'win', 'death'];

describe('createAudio', () => {
  it.each(CUES)('plays the notes of the %s cue', (cue) => {
    const { audio, oscs, gains, ctx } = setup({ currentTime: 2 });
    audio.unlock();
    audio.play([cue]);
    const notes = CUE_NOTES[cue];
    expect(oscs).toHaveLength(notes.length);
    let t = 2 + 0.01;
    notes.forEach((note, i) => {
      const osc = oscs[i]!;
      const gain = gains[i]!;
      const end = t + note.ms / 1000;
      expect(osc.type).toBe('square');
      expect(osc.freqCalls[0]![0]).toBe(note.hz);
      expect(osc.startedAt).toBeCloseTo(t, 6);
      expect(osc.stoppedAt).toBeCloseTo(end, 6);
      expect(gain.setCalls[0]![0]).toBe(0);
      expect(gain.setCalls[0]![1]).toBeCloseTo(t, 6);
      expect(gain.rampCalls[0]![0]).toBe(0.05);
      expect(gain.rampCalls[0]![1]).toBeCloseTo(t + 0.004, 6);
      expect(gain.setCalls[1]![0]).toBe(0.05);
      expect(gain.setCalls[1]![1]).toBeCloseTo(Math.max(t + 0.004, end - 0.012), 6);
      expect(gain.rampCalls[1]![0]).toBe(0);
      expect(gain.rampCalls[1]![1]).toBeCloseTo(end, 6);
      expect(osc.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
      t = end;
    });
  });

  it('schedules several cues one after the other', () => {
    const { audio, oscs } = setup({ currentTime: 0 });
    audio.unlock();
    audio.play(['move', 'edit']);
    expect(oscs).toHaveLength(3);
    expect(oscs[1]!.startedAt).toBeCloseTo(oscs[0]!.stoppedAt!, 6);
    expect(oscs[2]!.startedAt).toBeCloseTo(oscs[1]!.stoppedAt!, 6);
    expect(oscs[1]!.freqCalls[0]![0]).toBe(660);
    expect(oscs[2]!.freqCalls[0]![0]).toBe(880);
  });

  it('creates nothing and does not call the factory before unlock', () => {
    const { audio, oscs, factory } = setup();
    audio.play(['move']);
    expect(factory).not.toHaveBeenCalled();
    expect(oscs).toHaveLength(0);
    audio.unlock();
    audio.play(['move']);
    expect(oscs).toHaveLength(1);
  });

  it('creates the context once and resumes only when suspended', () => {
    const a = setup({ state: 'suspended' });
    a.audio.unlock();
    a.audio.unlock();
    expect(a.factory).toHaveBeenCalledTimes(1);
    expect(a.ctx.resume).toHaveBeenCalledTimes(2);

    const b = setup({ state: 'running' });
    b.audio.unlock();
    expect(b.factory).toHaveBeenCalledTimes(1);
    expect(b.ctx.resume).not.toHaveBeenCalled();
  });

  it('plays nothing while muted and plays again when un-muted', () => {
    const { audio, oscs } = setup();
    audio.unlock();
    audio.setMuted(true);
    audio.play(['move']);
    expect(oscs).toHaveLength(0);
    audio.setMuted(false);
    audio.play(['move']);
    expect(oscs).toHaveLength(1);
  });

  it('stays silent when the factory returns undefined', () => {
    const audio = createAudio({ createContext: () => undefined });
    expect(() => {
      audio.unlock();
      audio.play(['win']);
      audio.destroy();
    }).not.toThrow();
  });

  it('stays silent when the factory throws', () => {
    const audio = createAudio({
      createContext: () => {
        throw new Error('no audio');
      },
    });
    expect(() => {
      audio.unlock();
      audio.play(['win']);
    }).not.toThrow();
  });

  it('does not throw when createOscillator throws', () => {
    const { audio, ctx } = setup();
    ctx.createOscillator = () => {
      throw new Error('boom');
    };
    audio.unlock();
    expect(() => audio.play(['death'])).not.toThrow();
  });

  it('does not throw when start throws', () => {
    const { audio, ctx } = setup();
    const original = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const osc = original();
      osc.start = () => {
        throw new Error('start');
      };
      return osc;
    };
    audio.unlock();
    expect(() => audio.play(['move'])).not.toThrow();
  });

  it('disconnects both nodes when the oscillator ends', () => {
    const { audio, oscs, gains } = setup();
    audio.unlock();
    audio.play(['move']);
    const osc = oscs[0]!;
    expect(osc.onended).toBeTypeOf('function');
    osc.onended!();
    expect(osc.disconnect).toHaveBeenCalledTimes(1);
    expect(gains[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('closes the context once on destroy and then ignores play and unlock', () => {
    const { audio, ctx, oscs, factory } = setup();
    audio.unlock();
    audio.destroy();
    audio.destroy();
    expect(ctx.close).toHaveBeenCalledTimes(1);
    audio.play(['move']);
    audio.unlock();
    expect(oscs).toHaveLength(0);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected resume', async () => {
    const { audio, ctx } = setup({ state: 'suspended' });
    ctx.resume.mockImplementation(() => Promise.reject(new Error('blocked')));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    expect(() => audio.unlock()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
