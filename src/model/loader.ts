import type { LoadError, LoadErrorCode, LoadResult, RandomSource } from './types';

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

// ---------------------------------------------------------------------------
// Shape, metadata and map checks (tasks 3.1b)
// ---------------------------------------------------------------------------

export const ROOT_FIELDS = [
  'schemaVersion',
  'id',
  'title',
  'hint',
  'map',
  'cells',
  'hero',
  'monsters',
  'startingHp',
  'ink',
  'seed',
] as const;
export const CELL_FIELDS = ['address', 'raw', 'locked', 'name'] as const;
export const MONSTER_FIELDS = ['id', 'at', 'move', 'atk'] as const;
export const HERO_FIELDS = ['at'] as const;

export const MAX_CELLS = 240;
export const MAX_MONSTERS = 16;
export const MAP_ROWS = 12;
export const MAP_COLUMNS = 12;
export const MAX_SEED = 4294967295;

const ID_PATTERN = /^[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const GLYPHS = '#.X^';
const COLUMN_LETTERS = 'ABCDEFGHIJKL';

type Fields = Readonly<Record<string, unknown>>;

/** Names the JSON type of a value for messages. */
export function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  }
  return typeof value;
}

function isPlainRecord(value: unknown): value is Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return isPlainObject(value);
}

function has(obj: Fields, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

function describeReceived(value: unknown): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeName(value);
}

function wrongType(errors: ErrorCollector, path: string, expected: string, value: unknown): void {
  errors.push(path, 'wrong-type', `${path} must be ${expected}, but it is ${typeName(value)}.`);
}

/** Reads a required field; reports missing-field when absent. Returns undefined when absent. */
function requireField(errors: ErrorCollector, obj: Fields, key: string, path: string): boolean {
  if (has(obj, key)) return true;
  errors.push(path, 'missing-field', `${path} is required.`);
  return false;
}

function checkUnknown(errors: ErrorCollector, obj: Fields, allowed: readonly string[], prefix: string): void {
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) continue;
    const path = prefix === '' ? key : `${prefix}.${key}`;
    errors.push(
      path,
      'unknown-field',
      `Unknown field ${quote(key)}. Allowed fields: ${allowed.join(', ')}.`,
    );
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Reads a required number field. Returns the number, or undefined after reporting. */
function readNumber(errors: ErrorCollector, obj: Fields, key: string): number | undefined {
  if (!requireField(errors, obj, key, key)) return undefined;
  const value = obj[key];
  if (!isFiniteNumber(value)) {
    wrongType(errors, key, 'a number', value);
    return undefined;
  }
  return value;
}

/** Reads a required string field. Returns the string, or undefined after reporting. */
function readString(errors: ErrorCollector, obj: Fields, key: string): string | undefined {
  if (!requireField(errors, obj, key, key)) return undefined;
  const value = obj[key];
  if (typeof value !== 'string') {
    wrongType(errors, key, 'a string', value);
    return undefined;
  }
  return value;
}

function checkMetadata(errors: ErrorCollector, root: Fields): void {
  const version = readNumber(errors, root, 'schemaVersion');
  if (version !== undefined && version !== 1) {
    errors.push(
      'schemaVersion',
      'bad-schema-version',
      `schemaVersion is ${String(version)}, but only version 1 is supported.`,
    );
  }

  const id = readString(errors, root, 'id');
  if (id !== undefined && (Array.from(id).length > 40 || !ID_PATTERN.test(id))) {
    errors.push(
      'id',
      'bad-id',
      `id ${quote(id)} must look like 01-the-corridor (two digits, a hyphen, then lower-case words joined by single hyphens) and be at most 40 characters.`,
    );
  }

  const title = readString(errors, root, 'title');
  if (title !== undefined) {
    const length = Array.from(title).length;
    if (length < 1 || length > 60 || title !== title.trim() || CONTROL_PATTERN.test(title)) {
      errors.push(
        'title',
        'bad-title',
        'title must be 1 to 60 characters with no leading or trailing space and no control characters.',
      );
    }
  }

  const hint = readString(errors, root, 'hint');
  if (hint !== undefined) {
    const length = Array.from(hint).length;
    if (length < 1 || length > 160 || CONTROL_PATTERN.test(hint)) {
      errors.push(
        'hint',
        'bad-hint',
        'hint must be a single line of 1 to 160 characters with no control characters.',
      );
    }
  }

  const hp = readNumber(errors, root, 'startingHp');
  if (hp !== undefined && (!Number.isSafeInteger(hp) || hp < 1)) {
    errors.push('startingHp', 'bad-hp', `startingHp is ${String(hp)}, but HP must be a positive whole number.`);
  }

  const ink = readNumber(errors, root, 'ink');
  if (ink !== undefined && (!Number.isSafeInteger(ink) || ink < 0)) {
    errors.push('ink', 'bad-ink', `ink is ${String(ink)}, but ink must be a whole number of 0 or more.`);
  }

  const seed = readNumber(errors, root, 'seed');
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED)) {
    errors.push('seed', 'bad-seed', `seed is ${String(seed)}, but seed must be a whole number from 0 to ${MAX_SEED}.`);
  }
}

