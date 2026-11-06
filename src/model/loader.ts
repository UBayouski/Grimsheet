import type { LoadError, LoadErrorCode } from './types';

export const MAX_DEPTH = 100;
export const MAX_NODES = 100_000;
export const MAX_ERRORS = 50;
export const MAX_MESSAGE_LENGTH = 300;
export const MAX_QUOTE_CODE_POINTS = 40;

export type GuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: LoadErrorCode; readonly message: string };

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Walks a parsed JSON-like value with an explicit stack. No recursion, no writes.
 * The root has depth 1. Rejects non-plain objects, depth over 100 and over 100,000 nodes.
 */
export function guardValue(root: unknown): GuardResult {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 1 }];
  let nodes = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    nodes += 1;
    if (nodes > MAX_NODES) {
      return { ok: false, code: 'too-large', message: `The document has more than ${MAX_NODES} values.` };
    }
    const { value, depth } = item;
    if (typeof value !== 'object' || value === null) continue;
    if (depth > MAX_DEPTH) {
      return { ok: false, code: 'too-deep', message: `The document is nested deeper than ${MAX_DEPTH} levels.` };
    }
    if (Array.isArray(value)) {
      for (const child of value as unknown[]) stack.push({ value: child, depth: depth + 1 });
    } else if (isPlainObject(value)) {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) stack.push({ value: record[key], depth: depth + 1 });
    } else {
      return { ok: false, code: 'not-an-object', message: 'The document holds a value that is not plain JSON.' };
    }
  }
  return { ok: true };
}

/** Clamps a message to 1..300 characters. */
export function clampMessage(message: string): string {
  if (message.length === 0) return '(no message)';
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  return message.slice(0, MAX_MESSAGE_LENGTH - 1) + '…';
}

export function makeError(path: string, code: LoadErrorCode, message: string): LoadError {
  return { path, code, message: clampMessage(message) };
}

/** Quotes text for a message: at most 40 code points, escaped, ellipsis on truncation. */
export function quote(text: string): string {
  const points = Array.from(text);
  const truncated = points.length > MAX_QUOTE_CODE_POINTS;
  const shown = truncated ? points.slice(0, MAX_QUOTE_CODE_POINTS).join('') : text;
  const escaped = JSON.stringify(shown).slice(1, -1);
  return `"${escaped}${truncated ? '…' : ''}"`;
}

function pathMatches(path: string, prefix: string): boolean {
  if (prefix === '') return true;
  if (path === prefix) return true;
  if (!path.startsWith(prefix)) return false;
  const next = path.charAt(prefix.length);
  return next === '.' || next === '[';
}

export interface ErrorCollector {
  push(path: string, code: LoadErrorCode, message: string): void;
  has(pathPrefix: string): boolean;
  readonly count: number;
  readonly dropped: number;
  finish(): readonly LoadError[];
}

/** Collects up to 50 errors; counts the rest exactly and adds a too-many-errors marker. */
export function createErrorCollector(): ErrorCollector {
  const kept: LoadError[] = [];
  const allPaths: string[] = [];
  let dropped = 0;
  return {
    push(path, code, message) {
      allPaths.push(path);
      if (kept.length < MAX_ERRORS) kept.push(makeError(path, code, message));
      else dropped += 1;
    },
    has(pathPrefix) {
      return allPaths.some((p) => pathMatches(p, pathPrefix));
    },
    get count() {
      return kept.length + dropped;
    },
    get dropped() {
      return dropped;
    },
    finish() {
      if (dropped === 0) return kept.slice();
      return [
        ...kept,
        makeError('', 'too-many-errors', `${dropped} more error${dropped === 1 ? '' : 's'} not shown.`),
      ];
    },
  };
}
