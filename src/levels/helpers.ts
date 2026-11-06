// Shared helper for the level tests. Only test files import it (see the levels design, Decision 16).
// It imports only node:fs and the three layer barrels. It uses no clock and no source of randomness.
import { readFileSync } from 'node:fs';
import { formatValue, parseAddress } from '../engine/index';
import { applyAction, cellRawText, cellValue, createRandom, seedOf, startRun } from '../game/index';
import type { Action, ActionResult, Direction, RunState } from '../game/index';
import { loadLevelText } from '../model/index';
import type { Level } from '../model/index';

/** The five level ids, in order. */
export const LEVEL_IDS: readonly string[] = [
  '01-the-corridor',
  '02-the-chaser',
  '03-the-locked-crypt',
  '04-the-trap-row',
  '05-the-lich',
];

export interface SolutionFile {
  readonly levelId: string;
  readonly minimalInk: number;
  readonly actions: Action[];
}

export interface LoadedLevelFile {
  readonly id: string;
  readonly text: string;
  readonly doc: unknown;
  readonly level: Level;
}

/** `state` is the state after an accepted action, else the state before it. */
export interface ReplayStep {
  readonly index: number;
  readonly action: Action;
  readonly result: ActionResult;
  readonly state: RunState;
}

export interface Replay {
  readonly start: RunState;
  readonly steps: ReplayStep[];
  readonly final: RunState;
  readonly refusedAt: number | undefined;
}

export interface Snapshot {
  readonly hero: string;
  readonly monsters: string[];
  readonly hp: number;
  readonly ink: number;
  readonly turn: number;
  readonly status: string;
  /** cellRawText of all 240 cells in reading order. */
  readonly raws: string[];
  /** Kind letter plus formatValue of all 240 cells in reading order. */
  readonly values: string[];
}

export interface SearchLimits {
  readonly maxDepth: number;
  readonly maxStates: number;
}

export interface SearchResult {
  readonly outcome: 'exhausted' | 'won' | 'limit';
  /** Distinct State_Keys seen. */
  readonly states: number;
  /** Layers expanded; for 'won', the layer in which a win was found. */
  readonly depth: number;
  /** States expanded. */
  readonly expansions: number;
  readonly limit?: 'depth' | 'states';
}

export const DEFAULT_SEARCH_LIMITS: SearchLimits = { maxDepth: 100, maxStates: 1000 };

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** The text of `src/levels/<id>.json`. */
export function readLevelText(id: string): string {
  return readFileSync(new URL(`./${id}.json`, import.meta.url), 'utf8');
}

/** The text of `tests/solutions/<id>.json`. */
export function readSolutionText(id: string): string {
  return readFileSync(new URL(`../../tests/solutions/${id}.json`, import.meta.url), 'utf8');
}

/** Loads a Level_File through the model loader. Throws with every Load_Error printed as `path: code: message`. */
export function loadLevelFile(id: string): LoadedLevelFile {
  const text = readLevelText(id);
  const doc: unknown = JSON.parse(text);
  const generator = createRandom(seedOf(doc));
  const result = loadLevelText(text, () => generator.next());
  if (!result.ok) {
    const lines = result.errors.map((e) => `${e.path}: ${e.code}: ${e.message}`);
    throw new Error(`Level file ${id} did not load:\n${lines.join('\n')}`);
  }
  return { id, text, doc, level: result.level };
}

// ---------------------------------------------------------------------------
// Solution files
// ---------------------------------------------------------------------------

const DIRECTIONS: readonly string[] = ['N', 'S', 'E', 'W'];
const ROOT_KEYS: readonly string[] = ['levelId', 'minimalInk', 'actions'];
const ACTION_KEYS: Readonly<Record<string, readonly string[]>> = {
  move: ['kind', 'dir'],
  wait: ['kind'],
  edit: ['kind', 'address', 'raw'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(path === '' ? message : `${path}: ${message}`);
}

function checkKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail(path, `unexpected key "${key}"`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) fail(path, `missing key "${key}"`);
  }
}

function parseAction(raw: unknown, index: number): Action {
  const path = `actions[${index}]`;
  if (!isRecord(raw)) return fail(path, 'must be an object');
  const kind = raw['kind'];
  if (kind === 'undo') return fail(`${path}.kind`, '"undo" is not allowed in a solution');
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(ACTION_KEYS, kind)) {
    return fail(`${path}.kind`, 'must be "move", "wait" or "edit"');
  }
  checkKeys(raw, ACTION_KEYS[kind] ?? [], path);
  if (kind === 'wait') return { kind: 'wait' };
  if (kind === 'move') {
    const dir = raw['dir'];
    if (typeof dir !== 'string' || !DIRECTIONS.includes(dir)) return fail(`${path}.dir`, 'must be N, S, E or W');
    return { kind: 'move', dir: dir as Direction };
  }
  const address = raw['address'];
  const text = raw['raw'];
  if (typeof address !== 'string' || address === '') return fail(`${path}.address`, 'must be a non-empty string');
  if (typeof text !== 'string') return fail(`${path}.raw`, 'must be a string');
  return { kind: 'edit', address, raw: text };
}

