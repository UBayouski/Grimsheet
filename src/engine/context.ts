import type { GridPoint } from './address';

export interface EvaluationContext {
  readonly heroAddress: GridPoint; // required; may lie outside the Sheet
  readonly selfAddress?: GridPoint; // optional; only used by evaluateCell
  readonly random: () => number; // required; returns a number in [0, 1)
}

export type ContextField = 'heroAddress' | 'random';

function readPoint(value: unknown): GridPoint | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { col, row } = value as { col?: unknown; row?: unknown };
  if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row)) return undefined;
  return { col: col as number, row: row as number };
}

/**
 * Runtime check for plain-JavaScript callers. `heroAddress` needs safe-integer `col` and `row`,
 * `random` must be a function. A malformed `selfAddress` counts as absent; an out-of-sheet one is kept.
 */
export function validateContext(
  ctx: unknown,
):
  | { ok: true; hero: GridPoint; self: GridPoint | undefined; random: () => number }
  | { ok: false; field: ContextField } {
  if (typeof ctx !== 'object' || ctx === null) return { ok: false, field: 'heroAddress' };
  const fields = ctx as { heroAddress?: unknown; selfAddress?: unknown; random?: unknown };
  const hero = readPoint(fields.heroAddress);
  if (hero === undefined) return { ok: false, field: 'heroAddress' };
  if (typeof fields.random !== 'function') return { ok: false, field: 'random' };
  const random = fields.random as () => number;
  return { ok: true, hero, self: readPoint(fields.selfAddress), random };
}
