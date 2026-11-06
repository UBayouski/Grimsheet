import type { Value } from '../engine/index';
import type { Level, LoadError } from '../model/index';

export type Direction = 'N' | 'S' | 'E' | 'W';
export type Status = 'playing' | 'won' | 'lost';

export type Action =
  | { readonly kind: 'move'; readonly dir: Direction }
  | { readonly kind: 'wait' }
  | { readonly kind: 'edit'; readonly address: string; readonly raw: string }
  | { readonly kind: 'undo' };

/** `address` is canonical. */
export interface EditRecordEntry {
  readonly address: string;
  readonly raw: string;
}

export interface MonsterState {
  readonly id: string;
  readonly at: string;
  readonly move: string;
  readonly atk: string;
}

/** Everything the last accepted Turn_Action changed. Holds no snapshot of its own. */
export interface UndoSnapshot {
  readonly edits: readonly EditRecordEntry[];
  readonly hero: string;
  readonly monsters: readonly MonsterState[];
  readonly hp: number;
  readonly ink: number;
  readonly turn: number;
  readonly status: Status;
  readonly rngState: number;
  readonly valuesHero: string;
  readonly valuesRngState: number;
}

export interface RunState extends UndoSnapshot {
  readonly level: Level;
  readonly undoSnapshot: UndoSnapshot | null;
}

export const REFUSAL_REASONS = [
  'not-playing',
  'blocked',
  'occupied',
  'locked',
  'bad-address',
  'reserved-row',
  'unchanged',
  'no-ink',
  'parse-error',
  'nothing-to-undo',
  'invalid-action',
  'internal-error',
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

/** Largest amount one damage log entry can carry. */
export const MAX_DAMAGE = 1_000_000_000;

export type DamageSource =
  | { readonly kind: 'monster'; readonly id: string }
  | { readonly kind: 'trap' }
  | { readonly kind: 'haunt' };

export interface DamageEntry {
  readonly source: DamageSource;
  readonly amount: number;
}
export type DamageLog = readonly DamageEntry[];

export interface Refusal {
  readonly ok: false;
  readonly reason: RefusalReason;
  readonly message: string;
}

export type ActionResult =
  | { readonly ok: true; readonly state: RunState; readonly damage: DamageLog }
  | Refusal;

export type StartRunResult =
  | { readonly ok: true; readonly state: RunState }
  | { readonly ok: false; readonly errors: readonly LoadError[] };

export interface RandomGenerator {
  next(): number;
  readonly state: number;
}

/** Re-exported for type-level use by sibling modules. */
export type { Value };
