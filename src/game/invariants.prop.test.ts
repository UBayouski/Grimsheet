import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { evaluateCell, getValueByAddress, getValueByName, listCycleCells } from '../engine/index';
import { createRandom } from './random';
import { cellRawText, cellValue, startRun } from './run';
import { inMap, makeSheet, point, recalc } from './state';
import { applyAction } from './turn';
import {
  ALL_ADDRESSES,
  actionListArbitrary,
  assertProperty,
  gameLevelArbitrary,
} from './testing/arbitraries';
import { MAX_DAMAGE } from './types';
import type { DamageEntry, RunState } from './types';

const NUM_RUNS_INK = 100;
const NUM_RUNS = 200;

interface Step {
  readonly before: RunState;
  readonly action: unknown;
  /** Present for an accepted action. */
  readonly after: RunState | undefined;
  readonly damage: readonly DamageEntry[];
}

/** Starts a run and applies each action in turn, reporting every step. Refusals keep the state. */
function walk(doc: unknown, actions: readonly unknown[], visit: (step: Step) => void): RunState | undefined {
  const started = startRun(doc);
  if (!started.ok) return undefined;
  let state = started.state;
  for (const action of actions) {
    const result = applyAction(state, action);
    if (result.ok) {
      visit({ before: state, action, after: result.state, damage: result.damage });
      state = result.state;
    } else {
      visit({ before: state, action, after: undefined, damage: [] });
    }
  }
  return state;
}

function isUndo(action: unknown): boolean {
  return (action as { kind?: unknown } | null)?.kind === 'undo';
}

function fail(message: string): never {
  throw new Error(message);
}

function whole(n: number): number {
  const f = Math.floor(n);
  return f >= 1 ? Math.min(f, MAX_DAMAGE) : 0;
}

/** Level documents with no RAND() in any cell: the sheet is the same every time it is rebuilt. */
const noRandLevelArbitrary = gameLevelArbitrary.filter(
  (doc) => !JSON.stringify(doc.cells).includes('RAND'),
);

/** The "present exactly when" clauses of Property 5, read from a Sheet built the same way. */
function checkExactEntries(after: RunState, damage: readonly DamageEntry[]): void {
  if (ALL_ADDRESSES.some((a) => (cellRawText(after, a) ?? '').includes('RAND'))) return;
  const sheet = makeSheet(after.level, after.edits);
  if (sheet === undefined || !recalc(sheet, after.hero, createRandom(0, 0))) fail('could not rebuild sheet');
  const heroPoint = point(after.hero);
  if (heroPoint === undefined) fail('hero address does not parse');

  for (const m of after.monsters) {
    const selfPoint = point(m.at);
    if (selfPoint === undefined) fail('monster address does not parse');
    const atk = evaluateCell(
      sheet,
      { name: m.atk },
      { heroAddress: heroPoint, selfAddress: selfPoint, random: () => 0 },
    );
    const expected = atk.ok && atk.value.kind === 'number' ? whole(atk.value.value) : 0;
    const entries = damage.filter((e) => e.source.kind === 'monster' && e.source.id === m.id);
    const got = entries.length === 0 ? 0 : (entries[0] as DamageEntry).amount;
    if (entries.length > 1 || got !== expected) fail(`monster ${m.id}: logged ${got}, expected ${expected}`);
  }

  const onTrap = getValueByAddress(sheet, after.hero);
  const trap = getValueByName(sheet, 'TRAP');
  const expectedTrap =
    onTrap.ok && onTrap.value.kind === 'string' && onTrap.value.value === '^' && trap.ok && trap.value.kind === 'number'
      ? whole(trap.value.value)
      : 0;
  const trapEntries = damage.filter((e) => e.source.kind === 'trap');
  const gotTrap = trapEntries.length === 0 ? 0 : (trapEntries[0] as DamageEntry).amount;
  if (trapEntries.length > 1 || gotTrap !== expectedTrap) fail(`trap: logged ${gotTrap}, expected ${expectedTrap}`);

  const haunted = listCycleCells(sheet).length > 0;
  const hauntCount = damage.filter((e) => e.source.kind === 'haunt').length;
  if (hauntCount !== (haunted ? 1 : 0)) fail(`haunt: logged ${hauntCount}, haunted ${haunted}`);
}

