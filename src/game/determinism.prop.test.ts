import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { cellRawText, cellValue, startRun } from './run';
import { applyAction } from './turn';
import {
  ALL_ADDRESSES,
  actionListArbitrary,
  assertProperty,
  gameLevelArbitrary,
  stateDifference,
} from './testing/arbitraries';
import type { ActionResult, RunState } from './types';

const NUM_RUNS = 200;

/** Wires the read API into State_Equality so every cell's text and Value is compared. */
function difference(a: RunState, b: RunState): string | undefined {
  // Two startRun calls build two Level objects; State_Equality compares levels by identity,
  // so the levels are compared by content here and the second state is rebased on the first.
  if (JSON.stringify(a.level) !== JSON.stringify(b.level)) return 'level';
  // The rebased copy is not a registered state, so cells are read from the originals below.
  const fields = stateDifference(a, { ...b, level: a.level });
  if (fields !== undefined) return fields;
  for (const address of ALL_ADDRESSES) {
    const x = JSON.stringify([cellRawText(a, address), cellValue(a, address)]);
    const y = JSON.stringify([cellRawText(b, address), cellValue(b, address)]);
    if (x !== y) return `cell ${address}`;
  }
  return undefined;
}

function compareResults(x: ActionResult, y: ActionResult): string | undefined {
  if (x.ok !== y.ok) return 'ok';
  if (!x.ok && !y.ok) {
    if (x.reason !== y.reason) return 'refusal reason';
    if (x.message !== y.message) return 'refusal message';
    return undefined;
  }
  if (x.ok && y.ok) {
    if (JSON.stringify(x.damage) !== JSON.stringify(y.damage)) return 'damage log';
    const d = difference(x.state, y.state);
    return d === undefined ? undefined : `state ${d}`;
  }
  return undefined;
}

/** Runs the actions from a fresh startRun. Refused actions leave the state unchanged. */
function play(doc: unknown, actions: readonly unknown[]): { start: RunState; results: ActionResult[] } | undefined {
  const started = startRun(doc);
  if (!started.ok) return undefined;
  const results: ActionResult[] = [];
  let state = started.state;
  for (const action of actions) {
    const result = applyAction(state, action);
    results.push(result);
    if (result.ok) state = result.state;
  }
  return { start: started.state, results };
}

describe('determinism', () => {
  it('same level and same actions give the same results and states', () => {
    // Feature: game-rules, Property 1: Determinism
    assertProperty(
      fc.property(gameLevelArbitrary, actionListArbitrary, (doc, actions) => {
        const first = play(doc, actions);
        const second = play(doc, actions);
        if (first === undefined || second === undefined) {
          if (first !== second) throw new Error('startRun was not deterministic');
          return;
        }
        const startDiff = difference(first.start, second.start);
        if (startDiff !== undefined) throw new Error(`start states differ at ${startDiff}`);
        if (first.results.length !== second.results.length) throw new Error('result counts differ');
        first.results.forEach((x, i) => {
          const diff = compareResults(x, second.results[i] as ActionResult);
          if (diff !== undefined) throw new Error(`action ${i} differs at ${diff}`);
        });
      }),
      NUM_RUNS,
    );
  });
});
