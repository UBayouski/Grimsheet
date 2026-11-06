import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { createRandom } from './random';
import { cellRawText, cellValue, startRun } from './run';
import { applyAction } from './turn';
import {
  actionListArbitrary,
  assertProperty,
  gameLevelArbitrary,
  stateDifference,
} from './testing/arbitraries';
import type { StateLike } from './testing/arbitraries';
import type { ActionResult, RunState } from './types';

const NUM_RUNS = 200;

/** State_Equality over every field and all 240 cells (raw text and value). */
function difference(a: RunState, b: RunState, ignoreSnapshot: boolean): string | undefined {
  return stateDifference(a, b, {
    ignoreSnapshot,
    readCell: (s: StateLike, address: string) => [
      cellRawText(s as RunState, address),
      cellValue(s as RunState, address),
    ],
  });
}

/** The next number the generator would draw from a state. */
function nextDraw(state: RunState): number {
  return createRandom(0, state.rngState).next();
}

function sameResult(x: ActionResult, y: ActionResult): string | undefined {
  if (x.ok !== y.ok) return 'ok';
  if (!x.ok && !y.ok) {
    if (x.reason !== y.reason) return 'reason';
    return x.message === y.message ? undefined : 'message';
  }
  if (x.ok && y.ok) {
    const d = difference(x.state, y.state, false);
    return d === undefined ? undefined : `state ${d}`;
  }
  return undefined;
}

const UNDO = { kind: 'undo' } as const;

function expectNothingToUndo(result: ActionResult, where: string): void {
  if (result.ok) throw new Error(`undo on ${where} was accepted`);
  if (result.reason !== 'nothing-to-undo') throw new Error(`undo on ${where} refused with ${result.reason}`);
}

describe('undo', () => {
  it('an accepted undo is the exact inverse of an accepted turn', () => {
    // Feature: game-rules, Property 2: Accepted undo is the exact inverse of an accepted Turn_Action
    assertProperty(
      fc.property(gameLevelArbitrary, actionListArbitrary, (doc, actions) => {
        const started = startRun(doc);
        if (!started.ok) return;
        let state = started.state;
        for (const action of actions) {
          const turn = applyAction(state, action);
          // Undo is not an accepted Turn_Action; other refusals leave the state as it was.
          if (!turn.ok || (action as { kind?: unknown }).kind === 'undo') {
            if (turn.ok) state = turn.state;
            continue;
          }
          const after = turn.state;
          if (after.status !== 'playing') {
            // Dead and won are final: undo is refused.
            const refused = applyAction(after, UNDO);
            if (refused.ok || refused.reason !== 'not-playing') throw new Error('undo after the end was not refused');
            break;
          }
          const undone = applyAction(after, UNDO);
          if (!undone.ok) throw new Error(`undo refused with ${undone.reason}`);
          const diff = difference(state, undone.state, true);
          if (diff !== undefined) throw new Error(`undo did not restore the earlier state at ${diff}`);
          if (undone.state.undoSnapshot !== null) throw new Error('undoSnapshot is not null after undo');
          if (nextDraw(undone.state) !== nextDraw(state)) throw new Error('next generator draw differs');
          state = after;
        }
      }),
      NUM_RUNS,
    );
    // The spec's time limits apply per case, not per test, so the test gets a long timeout.
  }, 60_000);

  it('refuses undo with nothing to undo and ignores refused actions', () => {
    // Feature: game-rules, Property 3: Undo refusals
    assertProperty(
      fc.property(gameLevelArbitrary, actionListArbitrary, (doc, actions) => {
        const started = startRun(doc);
        if (!started.ok) return;
        let state = started.state;
        expectNothingToUndo(applyAction(state, UNDO), 'a fresh run');
        for (const action of actions) {
          const before = applyAction(state, UNDO);
          const result = applyAction(state, action);
          if (!result.ok) {
            const again = applyAction(state, UNDO);
            const diff = sameResult(before, again);
            if (diff !== undefined) throw new Error(`undo changed after a refused action at ${diff}`);
            continue;
          }
          state = result.state;
          if ((action as { kind?: unknown }).kind === 'undo') {
            expectNothingToUndo(applyAction(state, UNDO), 'a just-undone state');
          }
        }
      }),
      NUM_RUNS,
    );
    // The spec's time limits apply per case, not per test, so the test gets a long timeout.
  }, 60_000);
});
