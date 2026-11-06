import { describe, expect, it } from 'vitest';
import { formatValue } from '../engine/index';
import { applyAction, cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { Action, RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import { loadLevelFile, readSolution, replay } from './helpers';

const ID = '04-the-trap-row';
const COLUMNS = 'ABCDEFGHIJKL';

function started(): RunState {
  const result = startRun(loadLevelFile(ID).doc);
  if (!result.ok) throw new Error('startRun refused level 4');
  return result.state;
}

function step(state: RunState, action: Action): RunState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  return result.state;
}

function shown(state: RunState, address: string): string {
  const value = cellValue(state, address);
  return value === undefined ? '-' : formatValue(value);
}

describe('level 4, The Trap Row', () => {
  const file = loadLevelFile(ID);

  it('loads, starts and matches its serialized text', () => {
    const state = started();
    expect(state.hp).toBe(5);
    expect(state.ink).toBe(1);
    expect(state.status).toBe('playing');
    expect(file.text).toBe(serializeLevelText(file.level));
  });

  it('has the title, tab label and hint', () => {
    expect(file.level.title).toBe('The Trap Row');
    expect(tabLabel(file.level)).toBe('Sheet4: The Trap Row');
    expect(file.level.hint).toContain('#DIV/0!');
    expect(file.level.hint).toContain('RATIO');
    expect(file.level.seed).toBe(4);
    expect(file.level.hero.at).toBe('B6');
  });

  it('has TRAP locked at 3 and the expected raw texts', () => {
    const state = started();
    expect(cellRawText(state, 'B14')).toBe('3');
    expect(cellName(state, 'B14')).toBe('TRAP');
    expect(isCellLocked(state, 'B14')).toBe(true);
    expect(cellRawText(state, 'B15')).toBe('=LOAD/DIVISOR');
    expect(cellRawText(state, 'B16')).toBe('6');
    expect(cellRawText(state, 'B17')).toBe('0');
  });

  it('starts with F6 and RATIO as #DIV/0!', () => {
    const state = started();
    expect(shown(state, 'F6')).toBe('#DIV/0!');
    expect(shown(state, 'B15')).toBe('#DIV/0!');
  });

  it('has exactly LOAD and DIVISOR editable', () => {
    const names = file.level.cells
      .filter((c) => c.locked !== true && c.name !== undefined)
      .map((c) => c.name);
    expect(names.sort()).toEqual(['DIVISOR', 'LOAD']);
    expect(file.level.cells.filter((c) => c.locked !== true)).toHaveLength(2);
  });

  it('has no monsters', () => {
    expect(file.level.monsters).toHaveLength(0);
    expect(started().monsters).toHaveLength(0);
  });

  it('has a band of traps in columns F and G, rows 2 to 5 and 7 to 11', () => {
    const state = started();
    for (let row = 1; row <= 12; row += 1) {
      for (const letter of COLUMNS) {
        const inBand = (letter === 'F' || letter === 'G') && ((row >= 2 && row <= 5) || (row >= 7 && row <= 11));
        const isTrap = shown(state, `${letter}${row}`) === '^';
        expect(isTrap, `${letter}${row}`).toBe(inBand);
      }
    }
  });

  it('leaves RATIO broken when LOAD is edited (decoy)', () => {
    const state = step(started(), { kind: 'edit', address: 'B16', raw: '9' });
    expect(shown(state, 'B15')).toBe('#DIV/0!');
    expect(shown(state, 'F6')).toBe('#DIV/0!');
  });

  it('loses on a crossing over the traps', () => {
    let state = started();
    for (const dir of ['E', 'E', 'E'] as const) state = step(state, { kind: 'move', dir });
    state = step(state, { kind: 'move', dir: 'N' });
    expect(state.hero).toBe('E5');
    state = step(state, { kind: 'move', dir: 'E' });
    expect(state.hero).toBe('F5');
    expect(state.hp).toBe(2);
    state = step(state, { kind: 'move', dir: 'E' });
    expect(state.status).toBe('lost');
  });

  it('replays the stored solution to a win', () => {
    const solution = readSolution(ID);
    expect(solution.levelId).toBe(ID);
    expect(solution.minimalInk).toBe(1);
    expect(solution.actions).toHaveLength(10);
    const run = replay(file.doc, solution.actions);
    expect(run.refusedAt).toBeUndefined();
    expect(run.steps.every((s) => s.result.ok)).toBe(true);
    const beforeLast = run.steps[run.steps.length - 2];
    expect(beforeLast?.state.hp ?? 0).toBeGreaterThan(0);
    expect(run.final.status).toBe('won');
    expect(run.final.hp).toBe(5);
    expect(run.final.ink).toBe(0);
  });
});
