import { describe, expect, it } from 'vitest';
import type { Level } from '../model/index';
import { MAX_DAMAGE, REFUSAL_REASONS } from './types';
import type { ActionResult, RunState } from './types';

const EXPECTED = [
  'not-playing',
  'blocked',
  'occupied',
  'locked',
  'bad-address',
  'reserved-row',
  'unchanged',
  'no-ink',
  'parse-error',
  'nothing-to-undo',
  'invalid-action',
  'internal-error',
];

describe('REFUSAL_REASONS', () => {
  it('equals the twelve codes of the design', () => {
    expect([...REFUSAL_REASONS]).toEqual(EXPECTED);
  });

  it('has no duplicates', () => {
    expect(new Set(REFUSAL_REASONS).size).toBe(REFUSAL_REASONS.length);
  });

  it('has only non-empty kebab-case codes', () => {
    for (const code of REFUSAL_REASONS) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('MAX_DAMAGE', () => {
  it('equals 1e9', () => {
    expect(MAX_DAMAGE).toBe(1e9);
  });
});

describe('type samples', () => {
  it('compiles a RunState and ActionResult literal', () => {
    const state: RunState = {
      level: {} as Level,
      edits: [{ address: 'A1', raw: '1' }],
      hero: 'B2',
      monsters: [{ id: 'M1', at: 'C3', move: 'MOVE_M1', atk: 'ATK_M1' }],
      hp: 10,
      ink: 3,
      turn: 0,
      status: 'playing',
      rngState: 0,
      valuesHero: 'B2',
      valuesRngState: 0,
      undoSnapshot: null,
    };
    const ok: ActionResult = {
      ok: true,
      state,
      damage: [{ source: { kind: 'monster', id: 'M1' }, amount: 1 }],
    };
    const refused: ActionResult = { ok: false, reason: 'blocked', message: 'Blocked.' };
    expect(ok.ok).toBe(true);
    expect(refused.ok).toBe(false);
  });
});