/**
 * Pure: JSON.parse plus the Requirement 9 shape checks. Throws with the first bad field path,
 * for example `actions[3]: unexpected key "foo"`.
 */
export function parseSolution(text: string): SolutionFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown failure';
    return fail('', `solution is not valid JSON: ${reason}`);
  }
  if (!isRecord(value)) return fail('', 'solution must be an object');
  checkKeys(value, ROOT_KEYS, '');
  const levelId = value['levelId'];
  if (typeof levelId !== 'string' || levelId === '') return fail('levelId', 'must be a non-empty string');
  const minimalInk = value['minimalInk'];
  if (typeof minimalInk !== 'number' || !Number.isSafeInteger(minimalInk) || minimalInk < 0) {
    return fail('minimalInk', 'must be a whole number of 0 or more');
  }
  const rawActions = value['actions'];
  if (!Array.isArray(rawActions) || rawActions.length === 0) return fail('actions', 'must be a non-empty array');
  const actions = (rawActions as unknown[]).map((entry, index) => parseAction(entry, index));
  const edits = actions.filter((a) => a.kind === 'edit').length;
  if (edits !== minimalInk) {
    return fail('minimalInk', `is ${minimalInk}, but the actions hold ${edits} edit action(s)`);
  }
  return { levelId, minimalInk, actions };
}

/** `parseSolution` around the text of `tests/solutions/<id>.json`. */
export function readSolution(id: string): SolutionFile {
  return parseSolution(readSolutionText(id));
}

// ---------------------------------------------------------------------------
// Replay and snapshots
// ---------------------------------------------------------------------------

function describeLoadErrors(errors: readonly { path: string; code: string; message: string }[]): string {
  return errors.map((e) => `${e.path}: ${e.code}: ${e.message}`).join('\n');
}

/**
 * `startRun`, then `applyAction` per action. Stops at the first refusal, records it in `steps`
 * and sets `refusedAt`; later actions are not applied. Throws only when `startRun` refuses the document.
 */
export function replay(doc: unknown, actions: readonly Action[]): Replay {
  const started = startRun(doc);
  if (!started.ok) throw new Error(`startRun refused the document:\n${describeLoadErrors(started.errors)}`);
  const steps: ReplayStep[] = [];
  let state = started.state;
  let refusedAt: number | undefined;
  for (const [index, action] of actions.entries()) {
    const result = applyAction(state, action);
    if (!result.ok) {
      steps.push({ index, action, result, state });
      refusedAt = index;
      break;
    }
    state = result.state;
    steps.push({ index, action, result, state });
  }
  return { start: started.state, steps, final: state, refusedAt };
}

const COLUMN_LETTERS = 'ABCDEFGHIJKL';

/** The 240 addresses in reading order: A1, B1, ... L1, A2, ... L20. */
const ADDRESSES: readonly string[] = (() => {
  const out: string[] = [];
  for (let row = 1; row <= 20; row += 1) {
    for (const letter of COLUMN_LETTERS) out.push(`${letter}${row}`);
  }
  return out;
})();

function valueText(state: RunState, address: string): string {
  const value = cellValue(state, address);
  return value === undefined ? '-' : `${value.kind.charAt(0)}${formatValue(value)}`;
}

function monsterTexts(state: RunState): string[] {
  return state.monsters.map((m) => `${m.id}@${m.at}`);
}

/** Everything the determinism check compares, read through the public API only. */
export function finalSnapshot(state: RunState): Snapshot {
  return {
    hero: state.hero,
    monsters: monsterTexts(state),
    hp: state.hp,
    ink: state.ink,
    turn: state.turn,
    status: state.status,
    raws: ADDRESSES.map((a) => cellRawText(state, a) ?? '-'),
    values: ADDRESSES.map((a) => valueText(state, a)),
  };
}

/**
 * The exact State_Key text (Decision 18, not a hash): hero, monsters, hp, ink, status and the
 * 240 cell entries, joined with `|`. `turn` is left out because nothing reads it.
 */
export function stateKey(state: RunState): string {
  const head = [state.hero, monsterTexts(state).join(','), String(state.hp), String(state.ink), state.status];
  return [...head, ...ADDRESSES.map((a) => valueText(state, a))].join('|');
}

// ---------------------------------------------------------------------------
// Edit-free search
// ---------------------------------------------------------------------------

