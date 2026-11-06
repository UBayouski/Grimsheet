import { describe, expect, it } from 'vitest';
import { setRawText } from '../engine/index';
import { loadLevel } from '../model/index';
import type { LevelDocument } from '../model/index';
import { createRandom } from './random';
import {
  canUndo,
  cellName,
  cellRawText,
  cellValue,
  describeCellError,
  isCellLocked,
  isPlaying,
  startRun,
} from './run';
import { makeState, sheetOf } from './state';
import type { RunState } from './types';

const WALLS = '############';

function makeDoc(overrides: Partial<LevelDocument> = {}): LevelDocument {
  return {
    schemaVersion: 1,
    id: '01-test-level',
    title: 'Test level',
    hint: 'A hint.',
    startingHp: 7,
    ink: 3,
    seed: 12345,
    hero: { at: 'B2' },
    monsters: [
      { id: 'M2', at: 'F6', move: 'MOVE_M2', atk: 'ATK_M2' },
      { id: 'M1', at: 'D2', move: 'MOVE_M1', atk: 'ATK_M1' },
    ],
    map: [
      WALLS,
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.........X#',
      WALLS,
    ],
    cells: [
      { address: 'F3', raw: '=RAND()' },
      { address: 'G3', raw: '=1/0' },
      { address: 'A14', raw: 'Move 1', locked: true },
      { address: 'B14', raw: '=TOWARD(HERO)', name: 'MOVE_M1' },
      { address: 'A15', raw: 'Attack 1' },
      { address: 'B15', raw: '=0', name: 'ATK_M1' },
      { address: 'A16', raw: 'Move 2' },
      { address: 'B16', raw: '="-"', name: 'MOVE_M2' },
      { address: 'A17', raw: 'Attack 2' },
      { address: 'B17', raw: '=0', name: 'ATK_M2' },
      { address: 'A18', raw: 'Trap' },
      { address: 'B18', raw: '=2', name: 'TRAP', locked: true },
    ],
    ...overrides,
  };
}

function start(doc: unknown = makeDoc()): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error(`start failed: ${JSON.stringify(result.errors)}`);
  return result.state;
}