function checkMap(errors: ErrorCollector, root: Fields): void {
  if (!requireField(errors, root, 'map', 'map')) return;
  const map = root['map'];
  if (!Array.isArray(map)) {
    wrongType(errors, 'map', 'an array', map);
    return;
  }
  const rows = map as unknown[];
  if (rows.length !== MAP_ROWS) {
    errors.push('map', 'bad-map-size', `map must have ${MAP_ROWS} rows, but it has ${rows.length}.`);
  }
  for (let i = 0; i < rows.length; i += 1) {
    const path = `map[${i}]`;
    const row = rows[i];
    if (typeof row !== 'string') {
      wrongType(errors, path, 'a string', row);
      continue;
    }
    const chars = Array.from(row);
    if (chars.length !== MAP_COLUMNS) {
      errors.push(
        path,
        'bad-map-row',
        `${path} must be ${MAP_COLUMNS} characters long, but it is ${chars.length}.`,
      );
      continue;
    }
    for (let c = 0; c < chars.length; c += 1) {
      const ch = chars[c] ?? '';
      if (GLYPHS.includes(ch) && ch.length === 1) continue;
      errors.push(
        path,
        'bad-map-glyph',
        `map row ${i + 1}, column ${COLUMN_LETTERS.charAt(c)}: ${quote(ch)} is not one of # . X ^`,
      );
    }
  }
}

function checkStringFields(
  errors: ErrorCollector,
  obj: Fields,
  prefix: string,
  required: readonly string[],
): void {
  for (const key of required) {
    const path = `${prefix}.${key}`;
    if (!requireField(errors, obj, key, path)) continue;
    const value = obj[key];
    if (typeof value !== 'string') wrongType(errors, path, 'a string', value);
  }
}

function checkCellShapes(errors: ErrorCollector, root: Fields): void {
  if (!requireField(errors, root, 'cells', 'cells')) return;
  const cells = root['cells'];
  if (!Array.isArray(cells)) {
    wrongType(errors, 'cells', 'an array', cells);
    return;
  }
  const list = cells as unknown[];
  if (list.length > MAX_CELLS) {
    errors.push('cells', 'too-many-items', `cells holds ${list.length} entries, but the maximum is ${MAX_CELLS}.`);
    return;
  }
  for (let i = 0; i < list.length; i += 1) {
    const path = `cells[${i}]`;
    const entry = list[i];
    if (!isPlainRecord(entry)) {
      wrongType(errors, path, 'an object', entry);
      continue;
    }
    checkStringFields(errors, entry, path, ['address', 'raw']);
    if (has(entry, 'locked') && typeof entry['locked'] !== 'boolean') {
      wrongType(errors, `${path}.locked`, 'a boolean', entry['locked']);
    }
    if (has(entry, 'name') && typeof entry['name'] !== 'string') {
      wrongType(errors, `${path}.name`, 'a string', entry['name']);
    }
    checkUnknown(errors, entry, CELL_FIELDS, path);
  }
}

function checkHeroShape(errors: ErrorCollector, root: Fields): void {
  if (!requireField(errors, root, 'hero', 'hero')) return;
  const hero = root['hero'];
  if (!isPlainRecord(hero)) {
    wrongType(errors, 'hero', 'an object', hero);
    return;
  }
  checkStringFields(errors, hero, 'hero', ['at']);
  checkUnknown(errors, hero, HERO_FIELDS, 'hero');
}

