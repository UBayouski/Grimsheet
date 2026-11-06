import {
  createSheet,
  formatValue,
  getValueByAddress,
  parseAddress,
  parseFormula,
  recalculate,
  setCellName,
  setRawText,
  validateCellName,
} from '../engine/index';
import type { NameCheckFailure, Sheet, Value } from '../engine/index';
import { normalize } from './serializer';
import type { LoadError, LoadErrorCode, LoadResult, Level, LevelDocument, RandomSource } from './types';

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

// ---------------------------------------------------------------------------
// Cell checks (task 3.2)
// ---------------------------------------------------------------------------

export const MAX_RAW_LENGTH = 500;
export const RESERVED_ROW = 13;
export const PANEL_FIRST_ROW = 14;

export interface CellsInfo {
  /** Effective raw text by upper-case address: map characters first, then spec raws as written. */
  readonly effective: ReadonlyMap<string, string>;
  /** Canonical (upper-case) name to the address that holds it. */
  readonly names: ReadonlyMap<string, string>;
  /** Address to the index of its Cell_Spec. */
  readonly indexByAddress: ReadonlyMap<string, number>;
}

const NAME_FAILURES: Readonly<Record<NameCheckFailure, string>> = {
  pattern: 'it must start with a letter or underscore and use only letters, digits and underscores',
  reserved: 'it is a reserved name',
  function: 'it is a function name',
  'address-like': 'it looks like a cell address',
};

/**
 * Checks Cell_Specs against the sheet layout. Reads the document only.
 * Entries that failed their shape check are skipped; they already have an error.
 */
export function checkCells(doc: unknown, errors: ErrorCollector): CellsInfo {
  const effective = new Map<string, string>();
  const names = new Map<string, string>();
  const indexByAddress = new Map<string, number>();
  const info: CellsInfo = { effective, names, indexByAddress };
  if (!isPlainRecord(doc)) return info;

  const map = doc['map'];
  if (Array.isArray(map)) {
    const rows = map as unknown[];
    for (let r = 0; r < Math.min(rows.length, MAP_ROWS); r += 1) {
      const row = rows[r];
      if (typeof row !== 'string') continue;
      const chars = Array.from(row);
      if (chars.length !== MAP_COLUMNS) continue;
      for (let c = 0; c < MAP_COLUMNS; c += 1) {
        effective.set(`${COLUMN_LETTERS.charAt(c)}${r + 1}`, chars[c] ?? '');
      }
    }
  }

  const cells = doc['cells'];
  if (!Array.isArray(cells)) return info;
  const list = cells as unknown[];
  if (list.length > MAX_CELLS) return info;

  const namedIndexes: { index: number; address: string; col: number; row: number; name: string }[] = [];

  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    if (!isPlainRecord(entry)) continue;
    const path = `cells[${i}]`;

    const rawAddress = entry['address'];
    let address: string | undefined;
    let col = 0;
    let row = 0;
    if (typeof rawAddress === 'string') {
      const parsed = parseAddress(rawAddress);
      if (!parsed.ok) {
        errors.push(
          `${path}.address`,
          'bad-address',
          `Address ${quote(rawAddress)} is malformed or outside columns A to L and rows 1 to 20.`,
        );
      } else if (parsed.point.row === RESERVED_ROW) {
        errors.push(
          `${path}.address`,
          'reserved-row',
          `Address ${parsed.canonical} is in row 13, which is reserved between the map and the rules panel.`,
        );
      } else {
        const earlier = indexByAddress.get(parsed.canonical);
        if (earlier !== undefined) {
          errors.push(
            `${path}.address`,
            'duplicate-address',
            `Address ${parsed.canonical} is already used by cells[${earlier}].`,
          );
        } else {
          address = parsed.canonical;
          col = parsed.point.col;
          row = parsed.point.row;
          indexByAddress.set(address, i);
        }
      }
    }

    const raw = entry['raw'];
    if (typeof raw === 'string') {
      if (Array.from(raw).length > MAX_RAW_LENGTH) {
        errors.push(
          `${path}.raw`,
          'bad-raw',
          `raw has ${Array.from(raw).length} characters, but the maximum is ${MAX_RAW_LENGTH}.`,
        );
      } else if (raw.startsWith('=')) {
        const parsed = parseFormula(raw);
        if (!parsed.ok) {
          const where = address === undefined ? '' : ` in ${address}`;
          errors.push(`${path}.raw`, 'formula-parse', `${parsed.error.text}${where}`);
        }
      }
      if (address !== undefined) effective.set(address, raw);
    }

    const name = entry['name'];
    if (typeof name === 'string') {
      const check = validateCellName(name);
      if (!check.ok) {
        errors.push(
          `${path}.name`,
          'bad-name',
          `Name ${quote(name)} is not allowed: ${NAME_FAILURES[check.failed]}.`,
        );
      } else {
        const earlier = names.get(check.canonical);
        if (earlier !== undefined) {
          errors.push(
            `${path}.name`,
            'duplicate-name',
            `Name ${check.canonical} is already used by ${earlier}.`,
          );
        } else if (address !== undefined) {
          names.set(check.canonical, address);
          namedIndexes.push({ index: i, address, col, row, name: check.canonical });
        }
      }
    }
  }

  const namedAddresses = new Set(namedIndexes.map((n) => n.address));
  for (const n of namedIndexes) {
    if (n.row < PANEL_FIRST_ROW) continue;
    const path = `cells[${n.index}].name`;
    if (n.col === 1) {
      errors.push(path, 'missing-label', `Name ${n.name} is in column A, which has no label cell.`);
      continue;
    }
    const labelAddress = `${COLUMN_LETTERS.charAt(n.col - 2)}${n.row}`;
    const label = effective.get(labelAddress) ?? '';
    if (label === '' || label.startsWith('=')) {
      errors.push(
        path,
        'missing-label',
        `Name ${n.name} needs a text label in ${labelAddress}, but that cell is ${label === '' ? 'empty' : 'a formula'}.`,
      );
    } else if (namedAddresses.has(labelAddress)) {
      const labelIndex = indexByAddress.get(labelAddress) ?? n.index;
      errors.push(
        `cells[${labelIndex}].name`,
        'label-is-named',
        `${labelAddress} is the label of ${n.name}, so it cannot be a named rule cell.`,
      );
    }
  }
  return info;
}

