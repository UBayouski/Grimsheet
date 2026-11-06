import { describe, expect, it } from 'vitest';
import { cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import { describeStep, loadLevelFile, lockReport, manhattan, readSolution, replay, walkableCount } from './helpers';

const ID = '02-the-chaser';
const MOVE_RAW = '=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")';
const ATK_RAW = '=IF(DIST(HERO,SELF)<2,2,0)';

function started(): RunState {
  const result = startRun(loadLevelFile(ID).doc);
  if (!result.ok) throw new Error('startRun refused level 2');
  return result.state;
}

describe('level 2, The Chaser', () => {
  const file = loadLevelFile(ID);

  it('loads, starts and matches its serialized text', () => {
    const state = started();
    expect(state.hp).toBe(3);
    expect(state.ink).toBe(2);
    expect(state.status).toBe('playing');
    expect(file.text).toBe(serializeLevelText(file.level));
  });

  it('has the rule cells with their raw text and no locks', () => {
    const state = started();
    expect(cellRawText(state, 'B14')).toBe(MOVE_RAW);
    expect(cellName(state, 'B14')).toBe('MOVE_M1');
    expect(isCellLocked(state, 'B14')).toBe(false);
    expect(cellRawText(state, 'B15')).toBe(ATK_RAW);
    expect(cellName(state, 'B15')).toBe('ATK_M1');
    expect(isCellLocked(state, 'B15')).toBe(false);
    expect(isCellLocked(state, 'A14')).toBe(true);
    expect(isCellLocked(state, 'A15')).toBe(true);
    expect(cellRawText(state, 'A14')).toBe('Move rule of M1');
    expect(cellRawText(state, 'A15')).toBe('Attack rule of M1');
  });

  it('has exactly MOVE_M1 and ATK_M1 editable', () => {
    const open = file.level.cells.filter((c) => c.locked !== true);
    expect(open.map((c) => c.name).sort()).toEqual(['ATK_M1', 'MOVE_M1']);
  });

  it('has one monster M1 at H6 with its rule names', () => {
    expect(file.level.monsters).toHaveLength(1);
    const m = file.level.monsters[0]!;
    expect(m.id).toBe('M1');
    expect(m.at).toBe('H6');
    expect(m.move).toBe('MOVE_M1');
    expect(m.atk).toBe('ATK_M1');
    expect(file.level.hero.at).toBe('B6');
  });

  it('puts the exit at K6, behind the monster', () => {
    const value = cellValue(started(), 'K6');
    expect(value !== undefined && value.kind === 'string' && value.value).toBe('X');
    expect(manhattan('B6', 'K6')).toBeGreaterThan(manhattan('B6', 'H6'));
  });

  it('keeps the walkable area within the size rule', () => {
    expect(walkableCount(started())).toBeLessThanOrEqual(60);
  });

  it('has the title, tab label, hint and seed', () => {
    expect(file.level.title).toBe('The Chaser');
    expect(tabLabel(file.level)).toBe('Sheet2: The Chaser');
    expect(file.level.hint).toContain('MOVE_M1');
    expect(file.level.seed).toBe(2);
  });

  it('locks every map cell and every panel label; only the editable cells are open (Decision 7)', () => {
    const report = lockReport(started());
    expect(report.openMapCells).toEqual([]);
    expect(report.openLabelCells).toEqual([]);
    expect([...report.openCells].sort()).toEqual(['ATK_M1', 'MOVE_M1']);
  });

  it('replays the stored solution to a win', () => {
    const solution = readSolution(ID);
    expect(solution.levelId).toBe(ID);
    expect(solution.minimalInk).toBe(1);
    expect(solution.actions).toHaveLength(14);
    const run = replay(file.doc, solution.actions);
    for (const s of run.steps) {
      expect(s.result.ok, describeStep(ID, s)).toBe(true);
    }
    expect(run.refusedAt).toBeUndefined();
    for (const s of run.steps.slice(0, -1)) {
      expect(s.state.hp).toBeGreaterThan(0);
    }
    expect(run.final.status).toBe('won');
    expect(run.final.hp).toBe(3);
  });

  it('keeps every route cell at least 2 from H6', () => {
    const solution = readSolution(ID);
    const run = replay(file.doc, solution.actions);
    for (const s of run.steps) {
      expect(manhattan(s.state.hero, 'H6'), `after action ${s.index + 1}`).toBeGreaterThanOrEqual(2);
    }
  });
});
