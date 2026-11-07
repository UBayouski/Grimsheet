import type { Cue, Status, StorageLike } from './types';

export interface Note {
  readonly hz: number;
  readonly ms: number;
}

/** The Cue table: notes are played in sequence with no gap. */
export const CUE_NOTES: Readonly<Record<Cue, readonly Note[]>> = {
  move: [{ hz: 440, ms: 30 }],
  edit: [
    { hz: 660, ms: 50 },
    { hz: 880, ms: 70 },
  ],
  damage: [
    { hz: 150, ms: 70 },
    { hz: 110, ms: 90 },
  ],
  win: [
    { hz: 523, ms: 90 },
    { hz: 659, ms: 90 },
    { hz: 784, ms: 90 },
    { hz: 1047, ms: 90 },
  ],
  death: [
    { hz: 392, ms: 140 },
    { hz: 330, ms: 140 },
    { hz: 262, ms: 140 },
    { hz: 196, ms: 140 },
  ],
};

/** One accepted Action. Refused Actions never reach `cuesFor`. */
export interface AcceptedTurn {
  readonly kind: 'move' | 'wait' | 'edit' | 'undo';
  /** Status of the run after the Action. */
  readonly status: Status;
  /** True when the Action dealt damage. Always false for undo. */
  readonly damaged: boolean;
}

const NONE: readonly Cue[] = [];
const MOVE: readonly Cue[] = ['move'];
const EDIT: readonly Cue[] = ['edit'];
const DAMAGE: readonly Cue[] = ['damage'];
const WIN: readonly Cue[] = ['win'];
const DEATH: readonly Cue[] = ['death'];

export function cuesFor(turn: AcceptedTurn): readonly Cue[] {
  if (turn.status === 'lost') return DEATH;
  if (turn.status === 'won') return WIN;
  if (turn.kind === 'undo') return NONE;
  if (turn.damaged) return DAMAGE;
  if (turn.kind === 'edit') return EDIT;
  if (turn.kind === 'move') return MOVE;
  return NONE;
}

export const MUTE_KEY = 'grimsheet.muted';

/** True only for the exact value '1'. A throwing store reads as not muted. */
export function readMuted(storage: StorageLike): boolean {
  try {
    return storage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Writes '1' or '0'. A throwing store is ignored. */
export function writeMuted(storage: StorageLike, muted: boolean): void {
  try {
    storage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Mute preference is best effort.
  }
}