// ---------------------------------------------------------------------------
// Entity checks (task 3.3)
// ---------------------------------------------------------------------------

export const MAX_MONSTER_ID_LENGTH = 8;
export const PANEL_LAST_ROW = 20;
const MONSTER_ID_PATTERN = /^M[1-9][0-9]*$/;

/** Returns the canonical address when `value` is a valid Address in rows 1 to 12. */
function mapAddress(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = parseAddress(value);
  if (!parsed.ok || parsed.point.row > MAP_ROWS) return undefined;
  return parsed.canonical;
}

/** True when a Cell_Spec carries `name` (case-insensitive) but did not register it as a valid name. */
function nameFailedElsewhere(doc: Fields, upper: string, info: CellsInfo): boolean {
  const cells = doc['cells'];
  if (!Array.isArray(cells)) return false;
  for (const entry of cells as unknown[]) {
    if (!isPlainRecord(entry)) continue;
    const name = entry['name'];
    if (typeof name === 'string' && name.toUpperCase() === upper && !info.names.has(upper)) return true;
  }
  return false;
}

function checkRule(
  errors: ErrorCollector,
  doc: Fields,
  info: CellsInfo,
  entry: Fields,
  index: number,
  idLabel: string,
  field: 'move' | 'atk',
): void {
  const value = entry[field];
  if (typeof value !== 'string') return;
  const path = `monsters[${index}].${field}`;
  const upper = value.toUpperCase();
  const address = info.names.get(upper);
  if (address === undefined) {
    if (nameFailedElsewhere(doc, upper, info)) return;
    errors.push(
      path,
      'unknown-rule',
      `monster ${idLabel}: ${field} rule ${quote(value).slice(1, -1)} is not a named cell`,
    );
    return;
  }
  const parsed = parseAddress(address);
  const row = parsed.ok ? parsed.point.row : 0;
  const raw = info.effective.get(address) ?? '';
  if (row < PANEL_FIRST_ROW || row > PANEL_LAST_ROW || raw === '') {
    errors.push(
      path,
      'bad-rule-cell',
      `monster ${idLabel}: ${field} rule ${upper} names ${address}, but rule cells must be non-empty and in rows 14 to 20.`,
    );
  }
}

/**
 * Checks the hero and monster specs against the map and the named cells.
 * Reads the document only. Entries that failed their shape check are skipped.
 */
