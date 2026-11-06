import { describe, expect, it } from 'vitest';
import { getValueByAddress, parseAddress, setRawText } from '../engine/index';
import type { Sheet, Value } from '../engine/index';
import { loadLevel } from '../model/index';
import type { Level } from '../model/index';
import { createRandom } from './random';
import {
  currentRaw,
  effectiveRaw,
  inMap,
  isLocked,
  levelIndex,
  makeSheet,
  makeState,
  neighbour,
  point,
  readingOrder,
  recalc,
  sheetOf,
  wholeDamage,
} from './state';
import { MAX_DAMAGE } from './types';
import type { RunState } from './types';

const doc = {
  schemaVersion: 1,
  id: '01-test',
  title: 'Test',
  hint: 'A small test level.',
  startingHp: 5,
  ink: 3,
  seed: 7,
  hero: { at: 'B2' },
  monsters: [{ id: 'M1', at: 'D2', move: 'MOVE_M1', atk: 'ATK_M1' }],
  map: [
    '############',
    '#...^.....X#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############',
  ],
  cells: [
    { address: 'A14', raw: 'Move', locked: true },
    { address: 'B14', raw: '=TOWARD(HERO)', locked: true, name: 'MOVE_M1' },
    { address: 'A15', raw: 'Attack' },
    { address: 'B15', raw: '2', name: 'ATK_M1' },
    { address: 'E2', raw: '=1+1' },
  ],
};

function load(): { level: Level; sheet: Sheet } {
  const result = loadLevel(doc, createRandom(7).next);
  if (!result.ok) throw new Error('level did not load');
  return { level: result.level, sheet: result.sheet };
}

function allValues(sheet: Sheet): Value[] {
  const values: Value[] = [];
  for (let r = 1; r <= 20; r += 1) {
    for (let c = 0; c < 12; c += 1) {
      const read = getValueByAddress(sheet, `${'ABCDEFGHIJKL'.charAt(c)}${r}`);
      if (!read.ok) throw new Error('read failed');
      values.push(read.value);
    }
  }
  return values;
}

function built(level: Level, edits: { address: string; raw: string }[] = []): Sheet {
  const sheet = makeSheet(level, edits);
  if (sheet === undefined) throw new Error('makeSheet refused');
  recalc(sheet, level.hero.at, createRandom(7));
  return sheet;
}

function sampleState(level: Level, sheet: Sheet): RunState {
  const snapshot = {
    edits: [{ address: 'C2', raw: '#' }],
    hero: 'B2',
    monsters: [{ id: 'M1', at: 'D2', move: 'MOVE_M1', atk: 'ATK_M1' }],
    hp: 5,
    ink: 3,
    turn: 0,
    status: 'playing' as const,
    rngState: 1,
    valuesHero: 'B2',
    valuesRngState: 1,
  };
  return makeState({ ...snapshot, level, undoSnapshot: snapshot }, sheet);
}

describe('wholeDamage', () => {
  it.each([
    [0.9, 0],
    [1.5, 1],
    [2, 2],
    [-1, 0],
    [0, 0],
    [1e9, 1e9],
    [1e300, MAX_DAMAGE],
    [NaN, 0],
    [Infinity, MAX_DAMAGE],
    [-Infinity, 0],
  ])('wholeDamage(%s) is %s', (input, expected) => {
    expect(wholeDamage(input)).toBe(expected);
  });
});

describe('makeSheet', () => {
  it('gives the same 240 Values as the model loader', () => {
    const { level, sheet } = load();
    expect(allValues(built(level))).toEqual(allValues(sheet));
  });

  it('applies the Edit_Record', () => {
    const { level } = load();
    const sheet = built(level, [{ address: 'C2', raw: '#' }]);
    const read = getValueByAddress(sheet, 'C2');
    expect(read.ok && read.value).toEqual({ kind: 'string', value: '#' });
  });

  it('shares nothing between two calls', () => {
    const { level } = load();
    const a = built(level);
    const b = built(level);
    setRawText(a, 'C2', '#');
    recalc(a, 'B2', createRandom(1));
    const read = getValueByAddress(b, 'C2');
    expect(read.ok && read.value).toEqual({ kind: 'string', value: '.' });
  });
});

