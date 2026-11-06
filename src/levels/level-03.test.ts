import { describe, expect, it } from 'vitest';
import { applyAction, cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { Action, RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import { describeStep, loadLevelFile, readSolution, replay } from './helpers';

const ID = '03-the-locked-crypt';

function started(): RunState {
  const result = startRun(loadLevelFile(ID).doc);
  if (!result.ok) throw new Error('startRun refused level 3');
  return result.state;
}

function step(state: RunState, action: Action): RunState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  return result.state;
}

function shown(state: RunState, address: string): string {
  const value = cellValue(state, address);
  if (value === undefined) return '-';
  if (value.kind === 'number') return String(value.value);
  if (value.kind === 'string') return value.value;
  return value.kind;
}

describe('level 3, The Locked Crypt', () => {
  const file = loadLevelFile(ID);

  it('loads, starts and matches its serialized text', () => {
    const state = started();
    expect(state.hp).toBe(3);
    expect(state.ink).toBe(2);
    expect(state.status).toBe('playing');
    expect(file.text).toBe(serializeLevelText(file.level));
  });

  it('has the title, tab label, hint and no monsters', () => {
    expect(file.level.title).toBe('The Locked Crypt');
    expect(tabLabel(file.level)).toBe('Sheet3: The Locked Crypt');
    expect(file.level.hint).toContain('KEY');
    expect(file.level.hint.includes('RUNE_ASH') || file.level.hint.includes('RUNE_SALT')).toBe(true);
    expect(file.level.seed).toBe(3);
    expect(file.level.hero.at).toBe('B6');
    expect(file.level.monsters).toHaveLength(0);
  });

  it('has a locked door formula at G6 and a locked KEY', () => {
    const state = started();
    expect(cellRawText(state, 'G6')).toBe('=IF(KEY=1337,".","#")');
    expect(isCellLocked(state, 'G6')).toBe(true);
    expect(cellRawText(state, 'B17')).toBe('=RUNE_ASH*RUNE_SALT');
    expect(cellName(state, 'B17')).toBe('KEY');
    expect(isCellLocked(state, 'B17')).toBe(true);
    expect(shown(state, 'K6')).toBe('X');
  });

  it('starts with KEY at 1520 and the door shut', () => {
    const state = started();
    expect(shown(state, 'B17')).toBe('1520');
    expect(shown(state, 'G6')).toBe('#');
  });

  it('has RUNE_DUST read by no formula', () => {
    const formulas = file.level.cells.filter((c) => c.raw.startsWith('='));
    expect(formulas.length).toBeGreaterThan(0);
    for (const cell of formulas) expect(cell.raw).not.toContain('RUNE_DUST');
  });

  it('has exactly the three runes editable', () => {
    const open = file.level.cells.filter((c) => c.locked !== true);
    expect(open.map((c) => c.name).sort()).toEqual(['RUNE_ASH', 'RUNE_DUST', 'RUNE_SALT']);
  });

  it('leaves the door shut after an edit of RUNE_DUST alone', () => {
    const state = step(started(), { kind: 'edit', address: 'B16', raw: '99' });
    expect(shown(state, 'B17')).toBe('1520');
    expect(shown(state, 'G6')).toBe('#');
  });

  it('replays the stored solution to a win', () => {
    const solution = readSolution(ID);
    expect(solution.levelId).toBe(ID);
    expect(solution.minimalInk).toBe(2);
    expect(solution.actions).toHaveLength(11);
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
    expect(run.final.ink).toBe(0);
    expect(shown(run.steps[0]!.state, 'B17')).toBe('1330');
    expect(shown(run.steps[0]!.state, 'G6')).toBe('#');
    expect(shown(run.steps[1]!.state, 'B17')).toBe('1337');
    expect(shown(run.steps[1]!.state, 'G6')).toBe('.');
  });
});