export function checkEntities(doc: unknown, errors: ErrorCollector, info: CellsInfo): void {
  if (!isPlainRecord(doc)) return;

  const occupied = new Map<string, string>();
  const hero = doc['hero'];
  if (isPlainRecord(hero) && typeof hero['at'] === 'string') {
    const at = mapAddress(hero['at']);
    if (at === undefined) {
      errors.push('hero.at', 'bad-address', 'The hero must start in the map area, rows 1 to 12.');
    } else {
      occupied.set(at, 'the hero');
    }
  }

  const monsters = doc['monsters'];
  if (!Array.isArray(monsters)) return;
  const list = monsters as unknown[];
  if (list.length > MAX_MONSTERS) return;

  const seenIds = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    if (!isPlainRecord(entry)) continue;
    const path = `monsters[${i}]`;

    const id = entry['id'];
    let idLabel = `monsters[${i}]`;
    if (typeof id === 'string') {
      if (!MONSTER_ID_PATTERN.test(id) || id.length > MAX_MONSTER_ID_LENGTH) {
        errors.push(
          `${path}.id`,
          'bad-monster-id',
          `Monster id ${quote(id)} must be M followed by digits without a leading zero, at most ${MAX_MONSTER_ID_LENGTH} characters.`,
        );
      } else {
        idLabel = id;
        if (seenIds.has(id)) {
          errors.push(`${path}.id`, 'duplicate-monster-id', `Monster id ${id} is already used by an earlier monster.`);
        }
        seenIds.add(id);
      }
    }

    if (typeof entry['at'] === 'string') {
      const at = mapAddress(entry['at']);
      if (at === undefined) {
        errors.push(`${path}.at`, 'bad-address', `Monster ${idLabel} must start in the map area, rows 1 to 12.`);
      } else {
        const holder = occupied.get(at);
        if (holder !== undefined) {
          errors.push(`${path}.at`, 'entity-overlap', `Monster ${idLabel} starts on ${at}, where ${holder} already stands.`);
        } else {
          occupied.set(at, `monster ${idLabel}`);
        }
      }
    }

    checkRule(errors, doc, info, entry, i, idLabel, 'move');
    checkRule(errors, doc, info, entry, i, idLabel, 'atk');
  }
}

// ---------------------------------------------------------------------------
// Sheet construction, placement checks and the final result (task 3.4)
// ---------------------------------------------------------------------------

/** Reads the reason out of an engine refusal, for an `engine-refused` message. */
function describeRefusal(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'unknown reason';
  const e = error as {
    kind?: unknown;
    parseError?: { text?: unknown };
    field?: unknown;
    failed?: unknown;
    name?: unknown;
  };
  const parts: string[] = [typeof e.kind === 'string' ? e.kind : 'unknown reason'];
  if (typeof e.parseError?.text === 'string') parts.push(e.parseError.text);
  if (typeof e.field === 'string') parts.push(`field ${e.field}`);
  if (typeof e.failed === 'string') parts.push(`check ${e.failed}`);
  if (typeof e.name === 'string') parts.push(`name ${e.name}`);
  return parts.join(', ');
}

function refuseBuild(errors: ErrorCollector, path: string, step: string, error: unknown): undefined {
  errors.push(path, 'engine-refused', `The engine refused ${step}: ${describeRefusal(error)}`);
  return undefined;
}

/**
 * Builds and recalculates the engine Sheet. Call only when the collector is empty.
 * Map characters first, then every Cell_Spec, then the names, then one recalculation with the
 * hero start as the hero Address. Any engine refusal becomes `engine-refused` and no Sheet.
 */
export function buildSheet(
  doc: unknown,
  info: CellsInfo,
  random: RandomSource,
  errors: ErrorCollector,
): Sheet | undefined {
  if (!isPlainRecord(doc)) return refuseBuild(errors, '', 'the document', { kind: 'not-an-object' });
  const sheet = createSheet();

  const map = Array.isArray(doc['map']) ? (doc['map'] as unknown[]) : [];
  for (let r = 0; r < MAP_ROWS; r += 1) {
    const row = map[r];
    const chars = typeof row === 'string' ? Array.from(row) : [];
    for (let c = 0; c < MAP_COLUMNS; c += 1) {
      const address = `${COLUMN_LETTERS.charAt(c)}${r + 1}`;
      const result = setRawText(sheet, address, chars[c] ?? '.');
      if (!result.accepted) return refuseBuild(errors, `map[${r}]`, `map cell ${address}`, result.error);
    }
  }

  const cells = Array.isArray(doc['cells']) ? (doc['cells'] as unknown[]) : [];
  for (let i = 0; i < cells.length; i += 1) {
    const entry = cells[i];
    if (!isPlainRecord(entry) || typeof entry['address'] !== 'string' || typeof entry['raw'] !== 'string') continue;
    const parsed = parseAddress(entry['address']);
    if (!parsed.ok) return refuseBuild(errors, `cells[${i}].address`, 'a cell address', { kind: 'bad-address' });
    const result = setRawText(sheet, parsed.canonical, entry['raw']);
    if (!result.accepted) return refuseBuild(errors, `cells[${i}].raw`, `cell ${parsed.canonical}`, result.error);
  }

  for (const [name, address] of info.names) {
    const index = info.indexByAddress.get(address) ?? 0;
    const result = setCellName(sheet, address, name);
    if (!result.accepted) return refuseBuild(errors, `cells[${index}].name`, `name ${name}`, result.error);
  }

  const hero = isPlainRecord(doc['hero']) ? doc['hero']['at'] : undefined;
  const heroPoint = typeof hero === 'string' ? parseAddress(hero) : undefined;
  if (heroPoint === undefined || !heroPoint.ok) {
    return refuseBuild(errors, 'hero.at', 'the hero start', { kind: 'bad-address' });
  }
  const recalculated = recalculate(sheet, { heroAddress: heroPoint.point, random });
  if (!recalculated.accepted) return refuseBuild(errors, '', 'the first recalculation', recalculated.error);
  return sheet;
}

