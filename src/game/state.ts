import {
  createSheet,
  formatAddress,
  parseAddress,
  recalculate,
  setCellName,
  setRawText,
} from '../engine/index';
import type { GridPoint, Sheet } from '../engine/index';
import type { Level } from '../model/index';
import { MAX_DAMAGE } from './types';
import type { Direction, EditRecordEntry, RandomGenerator, RunState, UndoSnapshot } from './types';

const COLUMN_LETTERS = 'ABCDEFGHIJKL';
const MAP_ROWS = 12;
const MAP_COLUMNS = 12;

// ---------------------------------------------------------------------------
// Sheet registry
// ---------------------------------------------------------------------------

const registry = new WeakMap<RunState, Sheet>();

/** The Sheet behind a Run_State made by this module, else undefined. */
export function sheetOf(state: RunState): Sheet | undefined {
  return registry.get(state);
}

/**
 * Builds a fresh Sheet the way the model loader does: map characters, every Cell_Spec,
 * the names, then the Edit_Record in order. Returns undefined when the engine refuses a call.
 * The Sheet is not recalculated.
 */
export function makeSheet(level: Level, edits: readonly EditRecordEntry[]): Sheet | undefined {
  const sheet = createSheet();
  for (let r = 0; r < MAP_ROWS; r += 1) {
    const chars = Array.from(level.map[r] ?? '');
    for (let c = 0; c < MAP_COLUMNS; c += 1) {
      const address = `${COLUMN_LETTERS.charAt(c)}${r + 1}`;
      if (!setRawText(sheet, address, chars[c] ?? '.').accepted) return undefined;
    }
  }
  for (const spec of level.cells) {
    if (!setRawText(sheet, spec.address, spec.raw).accepted) return undefined;
  }
  for (const spec of level.cells) {
    if (spec.name !== undefined && !setCellName(sheet, spec.address, spec.name).accepted) return undefined;
  }
  for (const edit of edits) {
    if (!setRawText(sheet, edit.address, edit.raw).accepted) return undefined;
  }
  return sheet;
}

/** Full recalculation with the hero at `heroAddress`; draws from `gen`. Returns false when refused. */
export function recalc(sheet: Sheet, heroAddress: string, gen: RandomGenerator): boolean {
  const parsed = parseAddress(heroAddress);
  if (!parsed.ok) return false;
  return recalculate(sheet, { heroAddress: parsed.point, random: () => gen.next() }).accepted;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Deep-freezes the new Run_State, its arrays and its snapshot, and registers the Sheet.
 * The Level is already deep-frozen by the loader, so freezing stops there.
 */
export function makeState(fields: RunState, sheet: Sheet): RunState {
  const state: RunState = {
    ...fields,
    edits: fields.edits.map((e) => ({ address: e.address, raw: e.raw })),
    monsters: fields.monsters.map((m) => ({ id: m.id, at: m.at, move: m.move, atk: m.atk })),
    undoSnapshot: fields.undoSnapshot === null ? null : copySnapshot(fields.undoSnapshot),
  };
  deepFreeze(state);
  registry.set(state, sheet);
  return state;
}

function copySnapshot(s: UndoSnapshot): UndoSnapshot {
  return {
    edits: s.edits.map((e) => ({ address: e.address, raw: e.raw })),
    hero: s.hero,
    monsters: s.monsters.map((m) => ({ id: m.id, at: m.at, move: m.move, atk: m.atk })),
    hp: s.hp,
    ink: s.ink,
    turn: s.turn,
    status: s.status,
    rngState: s.rngState,
    valuesHero: s.valuesHero,
    valuesRngState: s.valuesRngState,
  };
}

// ---------------------------------------------------------------------------
// Level lookups
// ---------------------------------------------------------------------------

export interface LevelCell {
  readonly raw: string;
  readonly locked: boolean;
  readonly name: string | undefined;
}

const indexes = new WeakMap<Level, ReadonlyMap<string, LevelCell>>();

/** Raw text, lock flag and name per canonical Address: map characters, overridden by Cell_Specs. */
export function levelIndex(level: Level): ReadonlyMap<string, LevelCell> {
  const cached = indexes.get(level);
  if (cached !== undefined) return cached;
  const index = new Map<string, LevelCell>();
  for (let r = 0; r < MAP_ROWS; r += 1) {
    const chars = Array.from(level.map[r] ?? '');
    for (let c = 0; c < MAP_COLUMNS; c += 1) {
      index.set(`${COLUMN_LETTERS.charAt(c)}${r + 1}`, {
        raw: chars[c] ?? '.',
        locked: false,
        name: undefined,
      });
    }
  }
  for (const spec of level.cells) {
    const address = parseAddress(spec.address);
    const key = address.ok ? address.canonical : spec.address;
    index.set(key, { raw: spec.raw, locked: spec.locked === true, name: spec.name });
  }
  indexes.set(level, index);
  return index;
}

export function effectiveRaw(level: Level, address: string): string {
  return levelIndex(level).get(address)?.raw ?? '';
}

/** The latest edit for the canonical address, else the Level's text. */
export function currentRaw(state: RunState, address: string): string {
  for (let i = state.edits.length - 1; i >= 0; i -= 1) {
    const edit = state.edits[i];
    if (edit !== undefined && edit.address === address) return edit.raw;
  }
  return effectiveRaw(state.level, address);
}

export function isLocked(level: Level, address: string): boolean {
  return levelIndex(level).get(address)?.locked ?? false;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/** Floors a rule number; 0 when it is not damage, else a whole amount in 1..MAX_DAMAGE. */
export function wholeDamage(n: number): number {
  const f = Math.floor(n);
  return f >= 1 ? Math.min(f, MAX_DAMAGE) : 0;
}

// ---------------------------------------------------------------------------
// Addresses and Reading_Order
// ---------------------------------------------------------------------------

/** True for columns A to L and rows 1 to 12. */
export function inMap(p: GridPoint): boolean {
  return Number.isInteger(p.col) && Number.isInteger(p.row) && p.col >= 1 && p.col <= MAP_COLUMNS && p.row >= 1 && p.row <= MAP_ROWS;
}

/** Canonical address to point; undefined when it does not parse. */
export function point(address: string): GridPoint | undefined {
  const parsed = parseAddress(address);
  return parsed.ok ? parsed.point : undefined;
}

/** The adjacent map Address in `dir`, or undefined when it falls off the map (or `address` is invalid). */
export function neighbour(address: string, dir: Direction): string | undefined {
  const p = point(address);
  if (p === undefined) return undefined;
  const target: GridPoint = {
    col: p.col + (dir === 'E' ? 1 : dir === 'W' ? -1 : 0),
    row: p.row + (dir === 'S' ? 1 : dir === 'N' ? -1 : 0),
  };
  return inMap(target) ? formatAddress(target) : undefined;
}

/** Indices of `addresses` sorted by row, then column. */
export function readingOrder(addresses: readonly string[]): number[] {
  const keyed = addresses.map((a, i) => {
    const p = point(a);
    return { i, row: p?.row ?? Infinity, col: p?.col ?? Infinity };
  });
  keyed.sort((x, y) => x.row - y.row || x.col - y.col || x.i - y.i);
  return keyed.map((k) => k.i);
}
