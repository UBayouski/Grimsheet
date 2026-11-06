// Headless play core for automated playtesting. No DOM, no clock, no randomness of its own.
// It uses only the public APIs of src/levels/index.ts and src/game/index.ts.
import { applyAction, cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { Action, DamageLog, Direction, RunState } from '../game/index';
import { LEVELS } from '../levels/index';

const COLUMN_LETTERS = 'ABCDEFGHIJKL';
const DIRECTIONS: readonly string[] = ['N', 'S', 'E', 'W'];

/** The 240 addresses in reading order: A1, B1, ... L1, A2, ... L20. */
const ADDRESSES: readonly string[] = (() => {
  const out: string[] = [];
  for (let row = 1; row <= 20; row += 1) {
    for (const letter of COLUMN_LETTERS) out.push(`${letter}${row}`);
  }
  return out;
})();

/** Thrown for bad input (a missing level, a malformed action list). The script maps it to a non-zero exit. */
export class PlayInputError extends Error {}

/** A cell with something in it, for the end-of-play sheet dump. */
export interface CellDump {
  readonly address: string;
  readonly raw: string;
  readonly value: string;
  readonly valueKind: string;
  readonly locked: boolean;
  readonly name: string | null;
}

export interface StateView {
  readonly hero: string;
  readonly hp: number;
  readonly ink: number;
  readonly turn: number;
  readonly status: string;
  readonly monsters: { readonly id: string; readonly at: string }[];
}

export interface StepReport {
  readonly index: number;
  readonly action: Action;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly message?: string;
  readonly damage: DamageLog;
  readonly hero: string;
  readonly hp: number;
  readonly ink: number;
  readonly turn: number;
  readonly status: string;
}

export interface PlayReport {
  readonly levelId: string;
  readonly start: StateView;
  readonly steps: StepReport[];
  readonly refusedAt: number | undefined;
  readonly final: StateView;
  readonly sheet: CellDump[];
}

export interface LevelInfo {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly startingHp: number;
  readonly ink: number;
  readonly seed: number;
  readonly hero: unknown;
  readonly monsters: unknown;
  readonly map: unknown;
  readonly cells: unknown;
}

interface LevelRecord {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly startingHp: number;
  readonly ink: number;
  readonly seed: number;
  readonly hero: unknown;
  readonly monsters: unknown;
  readonly map: unknown;
  readonly cells: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The raw Level_Document for an id, or a PlayInputError listing the known ids. */
export function levelById(id: string): unknown {
  const match = (LEVELS as unknown[]).find((doc) => isRecord(doc) && doc['id'] === id);
  if (match === undefined) {
    const ids = (LEVELS as unknown[])
      .map((doc) => (isRecord(doc) && typeof doc['id'] === 'string' ? doc['id'] : '?'))
      .join(', ');
    throw new PlayInputError(`Unknown level id "${id}". Known ids: ${ids}.`);
  }
  return match;
}

/** The level ids in order. */
export function levelIds(): string[] {
  return (LEVELS as unknown[]).map((doc, i) => (isRecord(doc) && typeof doc['id'] === 'string' ? doc['id'] : `level-${i + 1}`));
}

/** Level data for `--level-info`, without playing. */
export function levelInfo(id: string): LevelInfo {
  const doc = levelById(id) as LevelRecord;
  return {
    id: doc.id,
    title: doc.title,
    hint: doc.hint,
    startingHp: doc.startingHp,
    ink: doc.ink,
    seed: doc.seed,
    hero: doc.hero,
    monsters: doc.monsters,
    map: doc.map,
    cells: doc.cells,
  };
}

/** Parse one action from untrusted JSON. Throws PlayInputError with a field path on any fault. */
export function parseAction(raw: unknown, index: number): Action {
  const path = `actions[${index}]`;
  if (!isRecord(raw)) throw new PlayInputError(`${path} must be an object.`);
  const kind = raw['kind'];
  if (kind === 'move') {
    const dir = raw['dir'];
    if (typeof dir !== 'string' || !DIRECTIONS.includes(dir)) {
      throw new PlayInputError(`${path}.dir must be one of N, S, E, W.`);
    }
    return { kind: 'move', dir: dir as Direction };
  }
  if (kind === 'wait') return { kind: 'wait' };
  if (kind === 'edit') {
    const address = raw['address'];
    const text = raw['raw'];
    if (typeof address !== 'string' || address === '') throw new PlayInputError(`${path}.address must be a non-empty string.`);
    if (typeof text !== 'string') throw new PlayInputError(`${path}.raw must be a string.`);
    return { kind: 'edit', address, raw: text };
  }
  if (kind === 'undo') return { kind: 'undo' };
  throw new PlayInputError(`${path}.kind must be "move", "wait", "edit" or "undo".`);
}

/**
 * Parse an action list. Accepts a bare JSON array of actions, or a solution-file object
 * `{ actions: [...] }` (the shape of tests/solutions/*.json). Throws PlayInputError on any fault.
 */
export function parseActions(value: unknown): Action[] {
  const list = isRecord(value) && Array.isArray(value['actions']) ? (value['actions'] as unknown[]) : value;
  if (!Array.isArray(list)) {
    throw new PlayInputError('Actions must be a JSON array, or an object with an "actions" array.');
  }
  return list.map((entry, index) => parseAction(entry, index));
}

/** Parse an action list from JSON text. Throws PlayInputError on invalid JSON or a bad shape. */
export function parseActionsText(text: string): Action[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown failure';
    throw new PlayInputError(`Actions are not valid JSON: ${reason}`);
  }
  return parseActions(value);
}

function viewOf(state: RunState): StateView {
  return {
    hero: state.hero,
    hp: state.hp,
    ink: state.ink,
    turn: state.turn,
    status: state.status,
    monsters: state.monsters.map((m) => ({ id: m.id, at: m.at })),
  };
}

/** Every non-empty cell, in reading order. */
export function dumpSheet(state: RunState): CellDump[] {
  const out: CellDump[] = [];
  for (const address of ADDRESSES) {
    const value = cellValue(state, address);
    const raw = cellRawText(state, address) ?? '';
    if (value === undefined) continue;
    const kind = value.kind;
    const text = formatCellValue(value);
    // "Non-empty" means the cell holds something: a non-empty raw text, or a value other than the empty string.
    const empty = raw === '' && kind === 'string' && text === '';
    if (empty) continue;
    out.push({
      address,
      raw,
      value: text,
      valueKind: kind,
      locked: isCellLocked(state, address) === true,
      name: cellName(state, address) ?? null,
    });
  }
  return out;
}

function formatCellValue(value: { kind: string } & Record<string, unknown>): string {
  switch (value.kind) {
    case 'number':
      return String(value['value']);
    case 'string':
      return String(value['value']);
    case 'boolean':
      return value['value'] === true ? 'TRUE' : 'FALSE';
    case 'error':
      return String(value['error']);
    case 'rule':
      return String(value['text']);
    default:
      return '';
  }
}

/**
 * Play a level with an action list. Never throws for a refused action: it is reported with its reason.
 * Throws PlayInputError only when the level cannot be started (a bad document).
 */
export function play(id: string, actions: readonly Action[]): PlayReport {
  const doc = levelById(id);
  const started = startRun(doc);
  if (!started.ok) {
    const detail = started.errors.map((e) => `${e.path}: ${e.code}: ${e.message}`).join('; ');
    throw new PlayInputError(`Level "${id}" did not start: ${detail}`);
  }
  let state = started.state;
  const start = viewOf(state);
  const steps: StepReport[] = [];
  let refusedAt: number | undefined;
  for (const [index, action] of actions.entries()) {
    const result = applyAction(state, action);
    if (result.ok) {
      state = result.state;
      steps.push({
        index,
        action,
        accepted: true,
        damage: result.damage,
        hero: state.hero,
        hp: state.hp,
        ink: state.ink,
        turn: state.turn,
        status: state.status,
      });
    } else {
      steps.push({
        index,
        action,
        accepted: false,
        reason: result.reason,
        message: result.message,
        damage: [],
        hero: state.hero,
        hp: state.hp,
        ink: state.ink,
        turn: state.turn,
        status: state.status,
      });
      if (refusedAt === undefined) refusedAt = index;
    }
  }
  return { levelId: id, start, steps, refusedAt, final: viewOf(state), sheet: dumpSheet(state) };
}