/** Plain-English description of a Value found at a start Address. */
function describeFound(value: Value): string {
  if (value.kind === 'string') return value.value === '#' ? 'a wall (#)' : quote(value.value);
  return formatValue(value);
}

function valueAt(sheet: Sheet, address: string): Value | undefined {
  const read = getValueByAddress(sheet, address);
  return read.ok ? read.value : undefined;
}

/**
 * Post-recalculation checks, in the order of Requirement 8.1: the hero, the monsters in list
 * order, then the label Value of each named Rules_Panel Cell in `cells` order.
 * Call only when no earlier error exists.
 */
export function checkPlacement(sheet: Sheet, doc: unknown, info: CellsInfo, errors: ErrorCollector): void {
  if (!isPlainRecord(doc)) return;

  const hero = isPlainRecord(doc['hero']) ? mapAddress(doc['hero']['at']) : undefined;
  if (hero !== undefined) {
    const value = valueAt(sheet, hero);
    const walkable = value?.kind === 'string' && (value.value === '.' || value.value === 'X' || value.value === '^');
    if (!walkable) {
      const found = value === undefined ? 'missing' : describeFound(value);
      const tail = value?.kind === 'error' || (value?.kind === 'string' && value.value === '#') ? '' : ', which is not walkable';
      errors.push('hero.at', 'hero-blocked', `hero start ${hero} is ${found}${tail}`);
    }
  }

  const monsters = Array.isArray(doc['monsters']) ? (doc['monsters'] as unknown[]) : [];
  for (let i = 0; i < monsters.length; i += 1) {
    const entry = monsters[i];
    if (!isPlainRecord(entry)) continue;
    const at = mapAddress(entry['at']);
    if (at === undefined) continue;
    const value = valueAt(sheet, at);
    if (value?.kind === 'string' && value.value === '.') continue;
    const id = typeof entry['id'] === 'string' ? entry['id'] : `monsters[${i}]`;
    const found = value === undefined ? 'missing' : describeFound(value);
    errors.push(
      `monsters[${i}].at`,
      'monster-not-on-floor',
      `monster ${id} at ${at} is ${found}, but monsters start on floor (.)`,
    );
  }

  for (const [name, address] of info.names) {
    const parsed = parseAddress(address);
    if (!parsed.ok || parsed.point.row < PANEL_FIRST_ROW || parsed.point.col < 2) continue;
    const labelAddress = `${COLUMN_LETTERS.charAt(parsed.point.col - 2)}${parsed.point.row}`;
    const value = valueAt(sheet, labelAddress);
    if (value?.kind === 'string' && value.value !== '') continue;
    const index = info.indexByAddress.get(address) ?? 0;
    const found = value === undefined ? 'missing' : value.kind === 'string' ? '""' : describeFound(value);
    errors.push(
      `cells[${index}].name`,
      'bad-label-value',
      `The label ${labelAddress} of ${name} holds ${found}, but a label must be a non-empty text`,
    );
  }
}

/** Freezes a plain JSON-like value and everything under it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/**
 * Validates a Level_Document and builds its Level and Sheet. Never throws and never mutates the input.
 * Stages: guard, shape, cells, entities; then, only if no error exists, the Sheet build and the
 * placement checks; then normalize and freeze.
 */
export function loadLevel(doc: unknown, random: RandomSource): LoadResult {
  try {
    const guard = guardValue(doc);
    if (!guard.ok) {
      return { ok: false, errors: [makeError('', guard.code, guard.message)] };
    }
    const errors = createErrorCollector();
    checkDocument(doc, errors);
    const info = checkCells(doc, errors);
    checkEntities(doc, errors, info);
    if (errors.count > 0) return { ok: false, errors: errors.finish() };

    const sheet = buildSheet(doc, info, random, errors);
    if (sheet === undefined) return { ok: false, errors: errors.finish() };
    checkPlacement(sheet, doc, info, errors);
    if (errors.count > 0) return { ok: false, errors: errors.finish() };

    const level: Level = deepFreeze(normalize(doc as LevelDocument));
    return { ok: true, level, sheet };
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