function checkMonsterShapes(errors: ErrorCollector, root: Fields): void {
  if (!requireField(errors, root, 'monsters', 'monsters')) return;
  const monsters = root['monsters'];
  if (!Array.isArray(monsters)) {
    wrongType(errors, 'monsters', 'an array', monsters);
    return;
  }
  const list = monsters as unknown[];
  if (list.length > MAX_MONSTERS) {
    errors.push(
      'monsters',
      'too-many-items',
      `monsters holds ${list.length} entries, but the maximum is ${MAX_MONSTERS}.`,
    );
    return;
  }
  for (let i = 0; i < list.length; i += 1) {
    const path = `monsters[${i}]`;
    const entry = list[i];
    if (!isPlainRecord(entry)) {
      wrongType(errors, path, 'an object', entry);
      continue;
    }
    checkStringFields(errors, entry, path, MONSTER_FIELDS);
    checkUnknown(errors, entry, MONSTER_FIELDS, path);
  }
}

/**
 * Runs the root, metadata and map checks in the stable order of Requirement 8.1:
 * scalar fields, map, cells, hero, monsters, then unknown root fields.
 * Reads the document only; never writes to it.
 */
export function checkDocument(doc: unknown, errors: ErrorCollector): void {
  if (!isPlainRecord(doc)) {
    errors.push(
      '',
      'not-an-object',
      `A Level_Document must be an object, but the value is ${describeReceived(doc)}.`,
    );
    return;
  }
  checkMetadata(errors, doc);
  checkMap(errors, doc);
  checkCellShapes(errors, doc);
  checkHeroShape(errors, doc);
  checkMonsterShapes(errors, doc);
  checkUnknown(errors, doc, ROOT_FIELDS, '');
}

/**
 * Validates a Level_Document. Never throws and never mutates the input.
 * Later tasks extend this with cell, entity and build stages.
 */
export function loadLevel(doc: unknown, random: RandomSource): LoadResult {
  void random;
  try {
    const guard = guardValue(doc);
    if (!guard.ok) {
      return { ok: false, errors: [makeError('', guard.code, guard.message)] };
    }
    const errors = createErrorCollector();
    checkDocument(doc, errors);
    if (errors.count > 0) return { ok: false, errors: errors.finish() };
    return {
      ok: false,
      errors: [makeError('', 'internal-error', 'The loader has no build stage yet.')],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown failure';
    return { ok: false, errors: [makeError('', 'internal-error', `The loader failed unexpectedly: ${reason}`)] };
  }
}

export const MAX_TEXT_LENGTH = 200_000;

function jsonPosition(message: string): string | undefined {
  const at = /position (\d+)/.exec(message);
  if (at?.[1] !== undefined) return `position ${at[1]}`;
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol?.[1] !== undefined && lineCol[2] !== undefined) {
    return `line ${lineCol[1]}, column ${lineCol[2]}`;
  }
  return undefined;
}

/**
 * Parses JSON text and validates it. Never throws.
 * Text over 200,000 characters is refused before parsing.
 */
export function loadLevelText(text: string, random: RandomSource): LoadResult {
  try {
    if (text.length > MAX_TEXT_LENGTH) {
      return {
        ok: false,
        errors: [
          makeError('', 'too-large', `The text has ${text.length} characters, but the maximum is ${MAX_TEXT_LENGTH}.`),
        ],
      };
    }
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (error) {
      if (error instanceof RangeError) {
        return {
          ok: false,
          errors: [makeError('', 'too-deep', `The document is nested deeper than ${MAX_DEPTH} levels.`)],
        };
      }
      if (error instanceof SyntaxError) {
        const where = jsonPosition(error.message);
        const message = where === undefined ? 'The text is not valid JSON.' : `The text is not valid JSON (at ${where}).`;
        return { ok: false, errors: [makeError('', 'invalid-json', message)] };
      }
      throw error;
    }
    return loadLevel(doc, random);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown failure';
    return { ok: false, errors: [makeError('', 'internal-error', `The loader failed unexpectedly: ${reason}`)] };
  }
}
