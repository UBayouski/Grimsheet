import type { Sheet } from '../engine/index';

/** Seeded source of numbers in [0, 1). */
export type RandomSource = () => number;

export interface CellSpec {
  readonly address: string;
  readonly raw: string;
  readonly locked?: true;
  readonly name?: string;
}

export interface MonsterSpec {
  readonly id: string;
  readonly at: string;
  readonly move: string;
  readonly atk: string;
}

export interface LevelDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly startingHp: number;
  readonly ink: number;
  readonly seed: number;
  readonly hero: { readonly at: string };
  readonly monsters: readonly MonsterSpec[];
  readonly map: readonly string[];
  readonly cells: readonly CellSpec[];
}

/** A Level is a LevelDocument in normalized form, deep-frozen by the loader. */
export type Level = LevelDocument;

export const LOAD_ERROR_CODES = [
  'not-an-object',
  'missing-field',
  'unknown-field',
  'wrong-type',
  'too-many-items',
  'bad-schema-version',
  'bad-id',
  'bad-title',
  'bad-hint',
  'bad-hp',
  'bad-ink',
  'bad-seed',
  'bad-map-size',
  'bad-map-row',
  'bad-map-glyph',
  'bad-address',
  'reserved-row',
  'duplicate-address',
  'bad-raw',
  'formula-parse',
  'bad-name',
  'duplicate-name',
  'missing-label',
  'label-is-named',
  'bad-label-value',
  'bad-monster-id',
  'duplicate-monster-id',
  'entity-overlap',
  'unknown-rule',
  'bad-rule-cell',
  'hero-blocked',
  'monster-not-on-floor',
  'engine-refused',
  'too-large',
  'invalid-json',
  'too-deep',
  'internal-error',
  'too-many-errors',
] as const;

export type LoadErrorCode = (typeof LOAD_ERROR_CODES)[number];

export interface LoadError {
  readonly path: string;
  readonly code: LoadErrorCode;
  readonly message: string;
}

export type LoadResult =
  | { readonly ok: true; readonly level: Level; readonly sheet: Sheet }
  | { readonly ok: false; readonly errors: readonly LoadError[] };
