import { formatAddress, parseAddress, readingIndex } from './address';
import type { GridPoint } from './address';
import { validateContext } from './context';
import type { ContextField, EvaluationContext } from './context';
import { makeError } from './errors';
import { evaluateAst } from './evaluator';
import type { CellView } from './evaluator';
import { getSheetState } from './sheet';
import type { CellRecord, CellTarget, Sheet, SheetState } from './sheet';
import type { ErrorKind, Value } from './values';

export type EvaluateCellResult =
  | {
      readonly ok: true;
      readonly value: Value;
      readonly source: 'evaluated' | 'stored';
      readonly stale: boolean;
    }
  | { readonly ok: false; readonly error: { readonly kind: 'cell-not-found' } }
  | { readonly ok: false; readonly error: { readonly kind: 'internal-error' } }
  | {
      readonly ok: false;
      readonly error: { readonly kind: 'invalid-context'; readonly field: ContextField };
    };

export type ErrorDescription = {
  readonly kind: ErrorKind;
  readonly cause: string;
  readonly origin: string;
};

export type DescribeErrorResult =
  | { readonly ok: true; readonly description: ErrorDescription | null }
  | { readonly ok: false; readonly error: { readonly kind: 'cell-not-found' } }
  | { readonly ok: false; readonly error: { readonly kind: 'internal-error' } };

function pointOfIndex(index: number): GridPoint {
  return { col: (index % 12) + 1, row: Math.floor(index / 12) + 1 };
}

function addressOfIndex(index: number): string {
  return formatAddress(pointOfIndex(index));
}

function findCell(state: SheetState, target: CellTarget): CellRecord | undefined {
  if (typeof target !== 'object' || target === null) return undefined;
  if ('address' in target) {
    if (typeof target.address !== 'string') return undefined;
    const parsed = parseAddress(target.address);
    return parsed.ok ? state.cells[readingIndex(parsed.point)] : undefined;
  }
  if ('name' in target && typeof target.name === 'string') {
    const index = state.names.get(target.name.toUpperCase());
    return index === undefined ? undefined : state.cells[index];
  }
  return undefined;
}

const NOT_FOUND = { ok: false, error: { kind: 'cell-not-found' } } as const;
const INTERNAL = { ok: false, error: { kind: 'internal-error' } } as const;

/** Per_Monster_Evaluation. Stores nothing. Never throws. */
export function evaluateCell(
  sheet: Sheet,
  target: CellTarget,
  ctx: EvaluationContext,
): EvaluateCellResult {
  try {
    const state = getSheetState(sheet);
    const cell = state === undefined ? undefined : findCell(state, target);
    if (state === undefined || cell === undefined) return NOT_FOUND;

    const stale = state.dirty;
    if (cell.ast === null || !cell.isRule || cell.onCycle) {
      return { ok: true, value: cell.value, source: 'stored', stale };
    }

    const checked = validateContext(ctx);
    if (!checked.ok) {
      return { ok: false, error: { kind: 'invalid-context', field: checked.field } };
    }

    const cellAt = (p: GridPoint): CellView => {
      const other = state.cells[readingIndex(p)];
      if (other === undefined) {
        // Unreachable for a Sheet from createSheet (always 240 records); defensive only.
        const missing = formatAddress(p);
        return {
          empty: false,
          name: null,
          value: makeError(
            '#REF!',
            addressOfIndex(cell.index),
            `refers to ${missing}, which has no cell record`,
          ),
        };
      }
      return { empty: other.raw === '', name: other.name, value: other.value };
    };
    const resolveName = (upper: string): GridPoint | undefined => {
      const index = state.names.get(upper);
      return index === undefined ? undefined : pointOfIndex(index);
    };

    let value: Value;
    try {
      value = evaluateAst(cell.ast, {
        origin: pointOfIndex(cell.index),
        cellAt,
        resolveName,
        hero: checked.hero,
        self: checked.self,
        random: checked.random,
      });
    } catch {
      value = makeError('#VALUE!', addressOfIndex(cell.index), 'internal error', cell.name);
    }
    return { ok: true, value, source: 'evaluated', stale };
  } catch {
    return INTERNAL;
  }
}

/** Addresses of Cells on a circular reference, reading order, no duplicates. */
export function listCycleCells(sheet: Sheet): string[] {
  const state = getSheetState(sheet);
  if (state === undefined) return [];
  const result: string[] = [];
  for (const cell of state.cells) {
    if (cell.onCycle) result.push(addressOfIndex(cell.index));
  }
  return result;
}

export function describeError(sheet: Sheet, target: CellTarget): DescribeErrorResult {
  try {
    const state = getSheetState(sheet);
    const cell = state === undefined ? undefined : findCell(state, target);
    if (cell === undefined) return NOT_FOUND;
    const v = cell.value;
    if (v.kind !== 'error') return { ok: true, description: null };
    return { ok: true, description: { kind: v.error, cause: v.cause, origin: v.origin } };
  } catch {
    return INTERNAL;
  }
}
