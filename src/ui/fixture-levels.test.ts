import { describe, expect, it } from 'vitest';
import { FIXTURE_LEVELS } from '../../tests/fixtures/levels';
import { applyAction, cellRawText, startRun } from '../game/index';
import type { RunState } from '../game/index';
import { STUB_LEVELS } from '../stub-levels';

function start(doc: unknown): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error(`start failed: ${JSON.stringify(result.errors)}`);
  return result.state;
}

describe('fixture and stub levels', () => {
  it('every fixture level and stub level starts', () => {
    expect(FIXTURE_LEVELS).toHaveLength(2);
    expect(STUB_LEVELS.length).toBeGreaterThan(0);
    for (const doc of [...FIXTURE_LEVELS, ...STUB_LEVELS]) {
      expect(startRun(doc).ok).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = [...FIXTURE_LEVELS, ...STUB_LEVELS].map((doc) => (doc as { id: string }).id);
    const fixtureIds = FIXTURE_LEVELS.map((doc) => (doc as { id: string }).id);
    expect(new Set(fixtureIds).size).toBe(fixtureIds.length);
    const stubIds = STUB_LEVELS.map((doc) => (doc as { id: string }).id);
    expect(new Set(stubIds).size).toBe(stubIds.length);
    expect(ids.length).toBe(fixtureIds.length + stubIds.length);
  });

  it('first fixture has no monsters and an exit two steps east of the hero', () => {
    const state = start(FIXTURE_LEVELS[0]);
    expect(state.monsters).toHaveLength(0);
    expect(state.hero).toBe('B2');
    expect(state.hp).toBe(5);
    expect(state.ink).toBe(3);
  });

  it('second fixture has labelled rule cells B15 and B16', () => {
    const state = start(FIXTURE_LEVELS[1]);
    expect(state.monsters).toHaveLength(1);
    expect(cellRawText(state, 'B15')).toBe('"-"');
    expect(cellRawText(state, 'B16')).toBe('0');
  });

  it('first fixture is won by two moves east', () => {
    let state = start(FIXTURE_LEVELS[0]);
    for (let i = 0; i < 2; i += 1) {
      const result = applyAction(state, { kind: 'move', dir: 'E' });
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    }
    expect(state.status).toBe('won');
  });
});
