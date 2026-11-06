import type { GridPoint } from './address';

/** How the evaluator must prepare an argument before calling the pure helper. */
export type ArgMode = 'rangeOrValue' | 'number' | 'boolean' | 'lazy' | 'ref';

export interface FunctionSpec {
  readonly name: string;
  readonly min: number;
  /** `null` means no upper bound. */
  readonly max: number | null;
  /** Mode per position; positions past the end use the last mode. Empty for no arguments. */
  readonly modes: readonly ArgMode[];
}

const SPECS: readonly FunctionSpec[] = [
  { name: 'SUM', min: 1, max: null, modes: ['rangeOrValue'] },
  { name: 'MIN', min: 1, max: null, modes: ['rangeOrValue'] },
  { name: 'MAX', min: 1, max: null, modes: ['rangeOrValue'] },
  { name: 'ABS', min: 1, max: 1, modes: ['number'] },
  { name: 'MOD', min: 2, max: 2, modes: ['number', 'number'] },
  { name: 'IF', min: 3, max: 3, modes: ['lazy', 'lazy', 'lazy'] },
  { name: 'AND', min: 1, max: null, modes: ['boolean'] },
  { name: 'OR', min: 1, max: null, modes: ['boolean'] },
  { name: 'NOT', min: 1, max: 1, modes: ['boolean'] },
  { name: 'ROW', min: 1, max: 1, modes: ['ref'] },
  { name: 'COL', min: 1, max: 1, modes: ['ref'] },
  { name: 'DIST', min: 2, max: 2, modes: ['ref', 'ref'] },
  { name: 'TOWARD', min: 1, max: 1, modes: ['ref'] },
  { name: 'RAND', min: 0, max: 0, modes: [] },
];

/** The function table, keyed by upper-case name. */
export const FUNCTION_TABLE: ReadonlyMap<string, FunctionSpec> = new Map(
  SPECS.map((spec) => [spec.name, spec]),
);

/** Looks a function up by name, case-insensitively. */
export function lookupFunction(name: string): FunctionSpec | undefined {
  return FUNCTION_TABLE.get(name.toUpperCase());
}

/** True when `count` arguments are acceptable for `spec`. */
export function arityAccepts(spec: FunctionSpec, count: number): boolean {
  return count >= spec.min && (spec.max === null || count <= spec.max);
}

/** The argument mode for the argument at `index` (0-based). */
export function argModeAt(spec: FunctionSpec, index: number): ArgMode | undefined {
  if (spec.modes.length === 0) return undefined;
  return spec.modes[Math.min(index, spec.modes.length - 1)];
}

/** `SUM` of the numeric members. Nothing gives 0. */
export function sumOf(numbers: readonly number[]): number {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}

/** `MIN` of the numeric members. `undefined` flags #VALUE! (no numeric members). */
export function minOf(numbers: readonly number[]): number | undefined {
  if (numbers.length === 0) return undefined;
  let best = numbers[0] as number;
  for (const n of numbers) if (n < best) best = n;
  return best;
}

/** `MAX` of the numeric members. `undefined` flags #VALUE! (no numeric members). */
export function maxOf(numbers: readonly number[]): number | undefined {
  if (numbers.length === 0) return undefined;
  let best = numbers[0] as number;
  for (const n of numbers) if (n > best) best = n;
  return best;
}

export function absOf(x: number): number {
  return Math.abs(x);
}

export type ModResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: '#DIV/0!' };

/** `MOD(a, b)`: result has the sign of `b`. A zero divisor (including -0) is flagged #DIV/0!. */
export function modOf(a: number, b: number): ModResult {
  if (b === 0) return { ok: false, error: '#DIV/0!' };
  let r = a % b;
  if (r !== 0 && Math.sign(r) !== Math.sign(b)) r += b;
  // Rounding guard: keep the result inside [0, |b|) with the sign of b.
  if (!Number.isFinite(r) || Math.abs(r) >= Math.abs(b)) r = 0;
  // Normalise -0 to 0.
  return { ok: true, value: r === 0 ? 0 : r };
}

export function andOf(values: readonly boolean[]): boolean {
  return values.every((v) => v);
}

export function orOf(values: readonly boolean[]): boolean {
  return values.some((v) => v);
}

export function notOf(x: boolean): boolean {
  return !x;
}

export function rowOf(p: GridPoint): number {
  return p.row;
}

export function colOf(p: GridPoint): number {
  return p.col;
}

/** Manhattan distance between two points. */
export function distOf(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export type Direction = 'N' | 'S' | 'E' | 'W' | '-';

/** `TOWARD`: one step from `self` toward `target` along the larger axis; ties go vertical. */
export function towardOf(self: GridPoint, target: GridPoint): Direction {
  const dr = target.row - self.row;
  const dc = target.col - self.col;
  if (dr === 0 && dc === 0) return '-';
  if (Math.abs(dr) >= Math.abs(dc)) return dr < 0 ? 'N' : 'S';
  return dc < 0 ? 'W' : 'E';
}
