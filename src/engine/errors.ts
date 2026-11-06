import { parseAddress, readingIndex } from './address';
import { errorValue, type ErrorKind, type ErrorValue } from './values';

export const MAX_CAUSE_LENGTH = 200;

/** Cut to at most 200 code points, never splitting a surrogate pair. Keeps the start (the origin). */
export function truncateCause(text: string): string {
  const points = Array.from(text);
  if (points.length <= MAX_CAUSE_LENGTH) return text;
  return points.slice(0, MAX_CAUSE_LENGTH).join('');
}

/**
 * Build an error Value. The cause is the origin Address, a space, then the text
 * (for example origin `B9` and text `refers to M30, which does not exist`), cut to 200 characters.
 * When the origin Cell has a name, the cause starts with `B9 (NAME)` instead. The `origin` field of
 * the Value stays the bare Address, because `pickError` reads it.
 */
export function makeError(
  kind: ErrorKind,
  origin: string,
  text: string,
  originName: string | null = null,
): ErrorValue {
  const label = originName === null || originName === '' ? origin : `${origin} (${originName})`;
  const cause = truncateCause(text === '' ? label : `${label} ${text}`);
  return errorValue(kind, cause, origin);
}

function originIndex(e: ErrorValue): number {
  const parsed = parseAddress(e.origin);
  return parsed.ok ? readingIndex(parsed.point) : Number.POSITIVE_INFINITY;
}

/**
 * Choose the winning error from errors listed in source order.
 * If any is #CYCLE!, the #CYCLE! with the lowest origin reading index wins (first one on a tie).
 * Otherwise the first error in the list wins.
 */
export function pickError(errors: readonly [ErrorValue, ...ErrorValue[]]): ErrorValue {
  let best: ErrorValue = errors[0];
  let bestIsCycle = best.error === '#CYCLE!';
  let bestIndex = bestIsCycle ? originIndex(best) : 0;
  for (let i = 1; i < errors.length; i++) {
    const e = errors[i];
    if (e === undefined || e.error !== '#CYCLE!') continue;
    const idx = originIndex(e);
    if (!bestIsCycle || idx < bestIndex) {
      best = e;
      bestIsCycle = true;
      bestIndex = idx;
    }
  }
  return best;
}
