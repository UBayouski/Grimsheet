import { formatAddress, isInSheet, readingIndex, SHEET_CELL_COUNT } from './address';
import type { GridPoint } from './address';
import { validateContext } from './context';
import type { ContextField, EvaluationContext } from './context';
import { makeError } from './errors';
import { evaluateAst } from './evaluator';
import type { CellView } from './evaluator';
import { buildGraph, circularComponents, topologicalOrder } from './graph';
import { commitRecalculation, getSheetState } from './sheet';
import type { Sheet } from './sheet';
import { numberValue, ruleValue, stringValue } from './values';
import type { Value } from './values';

export type RecalculateResult =
  | { readonly accepted: true; readonly cycleCells: readonly string[] }
  | {
      readonly accepted: false;
      readonly error: { readonly kind: 'invalid-context'; readonly field: ContextField };
    }
  | { readonly accepted: false; readonly error: { readonly kind: 'internal-error' } };

const NUMERIC_LITERAL = /^[+-]?\d+(\.\d+)?$/;

function addressOfIndex(index: number): string {
  return formatAddress({ col: (index % 12) + 1, row: Math.floor(index / 12) + 1 });
}

function pointOfIndex(index: number): GridPoint {
  return { col: (index % 12) + 1, row: Math.floor(index / 12) + 1 };
}

function classifyLiteral(raw: string): Value {
  if (raw === '') return stringValue('');
  if (NUMERIC_LITERAL.test(raw)) {
    const n = Number(raw);
    // Normalise -0 to 0 so literals match evaluated results.
    if (Number.isFinite(n)) return numberValue(n === 0 ? 0 : n);
  }
  return stringValue(raw);
}

/** Cause text from the Cell's own strongly connected component (members ascending). */
function cycleCause(component: readonly number[], index: number): string {
  const others = component.filter((other) => other !== index);
  if (others.length === 0) return 'refers to itself';
  return `is on a circular reference with ${others.map(addressOfIndex).join(', ')}`;
}

/** Full from-scratch recalculation. Never throws: an internal fault is a refused `internal-error` result. */
export function recalculate(sheet: Sheet, ctx: EvaluationContext): RecalculateResult {
  try {
    return recalculateUnguarded(sheet, ctx);
  } catch {
    return { accepted: false, error: { kind: 'internal-error' } };
  }
}

function recalculateUnguarded(sheet: Sheet, ctx: EvaluationContext): RecalculateResult {
  const checked = validateContext(ctx);
  if (!checked.ok) return { accepted: false, error: { kind: 'invalid-context', field: checked.field } };
  const state = getSheetState(sheet);
  if (state === undefined) return { accepted: true, cycleCells: [] };

  const { hero, random } = checked;
  const heroIndex = isInSheet(hero) ? readingIndex(hero) : undefined;
  const resolveIndex = (upper: string): number | undefined => state.names.get(upper);

  const graph = buildGraph(
    state.cells.map((c) => ({ index: c.index, ast: c.ast, isRule: c.isRule })),
    resolveIndex,
    heroIndex,
  );
  const components = circularComponents(graph);
  const componentOfCell = new Map<number, readonly number[]>();
  for (const component of components) {
    for (const member of component) componentOfCell.set(member, component);
  }
  const cycleList = [...componentOfCell.keys()].sort((a, b) => a - b);
  const cycle = new Set(cycleList);
  const order = topologicalOrder(graph);

  const empty = stringValue('');
  const values: Value[] = new Array<Value>(SHEET_CELL_COUNT).fill(empty);

  const cellAt = (p: GridPoint): CellView => {
    const idx = readingIndex(p);
    const cell = state.cells[idx];
    return {
      empty: cell === undefined || cell.raw === '',
      name: cell?.name ?? null,
      value: values[idx] ?? empty,
    };
  };
  const resolveName = (upper: string): GridPoint | undefined => {
    const idx = resolveIndex(upper);
    return idx === undefined ? undefined : pointOfIndex(idx);
  };

  for (const index of order) {
    const cell = state.cells[index];
    if (cell === undefined) continue;
    let value: Value;
    if (cell.raw === '') {
      value = empty;
    } else if (cycle.has(index)) {
      value = makeError(
        '#CYCLE!',
        addressOfIndex(index),
        cycleCause(componentOfCell.get(index) ?? [], index),
        cell.name,
      );
    } else if (cell.ast === null) {
      value = classifyLiteral(cell.raw);
    } else if (cell.isRule) {
      value = ruleValue(cell.raw);
    } else {
      try {
        value = evaluateAst(cell.ast, {
          origin: pointOfIndex(index),
          cellAt,
          resolveName,
          hero,
          self: undefined,
          random,
        });
      } catch {
        value = makeError('#VALUE!', addressOfIndex(index), 'internal error', cell.name);
      }
    }
    values[index] = value;
  }

  commitRecalculation(
    sheet,
    values,
    values.map((_, i) => cycle.has(i)),
  );
  return { accepted: true, cycleCells: cycleList.map(addressOfIndex) };
}