describe('makeState', () => {
  it('freezes at every depth and registers the Sheet', () => {
    const { level, sheet } = load();
    const state = sampleState(level, sheet);
    const snap = state.undoSnapshot;
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.edits)).toBe(true);
    expect(Object.isFrozen(state.edits[0])).toBe(true);
    expect(Object.isFrozen(state.monsters)).toBe(true);
    expect(Object.isFrozen(state.monsters[0])).toBe(true);
    expect(snap).not.toBeNull();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap?.edits)).toBe(true);
    expect(Object.isFrozen(snap?.edits[0])).toBe(true);
    expect(Object.isFrozen(snap?.monsters)).toBe(true);
    expect(Object.isFrozen(snap?.monsters[0])).toBe(true);
    expect(sheetOf(state)).toBe(sheet);
    expect(sheetOf({ ...state })).toBeUndefined();
  });
});

describe('level lookups', () => {
  it('currentRaw prefers the last edit and falls back to the Level', () => {
    const { level, sheet } = load();
    const base = sampleState(level, sheet);
    const state: RunState = {
      ...base,
      edits: [
        { address: 'C2', raw: '#' },
        { address: 'C2', raw: 'X' },
      ],
    };
    expect(currentRaw(state, 'C2')).toBe('X');
    expect(currentRaw(state, 'D3')).toBe('.');
    expect(currentRaw(state, 'B15')).toBe('2');
    expect(currentRaw(state, 'L20')).toBe('');
  });

  it('levelIndex merges map characters and specs', () => {
    const { level } = load();
    const index = levelIndex(level);
    expect(levelIndex(level)).toBe(index);
    expect(index.get('A1')).toEqual({ raw: '#', locked: false, name: undefined });
    expect(index.get('B14')).toEqual({ raw: '=TOWARD(HERO)', locked: true, name: 'MOVE_M1' });
    expect(index.get('E2')?.raw).toBe('=1+1');
    expect(effectiveRaw(level, 'E2')).toBe('=1+1');
    expect(isLocked(level, 'B14')).toBe(true);
    expect(isLocked(level, 'C3')).toBe(false);
  });
});

describe('address helpers', () => {
  it('neighbour handles the map edge and off-map moves', () => {
    expect(neighbour('B2', 'N')).toBe('B1');
    expect(neighbour('B2', 'S')).toBe('B3');
    expect(neighbour('B2', 'E')).toBe('C2');
    expect(neighbour('B2', 'W')).toBe('A2');
    expect(neighbour('A1', 'N')).toBeUndefined();
    expect(neighbour('A1', 'W')).toBeUndefined();
    expect(neighbour('L5', 'E')).toBeUndefined();
    expect(neighbour('C12', 'S')).toBeUndefined();
    expect(neighbour('C12', 'N')).toBe('C11');
    expect(neighbour('nonsense', 'N')).toBeUndefined();
  });

  it('inMap and point', () => {
    expect(inMap({ col: 12, row: 12 })).toBe(true);
    expect(inMap({ col: 1, row: 13 })).toBe(false);
    expect(inMap({ col: 0, row: 1 })).toBe(false);
    expect(point('C4')).toEqual({ col: 3, row: 4 });
    expect(point('Z99')).toBeUndefined();
    expect(parseAddress('C4').ok).toBe(true);
  });

  it('readingOrder sorts by row then column', () => {
    expect(readingOrder(['C3', 'A3', 'L1', 'B2'])).toEqual([2, 3, 1, 0]);
    expect(readingOrder([])).toEqual([]);
  });
});