const EDIT_FREE_ACTIONS: readonly Action[] = [
  { kind: 'move', dir: 'N' },
  { kind: 'move', dir: 'S' },
  { kind: 'move', dir: 'E' },
  { kind: 'move', dir: 'W' },
  { kind: 'wait' },
];

/**
 * Breadth-first search over move N/S/E/W and wait, with no edits. Refusals are skipped, a won
 * state ends the search, a lost state is counted but never expanded. Throws if the document
 * does not start.
 */
export function searchEditFree(doc: unknown, limits: SearchLimits = DEFAULT_SEARCH_LIMITS): SearchResult {
  const started = startRun(doc);
  if (!started.ok) throw new Error(`startRun refused the document:\n${describeLoadErrors(started.errors)}`);
  const seen = new Set<string>([stateKey(started.state)]);
  let frontier: RunState[] = [started.state];
  let depth = 0;
  let expansions = 0;
  while (frontier.length > 0) {
    if (depth >= limits.maxDepth) {
      return { outcome: 'limit', limit: 'depth', states: seen.size, depth, expansions };
    }
    const next: RunState[] = [];
    for (const state of frontier) {
      if (state.status !== 'playing') continue;
      expansions += 1;
      for (const action of EDIT_FREE_ACTIONS) {
        const result = applyAction(state, action);
        if (!result.ok) continue;
        if (result.state.status === 'won') {
          return { outcome: 'won', states: seen.size, depth: depth + 1, expansions };
        }
        const key = stateKey(result.state);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > limits.maxStates) {
          return { outcome: 'limit', limit: 'states', states: seen.size, depth, expansions };
        }
        next.push(result.state);
      }
    }
    frontier = next;
    depth += 1;
  }
  return { outcome: 'exhausted', states: seen.size, depth, expansions };
}

/** The message a test prints when the search stops at a limit. */
export function describeLimit(
  result: SearchResult,
  levelId: string,
  limits: SearchLimits = DEFAULT_SEARCH_LIMITS,
): string {
  return (
    `Edit-free search of ${levelId} is inconclusive: stopped at the ${result.limit ?? 'unknown'} limit ` +
    `after ${result.states} states and ${result.depth} layers ` +
    `(limits: ${limits.maxDepth} turns, ${limits.maxStates} states).\n` +
    'Shrink the walkable area of the level before raising a limit.'
  );
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

/** Map_Area cells (rows 1 to 12) whose Value is the string `.`, `X` or `^`. */
export function walkableCount(state: RunState): number {
  let count = 0;
  for (const address of ADDRESSES.slice(0, 144)) {
    const value = cellValue(state, address);
    if (value !== undefined && value.kind === 'string' && '.X^'.includes(value.value) && value.value.length === 1) {
      count += 1;
    }
  }
  return count;
}

/** Manhattan distance between two Addresses. Throws on a bad Address. */
export function manhattan(a: string, b: string): number {
  const from = parseAddress(a);
  const to = parseAddress(b);
  if (!from.ok) throw new Error(`bad address ${a}`);
  if (!to.ok) throw new Error(`bad address ${b}`);
  return Math.abs(from.point.col - to.point.col) + Math.abs(from.point.row - to.point.row);
}

/** The 12 by 12 map as text, with `@` for the hero and `M` for each monster, for failure messages. */
export function boardText(state: RunState): string {
  const monsterAt = new Set(state.monsters.map((m) => m.at));
  const lines = [`    ${COLUMN_LETTERS}`];
  for (let row = 1; row <= 12; row += 1) {
    let line = '';
    for (const letter of COLUMN_LETTERS) {
      const address = `${letter}${row}`;
      if (address === state.hero) {
        line += '@';
      } else if (monsterAt.has(address)) {
        line += 'M';
      } else {
        const value = cellValue(state, address);
        line += value !== undefined && value.kind === 'string' && value.value.length === 1 ? value.value : '?';
      }
    }
    lines.push(`${String(row).padStart(2)}  ${line}`);
  }
  lines.push(`hp ${state.hp}, ink ${state.ink}, turn ${state.turn}, ${state.status}`);
  return lines.join('\n');
}

function describeAction(action: Action): string {
  switch (action.kind) {
    case 'move':
      return `move ${action.dir}`;
    case 'wait':
      return 'wait';
    case 'edit':
      return `edit ${action.address} ${action.raw}`;
    case 'undo':
      return 'undo';
  }
}

/** One line for a replay step, with the board after a refusal. */
export function describeStep(levelId: string, step: ReplayStep): string {
  const head = `${levelId} action ${step.index + 1} (${describeAction(step.action)})`;
  if (step.result.ok) {
    return `${head}: accepted (hp ${step.state.hp}, ink ${step.state.ink}, status ${step.state.status})`;
  }
  return `${head}: refused (${step.result.reason}: ${step.result.message})\n${boardText(step.state)}`;
}
