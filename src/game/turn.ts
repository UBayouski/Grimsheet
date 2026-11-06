import { getValueByAddress, getValueByName, listCycleCells, parseAddress, parseFormula } from '../engine/index';
import type { Sheet } from '../engine/index';
import { stepMonsters } from './monsters';
import { createRandom } from './random';
import { currentRaw, isLocked, makeSheet, makeState, neighbour, recalc, sheetOf, wholeDamage } from './state';
import type {
  Action,
  ActionResult,
  DamageEntry,
  Direction,
  EditRecordEntry,
  Refusal,
  RefusalReason,
  RunState,
  Status,
  UndoSnapshot,
} from './types';

// ---------------------------------------------------------------------------
// Refusal messages (fixed templates; caller text is never echoed)
// ---------------------------------------------------------------------------

export const REFUSAL_MESSAGES: Readonly<Record<RefusalReason, string>> = {
  'not-playing': 'The run is over. Start the level again to keep playing.',
  blocked: 'Cannot move: that Cell is not walkable.',
  occupied: 'Cannot move: a monster stands there.',
  locked: 'That Cell is locked and cannot be edited.',
  'bad-address': 'That is not a cell address. Use a column A to L and a row 1 to 20.',
  'reserved-row': 'Row 13 is reserved and cannot be edited.',
  unchanged: 'That Cell already holds that text.',
  'no-ink': 'No ink left. Undo a change or restart the level.',
  'parse-error': 'That formula could not be parsed.',
  'nothing-to-undo': 'There is nothing to undo.',
  'invalid-action': 'That is not a valid action.',
  'internal-error': 'The game hit an internal fault. Nothing was changed.',
};

function refuse(reason: RefusalReason, message: string = REFUSAL_MESSAGES[reason]): Refusal {
  return Object.freeze({ ok: false as const, reason, message });
}

// ---------------------------------------------------------------------------
// Action parsing
// ---------------------------------------------------------------------------

const MAX_EDIT_LENGTH = 500;
const DIRECTIONS: readonly string[] = ['N', 'S', 'E', 'W'];