describe('startRun', () => {
  it('builds the start state', () => {
    const state = start();
    expect(state.hp).toBe(7);
    expect(state.ink).toBe(3);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.hero).toBe('B2');
    expect(state.monsters.map((m) => m.id)).toEqual(['M2', 'M1']);
    expect(state.monsters[1]).toEqual({ id: 'M1', at: 'D2', move: 'MOVE_M1', atk: 'ATK_M1' });
    expect(state.edits).toEqual([]);
    expect(state.undoSnapshot).toBeNull();
    expect(state.level.title).toBe('Test level');
    expect(state.valuesHero).toBe('B2');
    expect(state.valuesRngState).toBe(12345);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('passes Load_Errors through unchanged', () => {
    const bad = { ...makeDoc(), startingHp: 0 };
    const expected = loadLevel(bad, () => 0);
    expect(expected.ok).toBe(false);
    const result = startRun(bad);
    expect(result.ok).toBe(false);
    if (!result.ok && !expected.ok) expect(result.errors).toEqual(expected.errors);
    const garbage = startRun(42);
    expect(garbage.ok).toBe(false);
  });

  it('falls back to seed 0 for bad seeds; the model then refuses the document', () => {
    for (const seed of [-1, 1.5, 4294967296, Number.NaN, 'x']) {
      const doc = { ...makeDoc(), seed };
      const result = startRun(doc);
      const expected = loadLevel(doc, createRandom(0).next);
      expect(result.ok).toBe(false);
      if (!result.ok && !expected.ok) {
        expect(result.errors).toEqual(expected.errors);
        expect(result.errors.some((e) => e.path === 'seed')).toBe(true);
      }
    }
    expect(start({ ...makeDoc(), seed: 4294967295 }).valuesRngState).toBe(4294967295);
    expect(start({ ...makeDoc(), seed: 0 }).valuesRngState).toBe(0);
  });

  it('leaves the generator where the loader left it after the replay', () => {
    const doc = makeDoc();
    const state = start(doc);
    const gen = createRandom(doc.seed);
    const loaded = loadLevel(doc, () => gen.next());
    expect(loaded.ok).toBe(true);
    expect(state.rngState).toBe(gen.state);
    expect(state.rngState).not.toBe(doc.seed);
    // The replay draws the same numbers as the load.
    const replay = createRandom(0, state.valuesRngState);
    const sheet = sheetOf(state);
    expect(sheet).toBeDefined();
    const value = cellValue(state, 'F3');
    expect(value?.kind).toBe('number');
    const first = createRandom(doc.seed).next();
    expect(value).toEqual({ kind: 'number', value: first });
    expect(replay.state).toBe(doc.seed);
  });

  it('maps a throw to one internal-error Load_Error', () => {
    const doc = {};
    Object.defineProperty(doc, 'seed', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const result = startRun(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('internal-error');
    }
  });
});

describe('read API', () => {
  const state = start();

  it('cellValue', () => {
    expect(cellValue(state, 'C3')).toEqual({ kind: 'string', value: '.' });
    expect(cellValue(state, 'c3')).toEqual({ kind: 'string', value: '.' });
    expect(cellValue(state, 'B18')).toEqual({ kind: 'number', value: 2 });
    expect(cellValue(state, 'M1')).toBeUndefined();
    expect(cellValue(state, 'A21')).toBeUndefined();
    expect(cellValue(state, 5 as unknown as string)).toBeUndefined();
  });

  it('cellRawText', () => {
    expect(cellRawText(state, 'A1')).toBe('#');
    expect(cellRawText(state, 'F3')).toBe('=RAND()');
    expect(cellRawText(state, 'B14')).toBe('=TOWARD(HERO)');
    expect(cellRawText(state, 'L19')).toBe('');
    expect(cellRawText(state, 'M1')).toBeUndefined();
    expect(cellRawText(state, null as unknown as string)).toBeUndefined();
  });

  it('isCellLocked', () => {
    expect(isCellLocked(state, 'A14')).toBe(true);
    expect(isCellLocked(state, 'B18')).toBe(true);
    expect(isCellLocked(state, 'B15')).toBe(false);
    expect(isCellLocked(state, 'C3')).toBe(false);
    expect(isCellLocked(state, 'A99')).toBeUndefined();
    expect(isCellLocked(state, {} as unknown as string)).toBeUndefined();
  });

  it('cellName', () => {
    expect(cellName(state, 'B14')).toBe('MOVE_M1');
    expect(cellName(state, 'B18')).toBe('TRAP');
    expect(cellName(state, 'A14')).toBeUndefined();
    expect(cellName(state, 'C3')).toBeUndefined();
    expect(cellName(state, 'Z1')).toBeUndefined();
    expect(cellName(state, 7 as unknown as string)).toBeUndefined();
  });

  it('describeCellError', () => {
    expect(cellValue(state, 'G3')?.kind).toBe('error');
    const text = describeCellError(state, 'G3');
    expect(typeof text).toBe('string');
    expect(text?.length).toBeGreaterThan(0);
    expect(describeCellError(state, 'C3')).toBeUndefined();
    expect(describeCellError(state, 'M1')).toBeUndefined();
    expect(describeCellError(state, 3 as unknown as string)).toBeUndefined();
  });

  it('isPlaying follows the status', () => {
    const sheet = sheetOf(state);
    if (sheet === undefined) throw new Error('no sheet');
    expect(isPlaying(state)).toBe(true);
    expect(isPlaying(makeState({ ...state, status: 'won' }, sheet))).toBe(false);
    expect(isPlaying(makeState({ ...state, status: 'lost' }, sheet))).toBe(false);
  });

  it('canUndo is false at start and follows the snapshot', () => {
    const sheet = sheetOf(state);
    if (sheet === undefined) throw new Error('no sheet');
    expect(canUndo(state)).toBe(false);
    const snapshot = {
      edits: [],
      hero: state.hero,
      monsters: state.monsters,
      hp: state.hp,
      ink: state.ink,
      turn: 0,
      status: 'playing' as const,
      rngState: state.rngState,
      valuesHero: state.valuesHero,
      valuesRngState: state.valuesRngState,
    };
    const later = makeState({ ...state, turn: 1, undoSnapshot: snapshot }, sheet);
    expect(canUndo(later)).toBe(true);
    expect(canUndo(makeState({ ...later, status: 'lost' }, sheet))).toBe(false);
  });

  it('gives undefined, false, false for a forged state', () => {
    const forged: RunState = { ...state };
    expect(cellValue(forged, 'C3')).toBeUndefined();
    expect(describeCellError(forged, 'G3')).toBeUndefined();
    expect(isPlaying(forged)).toBe(false);
    expect(canUndo(forged)).toBe(false);
    const junk = {} as unknown as RunState;
    expect(cellValue(junk, 'C3')).toBeUndefined();
    expect(cellRawText(junk, 'C3')).toBeUndefined();
    expect(isCellLocked(junk, 'C3')).toBeUndefined();
    expect(cellName(junk, 'C3')).toBeUndefined();
    expect(isPlaying(junk)).toBe(false);
    expect(canUndo(junk)).toBe(false);
  });
});

describe('two starts from one document', () => {
  it('are equal in every readable field and share no Sheet', () => {
    const doc = makeDoc();
    const a = start(doc);
    const b = start(doc);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    for (let row = 1; row <= 20; row += 1) {
      for (const col of 'ABCDEFGHIJKL') {
        const address = `${col}${row}`;
        expect(cellValue(a, address)).toEqual(cellValue(b, address));
        expect(cellRawText(a, address)).toBe(cellRawText(b, address));
      }
    }
    const sheetA = sheetOf(a);
    const sheetB = sheetOf(b);
    expect(sheetA).toBeDefined();
    expect(sheetA).not.toBe(sheetB);
    if (sheetA === undefined) return;
    expect(setRawText(sheetA, 'C3', '#').accepted).toBe(true);
    expect(cellValue(b, 'C3')).toEqual({ kind: 'string', value: '.' });
  });
});
