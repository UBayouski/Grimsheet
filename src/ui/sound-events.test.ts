import { describe, expect, it } from 'vitest';
import {
  CUE_NOTES,
  MUTE_KEY,
  cuesFor,
  readMuted,
  writeMuted,
  type AcceptedTurn,
} from './sound-events';
import type { Cue, StorageLike } from './types';

const cases: [AcceptedTurn, Cue[]][] = [
  [{ kind: 'move', status: 'lost', damaged: false }, ['death']],
  [{ kind: 'wait', status: 'lost', damaged: true }, ['death']],
  [{ kind: 'move', status: 'lost', damaged: true }, ['death']],
  [{ kind: 'undo', status: 'lost', damaged: false }, ['death']],
  [{ kind: 'move', status: 'won', damaged: false }, ['win']],
  [{ kind: 'edit', status: 'won', damaged: false }, ['win']],
  [{ kind: 'move', status: 'won', damaged: true }, ['win']],
  [{ kind: 'undo', status: 'playing', damaged: false }, []],
  [{ kind: 'undo', status: 'playing', damaged: true }, []],
  [{ kind: 'move', status: 'playing', damaged: true }, ['damage']],
  [{ kind: 'edit', status: 'playing', damaged: true }, ['damage']],
  [{ kind: 'wait', status: 'playing', damaged: true }, ['damage']],
  [{ kind: 'edit', status: 'playing', damaged: false }, ['edit']],
  [{ kind: 'move', status: 'playing', damaged: false }, ['move']],
  [{ kind: 'wait', status: 'playing', damaged: false }, []],
];

describe('cuesFor', () => {
  it.each(cases)('maps %j', (turn, expected) => {
    expect(cuesFor(turn)).toEqual(expected);
  });

  it('returns referentially stable arrays', () => {
    const a = cuesFor({ kind: 'move', status: 'playing', damaged: false });
    const b = cuesFor({ kind: 'move', status: 'playing', damaged: false });
    expect(a).toBe(b);
    const n1 = cuesFor({ kind: 'wait', status: 'playing', damaged: false });
    const n2 = cuesFor({ kind: 'undo', status: 'playing', damaged: false });
    expect(n1).toBe(n2);
  });
});

describe('CUE_NOTES', () => {
  it('equals the requirement table', () => {
    expect(CUE_NOTES).toEqual({
      move: [{ hz: 440, ms: 30 }],
      edit: [
        { hz: 660, ms: 50 },
        { hz: 880, ms: 70 },
      ],
      damage: [
        { hz: 150, ms: 70 },
        { hz: 110, ms: 90 },
      ],
      win: [523, 659, 784, 1047].map((hz) => ({ hz, ms: 90 })),
      death: [392, 330, 262, 196].map((hz) => ({ hz, ms: 140 })),
    });
  });
});

function store(opts: { value?: string | null; getThrows?: boolean; setThrows?: boolean }) {
  const writes: [string, string][] = [];
  const s: StorageLike = {
    getItem: (key) => {
      if (opts.getThrows) throw new Error('denied');
      expect(key).toBe(MUTE_KEY);
      return opts.value ?? null;
    },
    setItem: (key, value) => {
      if (opts.setThrows) throw new Error('full');
      writes.push([key, value]);
    },
  };
  return { s, writes };
}

describe('Mute_Store', () => {
  it('uses the documented key', () => {
    expect(MUTE_KEY).toBe('grimsheet.muted');
  });

  it('reads muted only for the exact string 1', () => {
    expect(readMuted(store({ value: null }).s)).toBe(false);
    expect(readMuted(store({ value: '0' }).s)).toBe(false);
    expect(readMuted(store({ value: 'x' }).s)).toBe(false);
    expect(readMuted(store({ value: '1' }).s)).toBe(true);
  });

  it('reads as not muted when getItem throws', () => {
    expect(readMuted(store({ getThrows: true }).s)).toBe(false);
  });

  it('writes 1 and 0', () => {
    const { s, writes } = store({});
    writeMuted(s, true);
    writeMuted(s, false);
    expect(writes).toEqual([
      [MUTE_KEY, '1'],
      [MUTE_KEY, '0'],
    ]);
  });

  it('swallows a throwing setItem', () => {
    expect(() => writeMuted(store({ setThrows: true }).s, true)).not.toThrow();
  });
});
