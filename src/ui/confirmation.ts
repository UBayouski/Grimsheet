import { STRINGS } from './strings';
import type { LevelEntry, Pending, Status } from './types';

export type Wanted = Pick<Pending, 'kind' | 'levelIndex'>;

export type Decision = 'prompt' | 'execute' | 'cancel';

/** True when both describe the same kind of action on the same level. */
export function isSame(
  a: Wanted | undefined,
  b: Wanted | undefined,
): boolean {
  if (a === undefined || b === undefined) {
    return false;
  }
  return a.kind === b.kind && a.levelIndex === b.levelIndex;
}

/**
 * Decide what to do with a restart or switch request.
 * Execute when there is no run, the run is over, or the request repeats the
 * pending one. Prompt when nothing is pending. Cancel otherwise.
 */
export function decide(
  status: Status | undefined,
  pending: Wanted | undefined,
  wanted: Wanted,
): Decision {
  if (status === undefined || status !== 'playing') {
    return 'execute';
  }
  if (pending === undefined) {
    return 'prompt';
  }
  return isSame(pending, wanted) ? 'execute' : 'cancel';
}

/** The prompt text shown while a request waits for confirmation. */
export function promptFor(
  wanted: Wanted,
  entries: readonly LevelEntry[],
): string {
  if (wanted.kind === 'restart') {
    return STRINGS.confirmRestart;
  }
  const entry = entries[wanted.levelIndex];
  return STRINGS.confirmSwitch(entry === undefined ? '' : entry.label);
}
