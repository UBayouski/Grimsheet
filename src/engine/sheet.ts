import { parseAddress, readingIndex, SHEET_CELL_COUNT } from './address';
import { isRuleAst } from './ast';
import type { Node } from './ast';
import { validateCellName } from './names';
import type { NameCheckFailure } from './names';
import { parseFormula } from './parser';
import { printFormula } from './printer';
import type { ParseError } from './tokenizer';
import { stringValue } from './values';
import type { Value } from './values';

declare const sheetBrand: unique symbol;

/** Opaque Sheet handle. Internals are reachable only through `getSheetState`. */
export interface Sheet {
  readonly [sheetBrand]: true;
}

export type CellTarget = { readonly address: string } | { readonly name: string };

export interface CellRecord {
  readonly index: number; // 0..239 reading order
  raw: string; // "" means empty
  name: string | null; // canonical upper case, unique in the Sheet
  ast: Node | null; // null for Literals and empty Cells
  isRule: boolean;
  value: Value;
  onCycle: boolean;
}

export interface SheetState {
  readonly cells: CellRecord[];
  readonly names: Map<string, number>;
  dirty: boolean;
}

export type SetRawTextResult =
  | {
      readonly accepted: true;
      readonly address: string;
      readonly kind: 'formula' | 'literal';
      readonly canonicalText: string | null;
    }
  | { readonly accepted: false; readonly error: { readonly kind: 'invalid-address' } }
  | { readonly accepted: false; readonly error: { readonly kind: 'internal-error' } }
  | {
      readonly accepted: false;
      readonly error: { readonly kind: 'parse-error'; readonly parseError: ParseError };
    };

export type SetNameResult =
  | { readonly accepted: true; readonly address: string; readonly name: string | null }
  | {
      readonly accepted: false;
      readonly error:
        | { readonly kind: 'invalid-address' }
        | { readonly kind: 'internal-error' }
        | { readonly kind: 'invalid-name'; readonly failed: NameCheckFailure }
        | { readonly kind: 'duplicate-name'; readonly name: string; readonly heldBy: string };
    };

export type ReadResult =
  | {
      readonly ok: true;
      readonly address: string;
      readonly name: string | null;
      readonly value: Value;
      readonly stale: boolean;
    }
  | { readonly ok: false; readonly error: { readonly kind: 'cell-not-found' } }
  | { readonly ok: false; readonly error: { readonly kind: 'internal-error' } };

const states = new WeakMap<object, SheetState>();

export function createSheet(): Sheet {
  const cells: CellRecord[] = [];
  for (let index = 0; index < SHEET_CELL_COUNT; index++) {
    cells.push({
      index,
      raw: '',
      name: null,
      ast: null,
      isRule: false,
      value: stringValue(''),
      onCycle: false,
    });
  }
  const sheet = Object.freeze({}) as unknown as Sheet;
  states.set(sheet, { cells, names: new Map(), dirty: false });
  return sheet;
}

/** Internal helper for the recalculator and evaluate-cell. Not part of the public API. */
export function getSheetState(sheet: Sheet): SheetState | undefined {
  return states.get(sheet as unknown as object);
}

/** Internal helper: writes Values, cycle flags and `dirty = false` in one step. */
export function commitRecalculation(
  sheet: Sheet,
  values: readonly Value[],
  cycleFlags: readonly boolean[],
): void {
  const state = getSheetState(sheet);
  if (state === undefined) return;
  if (values.length !== SHEET_CELL_COUNT || cycleFlags.length !== SHEET_CELL_COUNT) return;
  for (let i = 0; i < SHEET_CELL_COUNT; i++) {
    const cell = state.cells[i];
    const value = values[i];
    if (cell === undefined || value === undefined) continue;
    cell.value = value;
    cell.onCycle = cycleFlags[i] === true;
  }
  state.dirty = false;
}

function resolveAddress(
  state: SheetState,
  address: string,
): { canonical: string; cell: CellRecord } | undefined {
  const parsed = parseAddress(address);
  if (!parsed.ok) return undefined;
  const cell = state.cells[readingIndex(parsed.point)];
  return cell === undefined ? undefined : { canonical: parsed.canonical, cell };
}

function addressOfIndex(index: number): string {
  const col = (index % 12) + 1;
  const row = Math.floor(index / 12) + 1;
  return `${String.fromCharCode(64 + col)}${row}`;
}

const INTERNAL_ERROR = { kind: 'internal-error' } as const;

