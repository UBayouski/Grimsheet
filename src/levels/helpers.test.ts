import { describe, expect, it } from 'vitest';
import { applyAction, startRun } from '../game/index';
import type { Action, RunState } from '../game/index';
import {
  LEVEL_IDS,
  boardText,
  describeLimit,
  describeStep,
  finalSnapshot,
  manhattan,
  parseSolution,
  replay,
  searchEditFree,
  stateKey,
  walkableCount,
} from './helpers';

// Small inline Level_Documents: the helper tests read no file.

const WALLS = '############';

function mapWith(rows: Record<number, string>): string[] {
  return Array.from({ length: 12 }, (_, i) => rows[i + 1] ?? WALLS);
}

function levelDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: '01-tiny',
    title: 'Tiny',
    hint: 'A tiny level for the helper tests.',
    startingHp: 3,
    ink: 1,
    seed: 1,
    hero: { at: 'B6' },
    monsters: [],
    map: mapWith({ 6: '#.........X#' }),
    cells: [],
    ...over,
  };
}

/** A corridor from B6 to the exit at K6. */
const corridor = (): Record<string, unknown> => levelDoc();

/** A closed room with no exit: B6 to D6. */
const closedRoom = (): Record<string, unknown> => levelDoc({ map: mapWith({ 6: '#...########' }) });

/** An open room with no exit: rows 4 to 8, columns B to K. */
const openRoom = (): Record<string, unknown> =>
  levelDoc({ map: mapWith({ 4: '#..........#', 5: '#..........#', 6: '#..........#', 7: '#..........#', 8: '#..........#' }) });

/** The corridor with a monster at C6 that hits for 1 when the hero is adjacent. */
const monsterRoom = (): Record<string, unknown> =>
  levelDoc({
    map: mapWith({ 6: '#..........#' }),
    monsters: [{ id: 'M1', at: 'C6', move: 'MOVE_M1', atk: 'ATK_M1' }],
    cells: [
      { address: 'A14', raw: 'Move rule' },
      { address: 'B14', raw: '="-"', name: 'MOVE_M1' },
      { address: 'A15', raw: 'Attack rule' },
      { address: 'B15', raw: '=IF(DIST(HERO,SELF)<2,1,0)', name: 'ATK_M1' },
    ],
  });

function started(doc: unknown): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error(`startRun refused the test document: ${JSON.stringify(result.errors)}`);
  return result.state;
}

function applied(state: RunState, action: Action): RunState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`action refused: ${result.reason}`);
  return result.state;
}

describe('LEVEL_IDS', () => {
  it('holds five unique ids in numeric order', () => {
    expect(LEVEL_IDS).toHaveLength(5);
    expect(new Set(LEVEL_IDS).size).toBe(5);
    LEVEL_IDS.forEach((id, i) => {
      expect(id).toMatch(/^0[1-5]-[a-z]+(-[a-z]+)*$/);
      expect(Number(id.slice(0, 2))).toBe(i + 1);
    });
  });
});

describe('replay', () => {
  it('applies every accepted action and ends with no refusal', () => {
    const result = replay(corridor(), [
      { kind: 'move', dir: 'E' },
      { kind: 'wait' },
    ]);
    expect(result.refusedAt).toBeUndefined();
    expect(result.steps).toHaveLength(2);
    expect(result.final.hero).toBe('C6');
    expect(result.start.hero).toBe('B6');
    expect(result.steps[1]?.state).toBe(result.final);
  });

  it('stops at the first refusal, records refusedAt, and leaves later actions unapplied', () => {
    const result = replay(corridor(), [
      { kind: 'move', dir: 'E' },
      { kind: 'move', dir: 'N' }, // a wall
      { kind: 'move', dir: 'E' }, // never applied
    ]);
    expect(result.refusedAt).toBe(1);
    expect(result.steps).toHaveLength(2);
    const refused = result.steps[1];
    expect(refused?.result.ok).toBe(false);
    if (refused !== undefined && !refused.result.ok) expect(refused.result.reason).toBe('blocked');
    // The state of a refused step is the state before it, and the run did not move on.
    expect(result.final.hero).toBe('C6');
    expect(refused?.state.hero).toBe('C6');
  });

  it('throws when the document does not start', () => {
    expect(() => replay({}, [])).toThrow(/startRun refused/);
  });
});

describe('stateKey', () => {
  it('is equal for two starts of one document', () => {
    expect(stateKey(started(corridor()))).toBe(stateKey(started(corridor())));
  });

  it('differs after a move', () => {
    const start = started(corridor());
    expect(stateKey(applied(start, { kind: 'move', dir: 'E' }))).not.toBe(stateKey(start));
  });

  it('differs after a hit', () => {
    const start = started(monsterRoom());
    const hit = applied(start, { kind: 'wait' });
    expect(hit.hp).toBe(start.hp - 1);
    expect(stateKey(hit)).not.toBe(stateKey(start));
  });

  it('ignores turn: a wait in a safe spot gives the same key', () => {
    const start = started(corridor());
    const waited = applied(start, { kind: 'wait' });
    expect(waited.turn).toBe(start.turn + 1);
    expect(stateKey(waited)).toBe(stateKey(start));
  });
});

