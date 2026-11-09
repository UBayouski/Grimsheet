import { describe, expect, it } from 'vitest';
import { cellValue, startRun } from '../game/index';
import {
  LEVEL_IDS,
  describeStep,
  finalSnapshot,
  loadLevelFile,
  parseSolution,
  readSolution,
  readSolutionText,
  replay,
} from './helpers';

const EXPECTED_INK = [0, 2, 2, 1, 2];
const EXPECTED_MINIMAL_INK = [0, 1, 1, 1, 2];
const EXPECTED_HP = [3, 3, 3, 5, 6];

describe.each(LEVEL_IDS.map((id, index) => ({ id, index })))('solution of $id', ({ id, index }) => {
  const file = loadLevelFile(id);
  const solution = readSolution(id);

  describe('shape and text', () => {
    it('has a non-empty action array of move, wait and edit only', () => {
      expect(solution.actions.length).toBeGreaterThan(0);
      for (const action of solution.actions) {
        expect(['move', 'wait', 'edit']).toContain(action.kind);
        if (action.kind === 'move') {
          expect(Object.keys(action).sort()).toEqual(['dir', 'kind']);
          expect(['N', 'S', 'E', 'W']).toContain(action.dir);
        } else if (action.kind === 'wait') {
          expect(Object.keys(action)).toEqual(['kind']);
        } else {
          expect(Object.keys(action).sort()).toEqual(['address', 'kind', 'raw']);
        }
      }
    });

    it('names its level and counts its edits', () => {
      expect(solution.levelId).toBe(id);
      const edits = solution.actions.filter((a) => a.kind === 'edit').length;
      expect(edits).toBe(solution.minimalInk);
      if (index === 0) {
        expect(solution.minimalInk).toBe(0);
        expect(edits).toBe(0);
      }
    });

    it('is stored as JSON.stringify(parsed, null, 2) plus a newline, with no carriage return', () => {
      const text = readSolutionText(id);
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
      expect(text).not.toContain('\r');
      expect(parseSolution(text)).toEqual(solution);
    });
  });

  describe('replay', () => {
    it('accepts every action and ends on a win', () => {
      const run = replay(file.doc, solution.actions);
      for (const step of run.steps) {
        expect(step.result.ok, describeStep(id, step)).toBe(true);
      }
      expect(run.refusedAt).toBeUndefined();
      expect(run.steps).toHaveLength(solution.actions.length);
      for (const step of run.steps.slice(0, -1)) {
        expect(step.state.hp, describeStep(id, step)).toBeGreaterThan(0);
        expect(step.state.ink, describeStep(id, step)).toBeGreaterThanOrEqual(0);
        expect(step.state.status, describeStep(id, step)).toBe('playing');
      }
      expect(run.final.status).toBe('won');
      expect(run.final.hp).toBeGreaterThan(0);
      const under = cellValue(run.final, run.final.hero);
      expect(under !== undefined && under.kind === 'string' && under.value).toBe('X');
    });

    it('gives equal final snapshots on two separate runs', () => {
      const first = startRun(file.doc);
      const second = startRun(file.doc);
      expect(first.ok && second.ok).toBe(true);
      const a = replay(file.doc, solution.actions);
      const b = replay(file.doc, solution.actions);
      expect(finalSnapshot(a.final)).toEqual(finalSnapshot(b.final));
    });
  });

  describe('ink table', () => {
    it('matches the expected ink, minimal ink and starting HP', () => {
      const started = startRun(file.doc);
      if (!started.ok) throw new Error(`startRun refused ${id}`);
      expect(started.state.ink).toBe(EXPECTED_INK[index]);
      expect(solution.minimalInk).toBe(EXPECTED_MINIMAL_INK[index]);
      expect(started.state.hp).toBe(EXPECTED_HP[index]);
      expect([solution.minimalInk, solution.minimalInk + 1]).toContain(started.state.ink);
    });

    it('stops at the last edit with no-ink when ink is one below minimal ink', () => {
      if (solution.minimalInk === 0) return;
      const doc = JSON.parse(JSON.stringify(file.doc)) as { ink: number };
      doc.ink = solution.minimalInk - 1;
      const run = replay(doc, solution.actions);
      let lastEdit = -1;
      solution.actions.forEach((a, i) => {
        if (a.kind === 'edit') lastEdit = i;
      });
      expect(run.refusedAt).toBe(lastEdit);
      const last = run.steps[run.steps.length - 1]!;
      expect(last.result.ok).toBe(false);
      if (!last.result.ok) expect(last.result.reason).toBe('no-ink');
    });
  });
});
