import { describeError, getValueByAddress, parseAddress } from '../engine/index';
import type { Value } from '../engine/index';
import { loadLevel } from '../model/index';
import { createRandom, seedOf } from './random';
import { currentRaw, isLocked, levelIndex, makeSheet, makeState, recalc, sheetOf } from './state';
import type { RunState, StartRunResult } from './types';

const INTERNAL_FAULT = 'The run could not be started because of an internal fault.';

/**
 * Loads a Level_Document and builds the first Run_State. Never throws.
 * Load_Errors from the model are passed through unchanged.
 */
export function startRun(doc: unknown): StartRunResult {
  try {
    const seed = seedOf(doc);
    const gen = createRandom(seed);
    const loaded = loadLevel(doc, () => gen.next());
    if (!loaded.ok) return { ok: false, errors: loaded.errors };
    const level = loaded.level;
    const afterLoad = gen.state;
    // The loader's own Sheet is dropped; one construction path serves every Run_State.
    const sheet = makeSheet(level, []);
    if (sheet === undefined || !recalc(sheet, level.hero.at, createRandom(0, seed))) {
      throw new Error('sheet');
    }
    const state = makeState(
      {
        level,
        edits: [],
        hero: level.hero.at,
        monsters: level.monsters,
        hp: level.startingHp,
        ink: level.ink,
        turn: 0,
        status: 'playing',
        rngState: afterLoad,
        valuesHero: level.hero.at,
        valuesRngState: seed,
        undoSnapshot: null,
      },
      sheet,
    );
    return { ok: true, state };
  } catch {
    return { ok: false, errors: [{ path: '', code: 'internal-error', message: INTERNAL_FAULT }] };
  }
}

function canonical(address: unknown): string | undefined {
  if (typeof address !== 'string') return undefined;
  const parsed = parseAddress(address);
  return parsed.ok ? parsed.canonical : undefined;
}

/** The Value of a Cell, or undefined for a bad Address or a state this module did not make. */
export function cellValue(state: RunState, address: string): Value | undefined {
  try {
    const sheet = sheetOf(state);
    const key = canonical(address);
    if (sheet === undefined || key === undefined) return undefined;
    const read = getValueByAddress(sheet, key);
    return read.ok ? read.value : undefined;
  } catch {
    return undefined;
  }
}

/** The raw text a Cell holds now (Level text, then the Edit_Record), or undefined. */
export function cellRawText(state: RunState, address: string): string | undefined {
  try {
    const key = canonical(address);
    return key === undefined ? undefined : currentRaw(state, key);
  } catch {
    return undefined;
  }
}

export function isCellLocked(state: RunState, address: string): boolean | undefined {
  try {
    const key = canonical(address);
    return key === undefined ? undefined : isLocked(state.level, key);
  } catch {
    return undefined;
  }
}

/** The Cell_Name of a Cell, or undefined when it has none. */
export function cellName(state: RunState, address: string): string | undefined {
  try {
    const key = canonical(address);
    return key === undefined ? undefined : levelIndex(state.level).get(key)?.name;
  } catch {
    return undefined;
  }
}

/** Plain-English cause of an error Cell, or undefined when the Value is not an error. */
export function describeCellError(state: RunState, address: string): string | undefined {
  try {
    const sheet = sheetOf(state);
    const key = canonical(address);
    if (sheet === undefined || key === undefined) return undefined;
    const result = describeError(sheet, { address: key });
    return result.ok && result.description !== null ? result.description.cause : undefined;
  } catch {
    return undefined;
  }
}

export function isPlaying(state: RunState): boolean {
  try {
    return sheetOf(state) !== undefined && state.status === 'playing';
  } catch {
    return false;
  }
}

/** True while the run is playing and the last Turn_Action can be undone. */
export function canUndo(state: RunState): boolean {
  try {
    return isPlaying(state) && state.undoSnapshot !== null;
  } catch {
    return false;
  }
}
