import { describe, expect, it } from 'vitest';
import { ERROR_FIXTURE_LEVELS } from '../../tests/fixtures/errors';
import { cellValue, startRun } from '../game/index';
import type { RunState, Value } from '../game/index';
import type { ErrorKind } from '../engine/index';

function start(doc: unknown): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error(`start failed: ${JSON.stringify(result.errors)}`);
  return result.state;
}

function errorAt(state: RunState, address: string): Extract<Value, { kind: 'error' }> {
  const value = cellValue(state, address);
  if (!value || value.kind !== 'error') {
    throw new Error(`${address} is not an error: ${JSON.stringify(value)}`);
  }
  return value;
}

describe('error fixture level', () => {
  it('is a single level that passes startRun', () => {
    expect(ERROR_FIXTURE_LEVELS).toHaveLength(1);
    expect(startRun(ERROR_FIXTURE_LEVELS[0]).ok).toBe(true);
  });

  it('B9, D9, F9 and H9 give the four non-cycle error kinds', () => {
    const state = start(ERROR_FIXTURE_LEVELS[0]);
    const cases: ReadonlyArray<[string, ErrorKind]> = [
      ['B9', '#REF!'],
      ['D9', '#NAME?'],
      ['F9', '#DIV/0!'],
      ['H9', '#VALUE!'],
    ];
    for (const [address, kind] of cases) {
      expect(errorAt(state, address).error).toBe(kind);
    }
  });

  it('J9 and K9 are #CYCLE! with their own address as origin', () => {
    const state = start(ERROR_FIXTURE_LEVELS[0]);
    for (const address of ['J9', 'K9']) {
      const value = errorAt(state, address);
      expect(value.error).toBe('#CYCLE!');
      expect(value.origin).toBe(address);
    }
  });

  it('L9 is #CYCLE! downstream of the cycle, not a Cycle_Cell', () => {
    const state = start(ERROR_FIXTURE_LEVELS[0]);
    const value = errorAt(state, 'L9');
    expect(value.error).toBe('#CYCLE!');
    expect(value.origin).not.toBe('L9');
  });
});