function has(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/**
 * Copies a well-formed Action; undefined for anything else. May throw if a getter throws;
 * the caller's try/catch turns that into internal-error.
 */
export function parseAction(value: unknown): Action | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  if (!has(o, 'kind')) return undefined;
  const kind = o['kind'];
  if (kind === 'wait') return { kind: 'wait' };
  if (kind === 'undo') return { kind: 'undo' };
  if (kind === 'move') {
    if (!has(o, 'dir')) return undefined;
    const dir = o['dir'];
    if (typeof dir !== 'string' || !DIRECTIONS.includes(dir)) return undefined;
    return { kind: 'move', dir: dir as Direction };
  }
  if (kind === 'edit') {
    if (!has(o, 'address') || !has(o, 'raw')) return undefined;
    const address = o['address'];
    const raw = o['raw'];
    if (typeof address !== 'string' || typeof raw !== 'string') return undefined;
    return { kind: 'edit', address, raw };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

function isWalkable(sheet: Sheet, address: string): boolean {
  const read = getValueByAddress(sheet, address);
  return (
    read.ok &&
    read.value.kind === 'string' &&
    (read.value.value === '.' || read.value.value === 'X' || read.value.value === '^')
  );
}

function cellIs(sheet: Sheet, address: string, glyph: string): boolean {
  const read = getValueByAddress(sheet, address);
  return read.ok && read.value.kind === 'string' && read.value.value === glyph;
}

/** Applies one Action. Never throws; returns a new frozen Run_State or a Refusal. */
export function applyAction(state: RunState, action: unknown): ActionResult {
  try {
    const sheet = sheetOf(state);
    if (sheet === undefined) return refuse('internal-error');
    const a = parseAction(action);
    if (a === undefined) return refuse('invalid-action');
    if (state.status !== 'playing') return refuse('not-playing');

    switch (a.kind) {
      case 'move': {
        const target = neighbour(state.hero, a.dir);
        if (target === undefined || !isWalkable(sheet, target)) return refuse('blocked');
        if (state.monsters.some((m) => m.at === target)) return refuse('occupied');
        return runTurn(state, { hero: target, edits: state.edits, ink: state.ink });
      }
      case 'wait':
        return runTurn(state, { hero: state.hero, edits: state.edits, ink: state.ink });
      case 'edit': {
        const parsed = parseAddress(a.address);
        if (!parsed.ok) return refuse('bad-address');
        if (parsed.point.row === 13) return refuse('reserved-row');
        const address = parsed.canonical;
        if (isLocked(state.level, address)) return refuse('locked');
        if (a.raw === currentRaw(state, address)) return refuse('unchanged');
        if (state.ink <= 0) return refuse('no-ink');
        if (a.raw.length > MAX_EDIT_LENGTH) {
          return refuse('parse-error', 'Text is longer than 500 characters.');
        }
        if (a.raw.startsWith('=')) {
          const result = parseFormula(a.raw);
          if (!result.ok) return refuse('parse-error', result.error.text);
        }
        const entry: EditRecordEntry = { address, raw: a.raw };
        return runTurn(state, { hero: state.hero, edits: [...state.edits, entry], ink: state.ink - 1 });
      }
      case 'undo':
        return restore(state);
    }
  } catch {
    return refuse('internal-error');
  }
}

// ---------------------------------------------------------------------------
// restore: one-step undo
// ---------------------------------------------------------------------------

function restore(prev: RunState): ActionResult {
  const snap = prev.undoSnapshot;
  if (snap === null) return refuse('nothing-to-undo');
  const sheet = makeSheet(prev.level, snap.edits);
  if (sheet === undefined) return refuse('internal-error');
  if (!recalc(sheet, snap.valuesHero, createRandom(0, snap.valuesRngState))) return refuse('internal-error');
  const state = makeState(
    {
      level: prev.level,
      edits: snap.edits,
      hero: snap.hero,
      monsters: snap.monsters,
      hp: snap.hp,
      ink: snap.ink,
      turn: snap.turn,
      status: snap.status,
      rngState: snap.rngState,
      valuesHero: snap.valuesHero,
      valuesRngState: snap.valuesRngState,
      undoSnapshot: null,
    },
    sheet,
  );
  return Object.freeze({ ok: true as const, state, damage: Object.freeze([]) });
}

// ---------------------------------------------------------------------------
// runTurn: steps 3 to 7
// ---------------------------------------------------------------------------

interface TurnInput {
  readonly hero: string;
  readonly edits: readonly EditRecordEntry[];
  readonly ink: number;
}

function snapshotOf(s: RunState): UndoSnapshot {
  return {
    edits: s.edits,
    hero: s.hero,
    monsters: s.monsters,
    hp: s.hp,
    ink: s.ink,
    turn: s.turn,
    status: s.status,
    rngState: s.rngState,
    valuesHero: s.valuesHero,
    valuesRngState: s.valuesRngState,
  };
}

function runTurn(prev: RunState, next: TurnInput): ActionResult {
  const gen = createRandom(0, prev.rngState);
  const sheet = makeSheet(prev.level, next.edits);
  if (sheet === undefined) return refuse('internal-error');
  if (!recalc(sheet, next.hero, gen)) return refuse('internal-error'); // step 3

  const stepped = stepMonsters(sheet, next.hero, prev.monsters, prev.hp, [], gen); // step 4
  let hp = stepped.hp;
  const log: DamageEntry[] = [...stepped.log];

  if (cellIs(sheet, next.hero, '^')) { // step 5
    const trap = getValueByName(sheet, 'TRAP');
    const d = trap.ok && trap.value.kind === 'number' ? wholeDamage(trap.value.value) : 0;
    if (d >= 1) {
      hp -= d;
      log.push({ source: { kind: 'trap' }, amount: d });
    }
  }

  if (listCycleCells(sheet).length > 0) { // step 6
    hp -= 1;
    log.push({ source: { kind: 'haunt' }, amount: 1 });
  }

  const valuesRngState = gen.state;
  if (!recalc(sheet, next.hero, gen)) return refuse('internal-error'); // step 7

  const status: Status = hp <= 0 ? 'lost' : cellIs(sheet, next.hero, 'X') ? 'won' : 'playing';
  const state = makeState(
    {
      level: prev.level,
      edits: next.edits,
      hero: next.hero,
      monsters: stepped.monsters,
      hp,
      ink: next.ink,
      turn: prev.turn + 1,
      status,
      rngState: gen.state,
      valuesHero: next.hero,
      valuesRngState,
      undoSnapshot: snapshotOf(prev),
    },
    sheet,
  );
  const damage = Object.freeze(log.map((e) => Object.freeze({ source: Object.freeze({ ...e.source }), amount: e.amount })));
  return Object.freeze({ ok: true as const, state, damage });
}