describe('finalSnapshot', () => {
  it('reads 240 raws and 240 values, and is equal for two replays', () => {
    const actions: Action[] = [{ kind: 'move', dir: 'E' }, { kind: 'wait' }];
    const a = finalSnapshot(replay(monsterRoom(), actions).final);
    const b = finalSnapshot(replay(monsterRoom(), actions).final);
    expect(a.raws).toHaveLength(240);
    expect(a.values).toHaveLength(240);
    expect(a.monsters).toEqual(['M1@C6']);
    expect(a).toEqual(b);
  });

  it('tells a number from a string with the same text', () => {
    const doc = levelDoc({ cells: [{ address: 'A14', raw: '5' }, { address: 'B14', raw: '=5' }] });
    const snapshot = finalSnapshot(started(doc));
    expect(snapshot.values[13 * 12]).toBe('n5');
    expect(snapshot.values[13 * 12 + 1]).toBe('n5');
    expect(snapshot.raws[13 * 12 + 1]).toBe('=5');
    expect(snapshot.values[0]).toBe('s#');
  });
});

describe('searchEditFree', () => {
  it('returns won on a tiny corridor', () => {
    const result = searchEditFree(corridor());
    expect(result.outcome).toBe('won');
    expect(result.depth).toBe(9);
  });

  it('returns exhausted on a closed room with no exit', () => {
    const result = searchEditFree(closedRoom());
    expect(result.outcome).toBe('exhausted');
    expect(result.states).toBeGreaterThan(1);
    expect(result.states).toBe(3); // B6, C6 and D6
    expect(result.limit).toBeUndefined();
  });

  it('returns limit at the states limit', () => {
    const result = searchEditFree(openRoom(), { maxDepth: 1, maxStates: 3 });
    expect(result.outcome).toBe('limit');
    expect(result.limit).toBe('states');
  });

  it('returns limit at the depth limit', () => {
    const result = searchEditFree(openRoom(), { maxDepth: 1, maxStates: 1000 });
    expect(result.outcome).toBe('limit');
    expect(result.limit).toBe('depth');
    expect(result.depth).toBe(1);
  });

  it('does not expand a lost state', () => {
    const doc = monsterRoom();
    (doc as { startingHp: number }).startingHp = 1;
    const result = searchEditFree(doc);
    expect(result.outcome).toBe('exhausted');
  });

  it('throws when the document does not start', () => {
    expect(() => searchEditFree({})).toThrow(/startRun refused/);
  });
});

describe('describeLimit', () => {
  it('names the level, the limit, the numbers and the advice', () => {
    const result = searchEditFree(openRoom(), { maxDepth: 1, maxStates: 3 });
    const text = describeLimit(result, '02-the-chaser');
    expect(text).toContain('Edit-free search of 02-the-chaser is inconclusive');
    expect(text).toContain('stopped at the states limit');
    expect(text).toContain(`after ${result.states} states and ${result.depth} layers`);
    expect(text).toContain('(limits: 100 turns, 1000 states)');
    expect(text).toContain('Shrink the walkable area of the level before raising a limit.');
  });

  it('prints custom limits when they are given', () => {
    const result = searchEditFree(openRoom(), { maxDepth: 1, maxStates: 1000 });
    expect(describeLimit(result, '05-the-lich', { maxDepth: 1, maxStates: 1000 })).toContain(
      '(limits: 1 turns, 1000 states)',
    );
  });
});

describe('walkableCount', () => {
  it('counts floor, exit and trap cells of the Map_Area', () => {
    expect(walkableCount(started(corridor()))).toBe(10);
    const withTrap = levelDoc({ map: mapWith({ 6: '#.^.......X#' }) });
    expect(walkableCount(started(withTrap))).toBe(10);
  });

  it('does not count a cell whose Value is # or an error', () => {
    const walled = levelDoc({ cells: [{ address: 'D6', raw: '#' }] });
    expect(walkableCount(started(walled))).toBe(9);
    const both = levelDoc({
      cells: [
        { address: 'D6', raw: '#' },
        { address: 'E6', raw: '=1/0' },
      ],
    });
    expect(walkableCount(started(both))).toBe(8);
  });

  it('ignores the rules panel', () => {
    const doc = levelDoc({ cells: [{ address: 'A14', raw: '.' }] });
    expect(walkableCount(started(doc))).toBe(10);
  });
});

describe('manhattan', () => {
  it('adds the column and row distances', () => {
    expect(manhattan('B6', 'K6')).toBe(9);
    expect(manhattan('B6', 'C7')).toBe(2);
    expect(manhattan('K6', 'B6')).toBe(9);
    expect(manhattan('A1', 'A1')).toBe(0);
  });

  it('throws on a bad address', () => {
    expect(() => manhattan('M1', 'A1')).toThrow(/bad address/);
    expect(() => manhattan('A1', 'nope')).toThrow(/bad address/);
  });
});

