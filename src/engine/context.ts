import type { GridPoint } from './address';

export interface EvaluationContext {
  readonly heroAddress: GridPoint; // required; may lie outside the Sheet
  readonly selfAddress?: GridPoint; // optional; only used by evaluateCell
  readonly random: () => number; // required; returns a number in [0, 1)
}

export type ContextField = 'heroAddress' | 'random';

/** Read `holder[key]`; a throwing getter or Proxy trap yields `undefined` (an invalid field). */
function safeGet(holder: unknown, key: string): unknown {
  try {
    return (holder as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function readPoint(value: unknown): GridPoint | undefined {
  try {
    if (typeof value !== 'object' || value === null) return undefined;
    const col = safeGet(value, 'col');
    const row = safeGet(value, 'row');
    if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row)) return undefined;
    return { col: col as number, row: row as number };
  } catch {
    return undefined;
  }
}

/**
 * Runtime check for plain-JavaScript callers. `heroAddress` needs safe-integer `col` and `row`,
 * `random` must be a function. A malformed `selfAddress` counts as absent; an out-of-sheet one is kept.
 * Total: every property read is guarded, so a throwing getter or Proxy trap marks that field invalid.
 */
export function validateContext(
  ctx: unknown,
):
  | { ok: true; hero: GridPoint; self: GridPoint | undefined; random: () => number }
  | { ok: false; field: ContextField } {
  try {
    if (typeof ctx !== 'object' || ctx === null) return { ok: false, field: 'heroAddress' };
    const hero = readPoint(safeGet(ctx, 'heroAddress'));
    if (hero === undefined) return { ok: false, field: 'heroAddress' };
    const random = safeGet(ctx, 'random');
    if (typeof random !== 'function') return { ok: false, field: 'random' };
    return { ok: true, hero, self: readPoint(safeGet(ctx, 'selfAddress')), random: random as () => number };
  } catch {
    return { ok: false, field: 'heroAddress' };
  }
}