/** Never throws. An internal fault is reported as a refused `internal-error` result. */
export function setRawText(sheet: Sheet, address: string, rawText: string): SetRawTextResult {
  try {
    return setRawTextUnguarded(sheet, address, rawText);
  } catch {
    return { accepted: false, error: INTERNAL_ERROR };
  }
}

function setRawTextUnguarded(sheet: Sheet, address: string, rawText: string): SetRawTextResult {
  const state = getSheetState(sheet);
  const target = state === undefined ? undefined : resolveAddress(state, address);
  if (state === undefined || target === undefined || typeof rawText !== 'string') {
    return { accepted: false, error: { kind: 'invalid-address' } };
  }
  const { canonical, cell } = target;

  if (!rawText.startsWith('=')) {
    cell.raw = rawText;
    cell.ast = null;
    cell.isRule = false;
    state.dirty = true;
    return { accepted: true, address: canonical, kind: 'literal', canonicalText: null };
  }

  const parsed = parseFormula(rawText);
  if (!parsed.ok) {
    return {
      accepted: false,
      error: { kind: 'parse-error', parseError: parsed.error },
    };
  }
  const printed = printFormula(parsed.ast);
  cell.raw = rawText;
  cell.ast = parsed.ast;
  cell.isRule = isRuleAst(parsed.ast);
  state.dirty = true;
  return {
    accepted: true,
    address: canonical,
    kind: 'formula',
    canonicalText: printed.ok ? printed.text : null,
  };
}

/** Pass null to clear the name. A refused call changes nothing. Never throws. */
export function setCellName(sheet: Sheet, address: string, name: string | null): SetNameResult {
  try {
    return setCellNameUnguarded(sheet, address, name);
  } catch {
    return { accepted: false, error: INTERNAL_ERROR };
  }
}

function setCellNameUnguarded(sheet: Sheet, address: string, name: string | null): SetNameResult {
  const state = getSheetState(sheet);
  const target = state === undefined ? undefined : resolveAddress(state, address);
  if (state === undefined || target === undefined) {
    return { accepted: false, error: { kind: 'invalid-address' } };
  }
  const { canonical, cell } = target;

  if (name === null) {
    if (cell.name !== null) {
      state.names.delete(cell.name);
      cell.name = null;
      state.dirty = true;
    }
    return { accepted: true, address: canonical, name: null };
  }

  const checked = validateCellName(name);
  if (!checked.ok) {
    return { accepted: false, error: { kind: 'invalid-name', failed: checked.failed } };
  }
  const holder = state.names.get(checked.canonical);
  if (holder !== undefined && holder !== cell.index) {
    return {
      accepted: false,
      error: {
        kind: 'duplicate-name',
        name: checked.canonical,
        heldBy: addressOfIndex(holder),
      },
    };
  }
  if (cell.name !== checked.canonical) {
    if (cell.name !== null) state.names.delete(cell.name);
    cell.name = checked.canonical;
    state.names.set(checked.canonical, cell.index);
    state.dirty = true;
  }
  return { accepted: true, address: canonical, name: checked.canonical };
}

function readCell(state: SheetState, cell: CellRecord): ReadResult {
  return {
    ok: true,
    address: addressOfIndex(cell.index),
    name: cell.name,
    value: cell.value,
    stale: state.dirty,
  };
}

/** Never throws. An internal fault is reported as `internal-error`, not as a missing Cell. */
export function getValueByAddress(sheet: Sheet, address: string): ReadResult {
  try {
    const state = getSheetState(sheet);
    const target = state === undefined ? undefined : resolveAddress(state, address);
    if (state === undefined || target === undefined) {
      return { ok: false, error: { kind: 'cell-not-found' } };
    }
    return readCell(state, target.cell);
  } catch {
    return { ok: false, error: INTERNAL_ERROR };
  }
}

/** Never throws. An internal fault is reported as `internal-error`, not as a missing Cell. */
export function getValueByName(sheet: Sheet, name: string): ReadResult {
  try {
    const state = getSheetState(sheet);
    if (state === undefined || typeof name !== 'string') {
      return { ok: false, error: { kind: 'cell-not-found' } };
    }
    const index = state.names.get(name.toUpperCase());
    const cell = index === undefined ? undefined : state.cells[index];
    if (cell === undefined) return { ok: false, error: { kind: 'cell-not-found' } };
    return readCell(state, cell);
  } catch {
    return { ok: false, error: INTERNAL_ERROR };
  }
}