describe('boardText', () => {
  it('shows @ for the hero and M for a monster', () => {
    const text = boardText(started(monsterRoom()));
    expect(text.split('@')).toHaveLength(2);
    expect(text).toContain('#@M');
    expect(text).toContain('hp 3, ink 1, turn 0, playing');
  });
});

describe('describeStep', () => {
  it('describes an accepted step on one line', () => {
    const step = replay(corridor(), [{ kind: 'move', dir: 'E' }]).steps[0];
    if (step === undefined) throw new Error('no step');
    expect(describeStep('01-the-corridor', step)).toBe(
      '01-the-corridor action 1 (move E): accepted (hp 3, ink 1, status playing)',
    );
  });

  it('describes a refusal with its reason and the board', () => {
    const step = replay(corridor(), [{ kind: 'move', dir: 'N' }]).steps[0];
    if (step === undefined) throw new Error('no step');
    const text = describeStep('01-the-corridor', step);
    expect(text).toContain('action 1 (move N): refused (blocked:');
    expect(text).toContain('@');
  });
});

describe('parseSolution', () => {
  const valid = {
    levelId: '03-the-locked-crypt',
    minimalInk: 2,
    actions: [
      { kind: 'edit', address: 'B14', raw: '7' },
      { kind: 'edit', address: 'B15', raw: '191' },
      { kind: 'move', dir: 'E' },
      { kind: 'wait' },
    ],
  };
  const parse = (value: unknown): ReturnType<typeof parseSolution> => parseSolution(JSON.stringify(value));
  const withAction = (action: unknown): unknown => ({ ...valid, actions: [...valid.actions, action] });

  it('accepts a valid text', () => {
    const solution = parse(valid);
    expect(solution.levelId).toBe('03-the-locked-crypt');
    expect(solution.minimalInk).toBe(2);
    expect(solution.actions).toEqual(valid.actions);
  });

  it('rejects an undo action', () => {
    expect(() => parse(withAction({ kind: 'undo' }))).toThrow('actions[4].kind: "undo" is not allowed');
  });

  it('rejects an extra field on an action, naming its path', () => {
    expect(() => parse(withAction({ kind: 'wait', foo: 1 }))).toThrow('actions[4]: unexpected key "foo"');
    expect(() => parse(withAction({ kind: 'move', dir: 'E', extra: true }))).toThrow(
      'actions[4]: unexpected key "extra"',
    );
  });

  it('rejects a missing field on an action', () => {
    expect(() => parse(withAction({ kind: 'move' }))).toThrow('actions[4]: missing key "dir"');
    expect(() => parse(withAction({ kind: 'edit', address: 'B14' }))).toThrow('actions[4]: missing key "raw"');
  });

  it('rejects a missing minimalInk', () => {
    expect(() => parse({ levelId: valid.levelId, actions: valid.actions })).toThrow('missing key "minimalInk"');
  });

  it('rejects a bad dir and an unknown kind', () => {
    expect(() => parse(withAction({ kind: 'move', dir: 'X' }))).toThrow('actions[4].dir: must be N, S, E or W');
    expect(() => parse(withAction({ kind: 'jump' }))).toThrow('actions[4].kind: must be');
  });

  it('rejects an empty actions array', () => {
    expect(() => parse({ ...valid, actions: [] })).toThrow('actions: must be a non-empty array');
  });

  it('rejects an edit count different from minimalInk', () => {
    expect(() => parse({ ...valid, minimalInk: 1 })).toThrow('minimalInk: is 1, but the actions hold 2 edit action(s)');
    expect(() => parse({ ...valid, minimalInk: 3 })).toThrow('minimalInk: is 3, but the actions hold 2 edit action(s)');
  });

  it('rejects a bad minimalInk, a bad levelId, extra root keys and non-objects', () => {
    expect(() => parse({ ...valid, minimalInk: -1 })).toThrow('minimalInk: must be a whole number of 0 or more');
    expect(() => parse({ ...valid, minimalInk: 1.5 })).toThrow('minimalInk: must be a whole number of 0 or more');
    expect(() => parse({ ...valid, levelId: '' })).toThrow('levelId: must be a non-empty string');
    expect(() => parse({ ...valid, note: 'x' })).toThrow('unexpected key "note"');
    expect(() => parse([])).toThrow('solution must be an object');
    expect(() => parse(null)).toThrow('solution must be an object');
    expect(() => parseSolution('{ not json')).toThrow('solution is not valid JSON');
  });

  it('accepts a solution with no edit and minimalInk 0', () => {
    const solution = parse({ levelId: '01-the-corridor', minimalInk: 0, actions: [{ kind: 'move', dir: 'E' }] });
    expect(solution.actions).toEqual([{ kind: 'move', dir: 'E' }]);
  });
});