describe('invariants', () => {
  it('keeps ink within bounds and raises it only through an accepted undo', () => {
    // Feature: game-rules, Property 4: Ink bounds
    assertProperty(
      fc.property(gameLevelArbitrary, actionListArbitrary, (doc, actions) => {
        const started = startRun(doc);
        if (!started.ok) return;
        const max = started.state.level.ink;
        if (started.state.ink < 0 || started.state.ink > max) fail('start ink out of bounds');
        walk(doc, actions, ({ before, action, after }) => {
          if (after === undefined) return;
          if (after.ink < 0 || after.ink > max) fail(`ink ${after.ink} is outside 0..${max}`);
          if (after.ink > before.ink && !isUndo(action)) fail('ink rose without an accepted undo');
        });
      }),
      NUM_RUNS_INK,
    );
  });

  it('accounts for hp through the damage log', () => {
    // Feature: game-rules, Property 5: HP accounting and the Damage_Log
    // Half the levels come from the smaller generator without RAND(), so the "present exactly
    // when" clauses are checked on those; the sum, order and bounds clauses run on every level.
    assertProperty(
      fc.property(
        fc.oneof(gameLevelArbitrary, noRandLevelArbitrary),
        actionListArbitrary,
        (doc, actions) => {
          const exact = !JSON.stringify(doc.cells).includes('RAND');
          const final = walk(doc, actions, ({ before, action, after, damage }) => {
            if (after === undefined) return;
            if (!Number.isSafeInteger(after.hp)) fail('hp is not a safe integer');
            if (isUndo(action)) return;
            let hp = before.hp;
            for (const entry of damage) {
              const a = entry.amount;
              if (!Number.isInteger(a) || a < 1 || a > MAX_DAMAGE) fail(`bad amount ${a}`);
              hp -= a;
            }
            if (hp !== after.hp) fail(`hp ${after.hp} is not ${hp} after replaying the log`);
            // Order: monsters, then at most one trap, then at most one haunt of amount 1.
            let phase = 0;
            let traps = 0;
            let haunts = 0;
            const seen = new Set<string>();
            const ids = new Set(before.monsters.map((m) => m.id));
            for (const entry of damage) {
              const kind = entry.source.kind;
              if (kind === 'monster') {
                if (phase > 0) fail('monster entry after trap or haunt');
                if (!ids.has(entry.source.id)) fail('unknown monster id in log');
                if (seen.has(entry.source.id)) fail('monster listed twice');
                seen.add(entry.source.id);
              } else if (kind === 'trap') {
                if (phase > 0) fail('trap entry out of order');
                phase = 1;
                traps += 1;
              } else {
                phase = 2;
                haunts += 1;
                if (entry.amount !== 1) fail('haunt amount is not 1');
              }
            }
            if (traps > 1 || haunts > 1) fail('more than one trap or haunt entry');
            if (exact) checkExactEntries(after, damage);
          });
          if (final !== undefined && !Number.isSafeInteger(final.hp)) fail('final hp is not a safe integer');
        },
      ),
      NUM_RUNS,
    );
  });

  it('keeps the hero and monsters on distinct Addresses inside the map', () => {
    // Feature: game-rules, Property 6: Entity placement
    const check = (state: RunState): void => {
      const addresses = [state.hero, ...state.monsters.map((m) => m.at)];
      if (new Set(addresses).size !== addresses.length) fail('two entities share an Address');
      for (const address of addresses) {
        const p = point(address);
        if (p === undefined || !inMap(p)) fail(`${address} is outside rows 1-12 and columns A-L`);
      }
    };
    assertProperty(
      fc.property(gameLevelArbitrary, actionListArbitrary, (doc, actions) => {
        const started = startRun(doc);
        if (!started.ok) return;
        check(started.state);
        walk(doc, actions, ({ after }) => {
          if (after !== undefined) check(after);
        });
      }),
      NUM_RUNS,
    );
  });

  it('keeps won and lost final and gives them their meaning', () => {
    // Feature: game-rules, Property 7: Status finality and meaning
    const meaning = (state: RunState): void => {
      if (state.status === 'won') {
        if (!(state.hp > 0)) fail('won with hp <= 0');
        const v = cellValue(state, state.hero);
        if (v === undefined || v.kind !== 'string' || v.value !== 'X') fail('won off the exit');
      }
      if (state.status === 'lost' && !(state.hp <= 0)) fail('lost with hp > 0');
      if (state.hp <= 0 && state.status !== 'lost') fail('hp <= 0 but not lost');
    };
    assertProperty(
      fc.property(gameLevelArbitrary, actionListArbitrary, (doc, actions) => {
        const started = startRun(doc);
        if (!started.ok) return;
        meaning(started.state);
        let ended: RunState['status'] | undefined;
        walk(doc, actions, ({ before, after }) => {
          if (before.status !== 'playing') {
            if (after !== undefined) fail('an action was accepted after the run ended');
            if (ended !== undefined && before.status !== ended) fail('status changed after the end');
          }
          if (after === undefined) return;
          meaning(after);
          if (after.status !== 'playing') ended = after.status;
        });
      }),
      NUM_RUNS,
    );
  });
});
