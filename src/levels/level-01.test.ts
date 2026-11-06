import { describe, expect, it } from 'vitest';
import { applyAction, cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import { describeStep, loadLevelFile, lockReport, readSolution, replay } from './helpers';

const ID = '01-the-corridor';

function started(): RunState {
  const result = startRun(loadLevelFile(ID).doc);
  if (!result.ok) throw new Error('startRun refused level 1');
  return result.state;
}

function shown(state: RunState, address: string): string {
  const value = cellValue(state, address);
  if (value === undefined) return '-';
  if (value.kind === 'number') return String(value.value);
  if (value.kind === 'string') return value.value;
  return value.kind;
}

describe('level 1, The Corridor', () => {
  const file = loadLevelFile(ID);

  it('loads, starts and matches its serialized text', () => {
    const state = started();
    expect(state.hp).toBe(3);
    expect(state.ink).toBe(0);
    expect(state.status).toBe('playing');
    expect(file.text).toBe(serializeLevelText(file.level));
  });

  it('has the title, tab label and hint', () => {
    expect(file.level.title).toBe('The Corridor');
    expect(tabLabel(file.level)).toBe('Sheet1: The Corridor');
    expect(file.level.hint).toContain('DIST_TO_EXIT');
    expect(file.level.hint.toLowerCase()).toContain('rules panel');
    expect(file.level.seed).toBe(1);
  });

  it('has DIST_TO_EXIT as a locked named formula in the rules panel', () => {
    const state = started();
    expect(cellRawText(state, 'B14')).toBe('=DIST(HERO,K6)');
    expect(cellName(state, 'B14')).toBe('DIST_TO_EXIT');
    expect(isCellLocked(state, 'B14')).toBe(true);
    expect(cellRawText(state, 'A14')).toBe('Steps to the exit');
    expect(isCellLocked(state, 'A14')).toBe(true);
  });

  it('has no editable cell at all', () => {
    expect(file.level.cells.filter((c) => c.locked !== true)).toEqual([]);
  });

  it('locks every map cell and every panel label; no cell is open (Decision 7)', () => {
    const report = lockReport(started());
    expect(report.openMapCells).toEqual([]);
    expect(report.openLabelCells).toEqual([]);
    expect(report.openCells).toEqual([]);
  });

  it('has no monsters', () => {
    expect(file.level.monsters).toHaveLength(0);
    expect(started().monsters).toHaveLength(0);
  });

  it('starts the hero on B6 with the exit at K6', () => {
    const state = started();
    expect(state.hero).toBe('B6');
    expect(shown(state, 'K6')).toBe('X');
  });

  it('reads DIST_TO_EXIT as 9 at load', () => {
    expect(shown(started(), 'B14')).toBe('9');
  });

  it('replays the stored solution to a win with DIST_TO_EXIT at 0', () => {
    const solution = readSolution(ID);
    expect(solution.levelId).toBe(ID);
    expect(solution.minimalInk).toBe(0);
    expect(solution.actions).toHaveLength(9);
    expect(solution.actions.every((a) => a.kind === 'move' && a.dir === 'E')).toBe(true);
    const run = replay(file.doc, solution.actions);
    for (const s of run.steps) {
      expect(s.result.ok, describeStep(ID, s)).toBe(true);
    }
    expect(run.refusedAt).toBeUndefined();
    for (const s of run.steps.slice(0, -1)) {
      expect(s.state.hp).toBeGreaterThan(0);
      expect(s.state.status).toBe('playing');
    }
    expect(run.final.status).toBe('won');
    expect(run.final.hp).toBe(3);
    expect(run.final.ink).toBe(0);
    expect(run.final.hero).toBe('K6');
    expect(shown(run.final, 'B14')).toBe('0');
  });

  it('cannot be edited: with 0 ink and every cell locked, an edit is refused', () => {
    const result = applyAction(started(), { kind: 'edit', address: 'B14', raw: '0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['locked', 'no-ink']).toContain(result.reason);
  });
});
