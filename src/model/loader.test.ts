import { afterEach, describe, expect, it, vi } from 'vitest';
import { getValueByAddress, setRawText } from '../engine/index';
import * as recalculatorModule from '../engine/recalculator';
import * as sheetModule from '../engine/sheet';
import {
  buildSheet,
  checkCells,
  checkEntities,
  checkPlacement,
  createErrorCollector,
  loadLevel,
  loadLevelText,
  quote,
} from './loader';
import type { LoadError, LoadErrorCode, LoadResult } from './types';

const random = (): number => 0.5;

const MAP_ROW = '############';

function baseDoc(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: '01-the-corridor',
    title: 'The Corridor',
    hint: 'Walk to the exit.',
    startingHp: 5,
    ink: 3,
    seed: 7,
    hero: { at: 'B2' },
    monsters: [],
    map: Array.from({ length: 12 }, () => MAP_ROW),
    cells: [],
  };
}

function errorsOf(result: LoadResult): readonly LoadError[] {
  if (result.ok) throw new Error('expected a failure');
  return result.errors;
}

function codesOf(doc: unknown): LoadErrorCode[] {
  return errorsOf(loadLevel(doc, random)).map((e) => e.code);
}

function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...baseDoc(), [field]: value };
}

describe('loadLevel: Requirement 2 boundaries', () => {
  it('accepts HP 1 and refuses HP 0', () => {
    expect(codesOf(withField('startingHp', 1))).not.toContain('bad-hp');
    expect(codesOf(withField('startingHp', 0))).toContain('bad-hp');
    expect(codesOf(withField('startingHp', 1.5))).toContain('bad-hp');
  });

  it('accepts ink 0 and refuses ink -1', () => {
    expect(codesOf(withField('ink', 0))).not.toContain('bad-ink');
    expect(codesOf(withField('ink', -1))).toContain('bad-ink');
  });

  it('accepts an id of 40 characters and refuses 41', () => {
    const forty = '01-' + 'a'.repeat(37);
    expect(forty).toHaveLength(40);
    expect(codesOf(withField('id', forty))).not.toContain('bad-id');
    expect(codesOf(withField('id', forty + 'a'))).toContain('bad-id');
  });

  it('refuses ids with the wrong pattern', () => {
    for (const id of ['', 'the-corridor', '1-a', '01-A', '01--a', '01-a-']) {
      expect(codesOf(withField('id', id))).toContain('bad-id');
    }
  });

  it('accepts seeds 0 and 4294967295 and refuses 4294967296', () => {
    expect(codesOf(withField('seed', 0))).not.toContain('bad-seed');
    expect(codesOf(withField('seed', 4294967295))).not.toContain('bad-seed');
    expect(codesOf(withField('seed', 4294967296))).toContain('bad-seed');
    expect(codesOf(withField('seed', -1))).toContain('bad-seed');
    expect(codesOf(withField('seed', 1.5))).toContain('bad-seed');
  });

  it('refuses schemaVersion 2', () => {
    const errors = errorsOf(loadLevel(withField('schemaVersion', 2), random));
    expect(errors.map((e) => e.code)).toContain('bad-schema-version');
    expect(errors.find((e) => e.code === 'bad-schema-version')?.path).toBe('schemaVersion');
  });

  it('refuses a bad title and a bad hint', () => {
    expect(codesOf(withField('title', ''))).toContain('bad-title');
    expect(codesOf(withField('title', ' padded'))).toContain('bad-title');
    expect(codesOf(withField('title', 'x'.repeat(61)))).toContain('bad-title');
    expect(codesOf(withField('hint', ''))).toContain('bad-hint');
    expect(codesOf(withField('hint', 'two\nlines'))).toContain('bad-hint');
    expect(codesOf(withField('hint', 'x'.repeat(161)))).toContain('bad-hint');
  });
});

describe('loadLevel: Requirement 3 shape', () => {
  it('refuses a root that is not an object', () => {
    for (const value of [null, [], 5, 'text', true, undefined]) {
      const errors = errorsOf(loadLevel(value, random));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe('not-an-object');
      expect(errors[0]?.path).toBe('');
    }
  });

  it('reports a missing field by path', () => {
    const doc = baseDoc();
    delete doc['title'];
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'missing-field', path: 'title' }));
  });

  it('reports every missing root field', () => {
    const errors = errorsOf(loadLevel({}, random));
    const paths = errors.filter((e) => e.code === 'missing-field').map((e) => e.path);
    expect(paths).toHaveLength(11);
  });

  it('names an unknown field and lists the allowed ones', () => {
    const doc = { ...baseDoc(), lokced: true };
    const errors = errorsOf(loadLevel(doc, random));
    const found = errors.find((e) => e.code === 'unknown-field');
    expect(found?.path).toBe('lokced');
    expect(found?.message).toContain('"lokced"');
    for (const name of ['schemaVersion', 'id', 'title', 'hint', 'map', 'cells', 'hero', 'monsters', 'startingHp', 'ink', 'seed']) {
      expect(found?.message).toContain(name);
    }
  });

  it('reports unknown fields inside cells, hero and monsters', () => {
    const doc = baseDoc();
    doc['cells'] = [{ address: 'A14', raw: 'x', lokced: true }];
    doc['hero'] = { at: 'B2', extra: 1 };
    doc['monsters'] = [{ id: 'M1', at: 'C3', move: 'A1', atk: 'A2', extra: 1 }];
    const paths = errorsOf(loadLevel(doc, random))
      .filter((e) => e.code === 'unknown-field')
      .map((e) => e.path);
    expect(paths).toEqual(['cells[0].lokced', 'hero.extra', 'monsters[0].extra']);
  });

  it('treats NaN and Infinity as wrong types', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const errors = errorsOf(loadLevel(withField('startingHp', value), random));
      expect(errors).toContainEqual(expect.objectContaining({ code: 'wrong-type', path: 'startingHp' }));
    }
  });

  it('refuses wrong types', () => {
    expect(codesOf(withField('id', 5))).toContain('wrong-type');
    expect(codesOf(withField('title', null))).toContain('wrong-type');
    expect(codesOf(withField('ink', '3'))).toContain('wrong-type');
    expect(codesOf(withField('map', 'rows'))).toContain('wrong-type');
    expect(codesOf(withField('cells', {}))).toContain('wrong-type');
    expect(codesOf(withField('hero', []))).toContain('wrong-type');
    expect(codesOf(withField('monsters', null))).toContain('wrong-type');
    expect(codesOf(withField('cells', [5]))).toContain('wrong-type');
    expect(codesOf(withField('cells', [{ address: 1, raw: 'x' }]))).toContain('wrong-type');
    expect(codesOf(withField('cells', [{ address: 'A14', raw: 'x', locked: 'yes' }]))).toContain('wrong-type');
  });

  it('caps cells at 240 and monsters at 16', () => {
    const cells = Array.from({ length: 241 }, () => ({ address: 'A14', raw: 'x' }));
    const monsters = Array.from({ length: 17 }, (_, i) => ({ id: `M${i}`, at: 'C3', move: 'A1', atk: 'A2' }));
    const cellErrors = errorsOf(loadLevel(withField('cells', cells), random));
    expect(cellErrors).toContainEqual(expect.objectContaining({ code: 'too-many-items', path: 'cells' }));
    const monsterErrors = errorsOf(loadLevel(withField('monsters', monsters), random));
    expect(monsterErrors).toContainEqual(expect.objectContaining({ code: 'too-many-items', path: 'monsters' }));
  });

  it('allows exactly 240 cells and 16 monsters through the shape stage', () => {
    const cells = Array.from({ length: 240 }, () => ({ address: 'A14', raw: 'x' }));
    const monsters = Array.from({ length: 16 }, (_, i) => ({ id: `M${i}`, at: 'C3', move: 'A1', atk: 'A2' }));
    const doc = { ...baseDoc(), cells, monsters };
    expect(codesOf(doc)).not.toContain('too-many-items');
  });
});

describe('loadLevel: Requirement 4 map', () => {
  it('refuses a wrong row count', () => {
    const doc = baseDoc();
    doc['map'] = Array.from({ length: 11 }, () => MAP_ROW);
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'bad-map-size', path: 'map' }));
    doc['map'] = Array.from({ length: 13 }, () => MAP_ROW);
    expect(codesOf(doc)).toContain('bad-map-size');
  });

  it('refuses a wrong row length', () => {
    const doc = baseDoc();
    const map = Array.from({ length: 12 }, () => MAP_ROW);
    map[3] = '###########';
    doc['map'] = map;
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'bad-map-row', path: 'map[3]' }));
    map[3] = MAP_ROW + '#';
    expect(codesOf(doc)).toContain('bad-map-row');
  });

  it('refuses a non-string row', () => {
    const doc = baseDoc();
    const map: unknown[] = Array.from({ length: 12 }, () => MAP_ROW);
    map[0] = 5;
    doc['map'] = map;
    expect(errorsOf(loadLevel(doc, random))).toContainEqual(
      expect.objectContaining({ code: 'wrong-type', path: 'map[0]' }),
    );
  });

  it('names the row, column and glyph of a bad glyph', () => {
    const doc = baseDoc();
    const map = Array.from({ length: 12 }, () => MAP_ROW);
    map[2] = '###?########';
    doc['map'] = map;
    const found = errorsOf(loadLevel(doc, random)).find((e) => e.code === 'bad-map-glyph');
    expect(found?.path).toBe('map[2]');
    expect(found?.message).toContain('row 3');
    expect(found?.message).toContain('column D');
    expect(found?.message).toContain('"?"');
  });

  it('accepts all four glyphs', () => {
    const doc = baseDoc();
    const map = Array.from({ length: 12 }, () => MAP_ROW);
    map[1] = '#.X^########';
    doc['map'] = map;
    // The document is now fully valid and loads, so there may be no errors at all.
    const result = loadLevel(doc, random);
    expect(result.ok ? [] : result.errors.map((e) => e.code)).not.toContain('bad-map-glyph');
  });
});

describe('loadLevel: error order and cap', () => {
  it('reports scalar fields, then map, then cells, hero, monsters, then unknown root fields', () => {
    const doc = {
      zzz: 1,
      monsters: 5,
      hero: 5,
      cells: 5,
      map: 5,
      seed: -1,
      ink: -1,
      startingHp: 0,
      hint: '',
      title: '',
      id: 'bad',
      schemaVersion: 2,
    };
    const paths = errorsOf(loadLevel(doc, random)).map((e) => e.path);
    expect(paths).toEqual([
      'schemaVersion',
      'id',
      'title',
      'hint',
      'startingHp',
      'ink',
      'seed',
      'map',
      'cells',
      'hero',
      'monsters',
      'zzz',
    ]);
  });

  it('is stable: the same bad input gives the same errors', () => {
    const doc = { ...baseDoc(), startingHp: 0, extra: 1 };
    expect(loadLevel(doc, random)).toEqual(loadLevel(doc, random));
  });

  it('keeps 50 errors and adds a marker with the exact count', () => {
    const doc = baseDoc();
    doc['map'] = Array.from({ length: 12 }, () => '????????????');
    // 144 bad glyphs.
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toHaveLength(51);
    expect(errors.slice(0, 50).every((e) => e.code === 'bad-map-glyph')).toBe(true);
    const marker = errors[50];
    expect(marker?.code).toBe('too-many-errors');
    expect(marker?.path).toBe('');
    expect(marker?.message).toContain('94');
  });

  it('adds no marker at exactly 50 errors', () => {
    const doc = baseDoc();
    const map = Array.from({ length: 12 }, () => MAP_ROW);
    // 12 + 12 + 12 + 12 + 2 = 50 bad glyphs.
    for (let i = 0; i < 4; i += 1) map[i] = '????????????';
    map[4] = '??##########';
    doc['map'] = map;
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toHaveLength(50);
    expect(errors.some((e) => e.code === 'too-many-errors')).toBe(false);
  });

  it('keeps every message between 1 and 300 characters', () => {
    const doc = { ...baseDoc(), ['x'.repeat(5000)]: 1, id: 'y'.repeat(5000) };
    for (const e of errorsOf(loadLevel(doc, random))) {
      expect(e.message.length).toBeGreaterThanOrEqual(1);
      expect(e.message.length).toBeLessThanOrEqual(300);
    }
  });
});

describe('quote', () => {
  it('keeps short text whole', () => {
    expect(quote('abc')).toBe('"abc"');
  });

  it('escapes control characters and quotes', () => {
    expect(quote('a"b\n')).toBe('"a\\"b\\n"');
  });

  it('truncates at 40 code points with an ellipsis', () => {
    expect(quote('a'.repeat(40))).toBe(`"${'a'.repeat(40)}"`);
    expect(quote('a'.repeat(41))).toBe(`"${'a'.repeat(40)}…"`);
  });

  it('counts code points, not UTF-16 units', () => {
    const text = '😀'.repeat(41);
    expect(quote(text)).toBe(`"${'😀'.repeat(40)}…"`);
  });

  it('truncates a long unknown field name in its message', () => {
    const doc = { ...baseDoc(), ['k'.repeat(100)]: 1 };
    const found = errorsOf(loadLevel(doc, random)).find((e) => e.code === 'unknown-field');
    expect(found?.message).toContain('k'.repeat(40) + '…');
    expect(found?.message).not.toContain('k'.repeat(41));
  });
});

describe('loadLevel: safety', () => {
  it('turns a throwing getter into internal-error', () => {
    const doc = baseDoc();
    Object.defineProperty(doc, 'title', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('internal-error');
    expect(errors[0]?.message).toContain('boom');
  });

  it('refuses non-plain values such as a Date or a class instance', () => {
    expect(codesOf({ ...baseDoc(), title: new Date() })).toEqual(['not-an-object']);
    class Thing {}
    expect(codesOf(new Thing())).toEqual(['not-an-object']);
  });

  it('refuses a document nested deeper than 100 levels', () => {
    let nested: unknown = 1;
    for (let i = 0; i < 150; i += 1) nested = [nested];
    expect(codesOf({ ...baseDoc(), extra: nested })).toEqual(['too-deep']);
  });

  it('does not mutate the input', () => {
    const doc = { ...baseDoc(), startingHp: 0, lokced: true };
    const before = JSON.stringify(doc);
    const frozen = structuredClone(doc);
    loadLevel(doc, random);
    expect(JSON.stringify(doc)).toBe(before);
    expect(doc).toEqual(frozen);
  });

  it('accepts a frozen input', () => {
    const doc = Object.freeze({ ...baseDoc(), startingHp: 0 });
    expect(codesOf(doc)).toContain('bad-hp');
  });

  it('never throws on odd values', () => {
    const odd: unknown[] = [undefined, null, 0, '', [], {}, () => 1, Symbol('s'), 10n, new Map()];
    for (const value of odd) {
      expect(() => loadLevel(value, random)).not.toThrow();
    }
  });
});

describe('loadLevelText', () => {
  it('refuses text over 200,000 characters before parsing', () => {
    const errors = errorsOf(loadLevelText(' '.repeat(200_001), random));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('too-large');
  });

  it('does not call it too large at exactly 200,000 characters', () => {
    const errors = errorsOf(loadLevelText(' '.repeat(200_000), random));
    expect(errors[0]?.code).toBe('invalid-json');
  });

  it('reports invalid JSON', () => {
    for (const text of ['', '{', '{"a":}', 'nope', '{"a":1,}']) {
      const errors = errorsOf(loadLevelText(text, random));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe('invalid-json');
      expect(errors[0]?.path).toBe('');
    }
  });

  it('reports a position when the parser gives one', () => {
    const text = '{"a":}';
    let parserMessage = '';
    try {
      JSON.parse(text);
    } catch (error) {
      parserMessage = error instanceof Error ? error.message : '';
    }
    const hasPosition = /position \d+|line \d+ column \d+/.test(parserMessage);
    const message = errorsOf(loadLevelText(text, random))[0]?.message ?? '';
    if (hasPosition) expect(message).toMatch(/position \d+|line \d+, column \d+/);
    else expect(message).toBe('The text is not valid JSON.');
  });

  it('reports deep text as too-deep', () => {
    const text = '['.repeat(150) + ']'.repeat(150);
    const errors = errorsOf(loadLevelText(text, random));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('too-deep');
  });

  it('survives very deep text within the size limit', () => {
    const text = '['.repeat(100_000) + ']'.repeat(100_000);
    const errors = errorsOf(loadLevelText(text, random));
    expect(errors).toHaveLength(1);
    expect(['too-deep', 'too-large']).toContain(errors[0]?.code);
  });

  it('gives the same result as the value loader for parsed text', () => {
    const docs: unknown[] = [
      baseDoc(),
      { ...baseDoc(), startingHp: 0, lokced: true },
      [],
      null,
      5,
      {},
    ];
    for (const doc of docs) {
      expect(loadLevelText(JSON.stringify(doc), random)).toEqual(loadLevel(JSON.parse(JSON.stringify(doc)) as unknown, random));
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 5: cell specs, layout and labels
// ---------------------------------------------------------------------------

function withCells(cells: unknown[]): Record<string, unknown> {
  return { ...baseDoc(), cells };
}

function cellErrors(cells: unknown[]): readonly LoadError[] {
  return errorsOf(loadLevel(withCells(cells), random));
}

/** A label cell in column A with a rule cell beside it, in the rules panel. */
const LABEL = { address: 'A14', raw: 'Damage' };

describe('loadLevel: Requirement 5 addresses and raw text', () => {
  it('refuses a malformed address and one outside the sheet (criterion 1)', () => {
    for (const address of ['', 'M1', 'A21', 'A0', '1A', 'AA1', 'A 1']) {
      const errors = cellErrors([{ address, raw: 'x' }]);
      const hit = errors.find((e) => e.code === 'bad-address');
      expect(hit?.path).toBe('cells[0].address');
      expect(hit?.message).toContain('columns A to L and rows 1 to 20');
    }
  });

  it('refuses row 13 with its own message (criterion 2)', () => {
    const errors = cellErrors([{ address: 'C13', raw: 'x' }]);
    const hit = errors.find((e) => e.code === 'reserved-row');
    expect(hit?.path).toBe('cells[0].address');
    expect(hit?.message).toContain('row 13');
    expect(hit?.message).toContain('reserved');
    expect(errors.map((e) => e.code)).not.toContain('bad-address');
  });

  it('refuses a duplicate address, even when only the case differs (criterion 3)', () => {
    const errors = cellErrors([
      { address: 'B3', raw: 'x' },
      { address: 'b3', raw: 'y' },
    ]);
    const hit = errors.find((e) => e.code === 'duplicate-address');
    expect(hit?.path).toBe('cells[1].address');
    expect(hit?.message).toContain('B3');
    expect(hit?.message).toContain('cells[0]');
    expect(errors.filter((e) => e.code === 'duplicate-address')).toHaveLength(1);
  });

  it('accepts lower-case addresses and the corners of the sheet', () => {
    const codes = cellErrors([
      { address: 'a1', raw: 'x' },
      { address: 'L12', raw: 'x' },
      { address: 'A20', raw: 'x' },
    ]).map((e) => e.code);
    expect(codes).not.toContain('bad-address');
    expect(codes).not.toContain('reserved-row');
    expect(codes).not.toContain('duplicate-address');
  });

  it('accepts raw of 500 characters and refuses 501 (criterion 4)', () => {
    const ok = cellErrors([{ address: 'A1', raw: 'x'.repeat(500) }]).map((e) => e.code);
    expect(ok).not.toContain('bad-raw');
    const errors = cellErrors([{ address: 'A1', raw: 'x'.repeat(501) }]);
    const hit = errors.find((e) => e.code === 'bad-raw');
    expect(hit?.path).toBe('cells[0].raw');
    expect(hit?.message).toContain('500');
  });

  it('keeps a long formula from reaching the parser', () => {
    const errors = cellErrors([{ address: 'A1', raw: '=' + '1+'.repeat(300) + '1' }]);
    expect(errors.map((e) => e.code)).toEqual(['bad-raw']);
  });

  it('reports a formula parse error with the engine text and the address (criterion 5)', () => {
    const errors = cellErrors([{ address: 'c5', raw: '=1+' }]);
    const hit = errors.find((e) => e.code === 'formula-parse');
    expect(hit?.path).toBe('cells[0].raw');
    expect(hit?.message).toMatch(/Col \d+: .+\./);
    expect(hit?.message).toContain('C5');
  });

  it('accepts a valid formula and plain text', () => {
    const codes = cellErrors([
      { address: 'A1', raw: '=1+2' },
      { address: 'B1', raw: 'hello' },
      { address: 'C1', raw: '' },
    ]).map((e) => e.code);
    expect(codes).not.toContain('formula-parse');
    expect(codes).not.toContain('bad-raw');
  });
});

describe('loadLevel: Requirement 5 locked flag', () => {
  it('reports a non-boolean locked once, as wrong-type (criterion 6)', () => {
    const errors = cellErrors([{ address: 'A1', raw: 'x', locked: 'yes' }]);
    const hits = errors.filter((e) => e.path === 'cells[0].locked');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.code).toBe('wrong-type');
  });

  it('accepts an omitted locked flag (criterion 7)', () => {
    const codes = cellErrors([{ address: 'A1', raw: 'x' }]).map((e) => e.code);
    expect(codes).not.toContain('wrong-type');
    expect(codes).not.toContain('missing-field');
  });
});

describe('loadLevel: Requirement 5 names', () => {
  const failures: [string, string][] = [
    ['1abc', 'letters, digits and underscores'],
    ['has space', 'letters, digits and underscores'],
    ['hero', 'reserved'],
    ['Self', 'reserved'],
    ['sum', 'function name'],
    ['toward', 'function name'],
    ['B9', 'cell address'],
    ['z12', 'cell address'],
  ];

  it.each(failures)('refuses the name %s and says why (criterion 8)', (name, reason) => {
    const errors = cellErrors([{ address: 'B3', raw: 'x', name }]);
    const hit = errors.find((e) => e.code === 'bad-name');
    expect(hit?.path).toBe('cells[0].name');
    expect(hit?.message).toContain(reason);
    expect(hit?.message).toContain(JSON.stringify(name));
  });

  it('names all four failed checks with different messages', () => {
    const messages = ['1abc', 'HERO', 'SUM', 'B9'].map(
      (name) => cellErrors([{ address: 'B3', raw: 'x', name }]).find((e) => e.code === 'bad-name')?.message,
    );
    expect(new Set(messages).size).toBe(4);
  });

  it('refuses a duplicate name under case-insensitive comparison (criterion 9)', () => {
    const errors = cellErrors([
      { address: 'B3', raw: 'x', name: 'Door' },
      { address: 'C3', raw: 'y', name: 'DOOR' },
    ]);
    const hit = errors.find((e) => e.code === 'duplicate-name');
    expect(hit?.path).toBe('cells[1].name');
    expect(hit?.message).toContain('DOOR');
    expect(hit?.message).toContain('B3');
  });

  it('keeps a name when the raw of the same cell failed', () => {
    const doc = withCells([
      { address: 'B3', raw: '=1+', name: 'Door' },
      { address: 'C3', raw: 'y', name: 'door' },
    ]);
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors.map((e) => e.code)).toContain('formula-parse');
    const dup = errors.find((e) => e.code === 'duplicate-name');
    expect(dup?.path).toBe('cells[1].name');
    expect(dup?.message).toContain('B3');
  });

  it('accepts a name in the map area without a label (criterion 13)', () => {
    const codes = cellErrors([{ address: 'B3', raw: '.', name: 'Floor_Cell' }]).map((e) => e.code);
    expect(codes).not.toContain('missing-label');
    expect(codes).not.toContain('bad-name');
  });
});

describe('loadLevel: Requirement 5 panel labels', () => {
  it('accepts a named panel cell with a text label (criterion 11)', () => {
    const codes = cellErrors([LABEL, { address: 'B14', raw: '3', name: 'DMG' }]).map((e) => e.code);
    expect(codes).not.toContain('missing-label');
    expect(codes).not.toContain('label-is-named');
  });

  it('refuses a missing or empty left cell', () => {
    for (const cells of [
      [{ address: 'B14', raw: '3', name: 'DMG' }],
      [{ address: 'A14', raw: '' }, { address: 'B14', raw: '3', name: 'DMG' }],
    ]) {
      const hit = cellErrors(cells).find((e) => e.code === 'missing-label');
      expect(hit?.path).toBe('cells[' + (cells.length - 1) + '].name');
      expect(hit?.message).toContain('DMG');
      expect(hit?.message).toContain('A14');
    }
  });

  it('refuses a left cell that holds a formula', () => {
    const hit = cellErrors([
      { address: 'A14', raw: '=1' },
      { address: 'B14', raw: '3', name: 'DMG' },
    ]).find((e) => e.code === 'missing-label');
    expect(hit?.path).toBe('cells[1].name');
    expect(hit?.message).toContain('A14');
  });

  it('says column A has no label cell', () => {
    const hit = cellErrors([{ address: 'A15', raw: '3', name: 'DMG' }]).find((e) => e.code === 'missing-label');
    expect(hit?.path).toBe('cells[0].name');
    expect(hit?.message).toContain('column A');
    expect(hit?.message).toContain('no label');
  });

  it('refuses a label cell that is itself named (criterion 12)', () => {
    const errors = cellErrors([
      { address: 'A14', raw: 'Damage', name: 'LBL' },
      { address: 'B14', raw: '3', name: 'DMG' },
    ]);
    const hit = errors.find((e) => e.code === 'label-is-named');
    expect(hit?.path).toBe('cells[0].name');
    expect(hit?.message).toContain('label');
  });

  it('checks the label with the effective raw of the left cell, row by row', () => {
    const codes = cellErrors([
      { address: 'A16', raw: 'Label' },
      { address: 'B16', raw: '1', name: 'ONE' },
      { address: 'A17', raw: 'Label' },
      { address: 'C17', raw: '1', name: 'TWO' },
    ]).map((e) => e.code);
    expect(codes.filter((c) => c === 'missing-label')).toHaveLength(1);
  });
});

describe('loadLevel: Requirement 5 raw is stored as written', () => {
  it('keeps raw text exactly, with no trimming or case folding (criterion 10)', () => {
    const errors = createErrorCollector();
    const raws = ['  padded  ', '=sum(1,2)', '= 1 +   2', 'Mixed Case'];
    const doc = withCells(raws.map((raw, i) => ({ address: `${'ABCD'.charAt(i)}1`, raw, name: `n${i}` })));
    const info = checkCells(doc, errors);
    expect(info.effective.get('A1')).toBe('  padded  ');
    expect(info.effective.get('B1')).toBe('=sum(1,2)');
    expect(info.effective.get('C1')).toBe('= 1 +   2');
    expect(info.effective.get('D1')).toBe('Mixed Case');
  });

  it('stores addresses and names in upper case', () => {
    const errors = createErrorCollector();
    const info = checkCells(withCells([{ address: 'b3', raw: 'x', name: 'door' }]), errors);
    expect(errors.count).toBe(0);
    expect(info.names.get('DOOR')).toBe('B3');
    expect(info.indexByAddress.get('B3')).toBe(0);
  });

  it('lets a spec raw replace the map character in the effective sheet', () => {
    const errors = createErrorCollector();
    const info = checkCells(withCells([{ address: 'B2', raw: 'X' }]), errors);
    expect(info.effective.get('A1')).toBe('#');
    expect(info.effective.get('B2')).toBe('X');
  });

  it('does not change the document', () => {
    const doc = withCells([{ address: 'b3', raw: ' =1+ ', name: 'door' }, LABEL]);
    const before = JSON.stringify(doc);
    loadLevel(doc, random);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Requirement 7: hero and monster placement
// ---------------------------------------------------------------------------

const RULE_CELLS = [
  { address: 'A14', raw: 'Move' },
  { address: 'B14', raw: '="N"', name: 'MOVE_M1' },
  { address: 'A15', raw: 'Attack' },
  { address: 'B15', raw: '1', name: 'ATK_M1' },
];

function monster(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'M1', at: 'C3', move: 'MOVE_M1', atk: 'ATK_M1', ...overrides };
}

function entityDoc(monsters: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...baseDoc(), cells: RULE_CELLS, monsters, ...extra };
}

/** Runs the cell stage, then only the entity stage, and returns the entity errors. */
function entityErrors(doc: Record<string, unknown>): readonly LoadError[] {
  const cellStage = createErrorCollector();
  const info = checkCells(doc, cellStage);
  const entityStage = createErrorCollector();
  checkEntities(doc, entityStage, info);
  return entityStage.finish();
}

describe('loadLevel: Requirement 7 monster ids', () => {
  it('accepts well-formed ids up to 8 characters (criterion 4)', () => {
    expect(entityErrors(entityDoc([monster({ id: 'M1' })]))).toEqual([]);
    expect(entityErrors(entityDoc([monster({ id: 'M1234567' })]))).toEqual([]);
  });

  it('refuses bad ids at monsters[i].id (criterion 4)', () => {
    for (const id of ['', 'M', 'M0', 'M01', 'm1', 'X1', 'M1a', 'M12345678']) {
      const errors = entityErrors(entityDoc([monster({ id })]));
      expect(errors).toContainEqual(expect.objectContaining({ code: 'bad-monster-id', path: 'monsters[0].id' }));
    }
  });

  it('refuses a duplicate id at the later monster and names the id (criterion 5)', () => {
    const errors = entityErrors(entityDoc([monster(), monster({ at: 'D3' })]));
    const dupes = errors.filter((e) => e.code === 'duplicate-monster-id');
    expect(dupes).toHaveLength(1);
    expect(dupes[0]?.path).toBe('monsters[1].id');
    expect(dupes[0]?.message).toContain('M1');
  });
});

describe('loadLevel: Requirement 7 positions', () => {
  it('refuses a hero outside the map area (criterion 1)', () => {
    const errors = entityErrors(entityDoc([], { hero: { at: 'B14' } }));
    const hit = errors.find((e) => e.path === 'hero.at');
    expect(hit?.code).toBe('bad-address');
    expect(hit?.message).toContain('rows 1 to 12');
  });

  it('refuses a monster outside the map area at monsters[i].at (criterion 6)', () => {
    for (const at of ['B14', 'Z9', 'A13', 'nope']) {
      const errors = entityErrors(entityDoc([monster({ at })]));
      expect(errors).toContainEqual(expect.objectContaining({ code: 'bad-address', path: 'monsters[0].at' }));
    }
  });

  it('refuses a monster on the hero and names the hero (criterion 8)', () => {
    const errors = entityErrors(entityDoc([monster({ at: 'B2' })]));
    const hit = errors.find((e) => e.code === 'entity-overlap');
    expect(hit?.path).toBe('monsters[0].at');
    expect(hit?.message).toContain('hero');
    expect(hit?.message).toContain('B2');
  });

  it('refuses a monster on an earlier monster at the later path (criterion 8)', () => {
    const errors = entityErrors(entityDoc([monster(), monster({ id: 'M2', at: 'c3' })]));
    const hit = errors.find((e) => e.code === 'entity-overlap');
    expect(hit?.path).toBe('monsters[1].at');
    expect(hit?.message).toContain('M1');
  });

  it('skips overlap checks for an at that failed (criterion 8)', () => {
    const errors = entityErrors(
      entityDoc([monster({ at: 'Z99' }), monster({ id: 'M2', at: 'Z99' })], { hero: { at: 'Z99' } }),
    );
    expect(errors.some((e) => e.code === 'entity-overlap')).toBe(false);
    expect(errors.filter((e) => e.code === 'bad-address').map((e) => e.path)).toEqual([
      'hero.at',
      'monsters[0].at',
      'monsters[1].at',
    ]);
  });
});

describe('loadLevel: Requirement 7 rule names', () => {
  it('uses the form "monster M1: move rule MOVE_X is not a named cell" (criterion 9)', () => {
    const errors = entityErrors(entityDoc([monster({ move: 'MOVE_X' })]));
    const hit = errors.find((e) => e.code === 'unknown-rule');
    expect(hit?.path).toBe('monsters[0].move');
    expect(hit?.message).toBe('monster M1: move rule MOVE_X is not a named cell');
  });

  it('reports atk at monsters[i].atk (criterion 9)', () => {
    const errors = entityErrors(entityDoc([monster({ atk: 'ATK_X' })]));
    const hit = errors.find((e) => e.code === 'unknown-rule');
    expect(hit?.path).toBe('monsters[0].atk');
    expect(hit?.message).toBe('monster M1: atk rule ATK_X is not a named cell');
  });

  it('adds no unknown-rule when the named cell has a failed raw (criterion 9)', () => {
    const cells = [...RULE_CELLS, { address: 'A16', raw: 'Bad' }, { address: 'B16', raw: '=1+', name: 'MOVE_B' }];
    const doc = entityDoc([monster({ move: 'MOVE_B' })], { cells });
    expect(cellErrorsOf(doc).map((e) => e.code)).toContain('formula-parse');
    expect(entityErrors(doc).some((e) => e.code === 'unknown-rule')).toBe(false);
  });

  it('adds no unknown-rule when the named cell failed its address or name check (criterion 9)', () => {
    const badAddress = [...RULE_CELLS, { address: 'Z99', raw: '1', name: 'MOVE_C' }];
    expect(entityErrors(entityDoc([monster({ move: 'MOVE_C' })], { cells: badAddress }))).toEqual([]);
    const missingLabel = [...RULE_CELLS, { address: 'B17', raw: '1', name: 'MOVE_D' }];
    expect(entityErrors(entityDoc([monster({ move: 'move_d' })], { cells: missingLabel }))).toEqual([]);
  });

  it('compares rule names without regard to case (criterion 9)', () => {
    expect(entityErrors(entityDoc([monster({ move: 'move_m1', atk: 'Atk_M1' })]))).toEqual([]);
  });

  it('refuses a rule cell outside the rules panel (criterion 10)', () => {
    const cells = [...RULE_CELLS, { address: 'B3', raw: '="N"', name: 'MOVE_MAP' }];
    const errors = entityErrors(entityDoc([monster({ move: 'MOVE_MAP' })], { cells }));
    const hit = errors.find((e) => e.code === 'bad-rule-cell');
    expect(hit?.path).toBe('monsters[0].move');
    expect(hit?.message).toContain('B3');
    expect(hit?.message).toContain('rows 14 to 20');
  });

  it('refuses a panel rule cell whose raw is empty (criterion 10)', () => {
    const cells = [{ address: 'A14', raw: 'Move' }, { address: 'B14', raw: '', name: 'MOVE_M1' }, ...RULE_CELLS.slice(2)];
    const errors = entityErrors(entityDoc([monster()], { cells }));
    const hit = errors.find((e) => e.code === 'bad-rule-cell');
    expect(hit?.path).toBe('monsters[0].move');
    expect(hit?.message).toContain('B14');
    expect(hit?.message).toContain('rows 14 to 20');
  });

  it('writes a lower-case rule name in upper case (criterion 11)', () => {
    const cells = lowerNamedCells();
    const errors = entityErrors(entityDoc([monster({ move: 'move_low' })], { cells }));
    const hit = errors.find((e) => e.code === 'bad-rule-cell');
    expect(hit?.message).toContain('MOVE_LOW');
    expect(hit?.message).not.toContain('move_low');
    const info = checkCells(entityDoc([], { cells }), createErrorCollector());
    expect(info.names.get('MOVE_LOW')).toBe('B3');
  });

  it('keeps the monsters in author order (criterion 11)', () => {
    const errors = entityErrors(entityDoc([monster({ id: 'M2', at: 'C3' }), monster({ id: 'M1', at: 'C3' })]));
    expect(errors.find((e) => e.code === 'entity-overlap')?.path).toBe('monsters[1].at');
  });
});

describe('loadLevel: Requirement 7 empty monsters', () => {
  it('accepts an empty monsters list (criterion 12)', () => {
    expect(entityErrors(entityDoc([]))).toEqual([]);
    expect(codesOf(entityDoc([]))).not.toContain('missing-field');
  });

  it('does not change the document', () => {
    const doc = entityDoc([monster({ move: 'move_m1' }), monster({ id: 'M2', at: 'B2' })]);
    const before = JSON.stringify(doc);
    loadLevel(doc, random);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

function cellErrorsOf(doc: Record<string, unknown>): readonly LoadError[] {
  const collector = createErrorCollector();
  checkCells(doc, collector);
  return collector.finish();
}

/** A lower-case named cell outside the panel, so the rule is refused with its upper-case name. */
function lowerNamedCells(): unknown[] {
  return [...RULE_CELLS, { address: 'B3', raw: '1', name: 'move_low' }];
}

// ---------------------------------------------------------------------------
// Task 3.4: sheet construction, placement checks, final result
// ---------------------------------------------------------------------------

/** A small playable level: walls round the edge, an exit at K3, one monster at C3. */
function playableMap(): string[] {
  const rows: string[] = Array.from({ length: 12 }, (_, r) => (r === 0 || r === 11 ? '############' : '#..........#'));
  rows[2] = '#.........X#';
  return rows;
}

function playableDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...baseDoc(),
    map: playableMap(),
    hero: { at: 'B2' },
    monsters: [monster()],
    cells: [...RULE_CELLS],
    ...over,
  };
}

/** `playableDoc` with one extra Cell_Spec. */
function playableWith(spec: Record<string, unknown>, over: Record<string, unknown> = {}): Record<string, unknown> {
  return playableDoc({ cells: [...RULE_CELLS, spec], ...over });
}

function loaded(doc: unknown): Extract<LoadResult, { ok: true }> {
  const result = loadLevel(doc, random);
  if (!result.ok) throw new Error('expected a load, got ' + JSON.stringify(result.errors));
  return result;
}

describe('loadLevel: a valid document loads', () => {
  it('returns a Level and a recalculated Sheet', () => {
    const result = loaded(playableDoc());
    expect(result.level.id).toBe('01-the-corridor');
    const b14 = getValueByAddress(result.sheet, 'B14');
    expect(b14).toMatchObject({ ok: true, value: { kind: 'string', value: 'N' }, stale: false });
    expect(getValueByAddress(result.sheet, 'K3')).toMatchObject({ value: { kind: 'string', value: 'X' } });
  });

  it('accepts ink 0 and an empty monsters list', () => {
    expect(loadLevel(playableDoc({ ink: 0, monsters: [], cells: [] }), random).ok).toBe(true);
  });

  it('applies map characters first and then the specs', () => {
    const result = loaded(playableWith({ address: 'D5', raw: '7' }));
    expect(getValueByAddress(result.sheet, 'D5')).toMatchObject({ value: { kind: 'number', value: 7 } });
    expect(getValueByAddress(result.sheet, 'E5')).toMatchObject({ value: { kind: 'string', value: '.' } });
  });
});

describe('loadLevel: Requirement 7 hero placement after recalculation', () => {
  it('refuses a hero on a wall with the documented message (criterion 2)', () => {
    const errors = errorsOf(loadLevel(playableDoc({ hero: { at: 'A1' } }), random));
    expect(errors).toEqual([{ path: 'hero.at', code: 'hero-blocked', message: 'hero start A1 is a wall (#)' }]);
  });

  it('refuses a hero on an error cell, naming the error', () => {
    const errors = errorsOf(loadLevel(playableWith({ address: 'B2', raw: '=1/0' }), random));
    expect(errors).toEqual([{ path: 'hero.at', code: 'hero-blocked', message: 'hero start B2 is #DIV/0!' }]);
  });

  it('refuses a hero on a non-terrain value', () => {
    const errors = errorsOf(loadLevel(playableWith({ address: 'B2', raw: '5' }), random));
    expect(errors[0]?.code).toBe('hero-blocked');
    expect(errors[0]?.message).toBe('hero start B2 is 5, which is not walkable');
  });

  it('accepts a hero on floor, exit and trap (criterion 3)', () => {
    for (const [glyph, address] of [['.', 'B2'], ['X', 'B2'], ['^', 'B2']] as const) {
      const map = playableMap();
      map[1] = '#' + glyph + '.........#';
      expect(loadLevel(playableDoc({ map, hero: { at: address } }), random).ok).toBe(true);
    }
  });

  it('accepts a hero whose cell is a formula that gives a walkable glyph', () => {
    expect(loadLevel(playableWith({ address: 'B2', raw: '="^"' }), random).ok).toBe(true);
  });
});

describe('loadLevel: Requirement 7 monster placement after recalculation', () => {
  function monsterAt(glyphRow: number, glyph: string): Record<string, unknown> {
    const map = playableMap();
    const row = Array.from(map[glyphRow - 1] ?? '');
    row[2] = glyph; // column C
    map[glyphRow - 1] = row.join('');
    return playableDoc({ map, monsters: [monster({ at: `C${glyphRow}` })] });
  }

  it('refuses a monster on exit, trap and wall, naming the id, address, value and floor (criterion 7)', () => {
    for (const [glyph, found] of [['X', '"X"'], ['^', '"^"'], ['#', 'a wall (#)']] as const) {
      const errors = errorsOf(loadLevel(monsterAt(4, glyph), random));
      expect(errors).toEqual([
        {
          path: 'monsters[0].at',
          code: 'monster-not-on-floor',
          message: `monster M1 at C4 is ${found}, but monsters start on floor (.)`,
        },
      ]);
    }
  });

  it('refuses a monster on an error cell', () => {
    const doc = playableWith({ address: 'C3', raw: '=1/0' });
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors[0]?.code).toBe('monster-not-on-floor');
    expect(errors[0]?.message).toBe('monster M1 at C3 is #DIV/0!, but monsters start on floor (.)');
  });

  it('accepts a monster on floor, including a formula that gives "."', () => {
    expect(loadLevel(monsterAt(4, '.'), random).ok).toBe(true);
    expect(loadLevel(playableWith({ address: 'C3', raw: '="."' }), random).ok).toBe(true);
  });

  it('reports the hero first, then monsters in list order', () => {
    const map = playableMap();
    map[2] = '#.##......X#';
    const doc = playableDoc({
      map,
      hero: { at: 'A1' },
      monsters: [monster({ id: 'M1', at: 'C3' }), monster({ id: 'M2', at: 'D3' })],
    });
    expect(errorsOf(loadLevel(doc, random)).map((e) => e.path)).toEqual(['hero.at', 'monsters[0].at', 'monsters[1].at']);
  });
});

describe('loadLevel: Requirement 5 criterion 14, label Values after recalculation', () => {
  it('refuses a label whose literal is a number', () => {
    const doc = playableDoc({
      cells: [{ address: 'A14', raw: '5' }, { address: 'B14', raw: '3', name: 'DMG' }],
      monsters: [],
    });
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors).toEqual([
      {
        path: 'cells[1].name',
        code: 'bad-label-value',
        message: 'The label A14 of DMG holds 5, but a label must be a non-empty text',
      },
    ]);
  });

  it('reports one error per bad label, in cells order', () => {
    const doc = playableDoc({
      cells: [
        { address: 'A14', raw: '5' },
        { address: 'B14', raw: '3', name: 'ONE' },
        { address: 'A15', raw: 'ok' },
        { address: 'B15', raw: '3', name: 'TWO' },
        { address: 'A16', raw: '-2.5' },
        { address: 'B16', raw: '3', name: 'THREE' },
      ],
      monsters: [],
    });
    const errors = errorsOf(loadLevel(doc, random));
    expect(errors.map((e) => e.path)).toEqual(['cells[1].name', 'cells[5].name']);
    expect(errors[1]?.message).toBe('The label A16 of THREE holds -2.5, but a label must be a non-empty text');
  });

  it('does not check a map-area name for a label (criterion 13)', () => {
    expect(loadLevel(playableWith({ address: 'D5', raw: '.', name: 'SPOT' }), random).ok).toBe(true);
  });

  it('refuses formula labels with missing-label first, so Values are never reached (criterion 11)', () => {
    for (const raw of ['=2+3', '=1=1', '=1/0', '=""']) {
      const doc = playableDoc({
        cells: [{ address: 'A14', raw }, { address: 'B14', raw: '3', name: 'DMG' }],
        monsters: [],
      });
      const errors = errorsOf(loadLevel(doc, random));
      expect(errors.map((e) => e.code)).toEqual(['missing-label']);
    }
  });

  it('checkPlacement itself reports number, boolean, error and empty-string label Values', () => {
    const cases: [string, string][] = [
      ['=2+3', '5'],
      ['=1=1', 'TRUE'],
      ['=1/0', '#DIV/0!'],
      ['=""', '""'],
    ];
    for (const [raw, found] of cases) {
      // Bypass the pre-recalculation label rule: take the names from a clean document, then put the formula in.
      const clean = playableDoc({
        cells: [{ address: 'A14', raw: 'Label' }, { address: 'B14', raw: '3', name: 'DMG' }],
        monsters: [],
      });
      const info = checkCells(clean, createErrorCollector());
      const built = createErrorCollector();
      const sheet = buildSheet(clean, info, random, built);
      expect(built.count).toBe(0);
      if (sheet === undefined) throw new Error('no sheet');
      expect(setRawText(sheet, 'A14', raw).accepted).toBe(true);
      sheetRecalc(sheet);
      const errors = createErrorCollector();
      checkPlacement(sheet, clean, info, errors);
      expect(errors.finish()).toEqual([
        {
          path: 'cells[1].name',
          code: 'bad-label-value',
          message: `The label A14 of DMG holds ${found}, but a label must be a non-empty text`,
        },
      ]);
    }
  });
});

function sheetRecalc(sheet: Parameters<typeof getValueByAddress>[0]): void {
  const result = recalculatorModule.recalculate(sheet, { heroAddress: { col: 2, row: 2 }, random });
  expect(result.accepted).toBe(true);
}

describe('loadLevel: post-recalculation checks are skipped after an earlier error (Requirement 8.1)', () => {
  it('adds no placement error and no note when a scalar field failed', () => {
    const errors = errorsOf(loadLevel(playableDoc({ hero: { at: 'A1' }, startingHp: 0 }), random));
    expect(errors.map((e) => e.code)).toEqual(['bad-hp']);
  });

  it('adds no placement error when a formula failed to parse', () => {
    const doc = playableWith({ address: 'D5', raw: '=1+' }, { hero: { at: 'A1' } });
    expect(errorsOf(loadLevel(doc, random)).map((e) => e.code)).toEqual(['formula-parse']);
  });

  it('adds no label-value error when a monster rule is unknown', () => {
    const doc = playableDoc({
      cells: [{ address: 'A14', raw: '5' }, { address: 'B14', raw: '3', name: 'DMG' }],
      monsters: [monster({ move: 'NOPE', atk: 'DMG' })],
    });
    expect(errorsOf(loadLevel(doc, random)).map((e) => e.code)).toEqual(['unknown-rule']);
  });
});

describe('loadLevel: Requirement 6 independent Sheets', () => {
  function allValues(sheet: Parameters<typeof getValueByAddress>[0]): unknown[] {
    const out: unknown[] = [];
    for (let r = 1; r <= 20; r += 1) {
      for (const c of 'ABCDEFGHIJKL') {
        const read = getValueByAddress(sheet, `${c}${r}`);
        out.push(read.ok ? read.value : read.error);
      }
    }
    return out;
  }

  it('two loads give equal Values and a separate Sheet each (criterion 4)', () => {
    const doc = playableWith({ address: 'D5', raw: '=RAND()' });
    const first = loaded(doc);
    const second = loaded(doc);
    expect(first.sheet).not.toBe(second.sheet);
    expect(allValues(first.sheet)).toEqual(allValues(second.sheet));
  });

  it('an edit to one Sheet leaves the other unchanged', () => {
    const doc = playableDoc();
    const first = loaded(doc);
    const second = loaded(doc);
    const before = allValues(second.sheet);
    expect(setRawText(first.sheet, 'D5', '99').accepted).toBe(true);
    expect(allValues(second.sheet)).toEqual(before);
    expect(getValueByAddress(second.sheet, 'D5')).toMatchObject({ value: { kind: 'string', value: '.' }, stale: false });
  });

  it('uses the supplied Random_Source for the first recalculation (criterion 2)', () => {
    const doc = playableWith({ address: 'D5', raw: '=RAND()' });
    const result = loadLevel(doc, () => 0.25);
    if (!result.ok) throw new Error('expected a load');
    expect(getValueByAddress(result.sheet, 'D5')).toMatchObject({ value: { kind: 'number', value: 0.25 } });
  });
});

describe('loadLevel: the final Level', () => {
  it('is normalized and deep-frozen', () => {
    const doc = playableWith({ address: 'd5', raw: '.', locked: true, name: 'spot' });
    const { level } = loaded(doc);
    expect(Object.isFrozen(level)).toBe(true);
    expect(Object.isFrozen(level.hero)).toBe(true);
    expect(Object.isFrozen(level.map)).toBe(true);
    expect(Object.isFrozen(level.cells)).toBe(true);
    expect(Object.isFrozen(level.monsters)).toBe(true);
    expect(level.cells.every((c) => Object.isFrozen(c))).toBe(true);
    expect(level.monsters.every((m) => Object.isFrozen(m))).toBe(true);
    expect(() => {
      (level as { title: string }).title = 'changed';
    }).toThrow();
    // Normalized: upper-case address and name, the locked flag kept.
    expect(level.cells.find((c) => c.address === 'D5')).toEqual({ address: 'D5', raw: '.', locked: true, name: 'SPOT' });
  });

  it('shares no object with the input document', () => {
    const doc = playableDoc();
    const { level } = loaded(doc);
    expect(level.map).not.toBe(doc['map']);
    expect(level.cells).not.toBe(doc['cells']);
    expect(level.monsters).not.toBe(doc['monsters']);
    expect(level.hero).not.toBe(doc['hero']);
    const firstMonster = (doc['monsters'] as { at: string }[])[0];
    if (firstMonster !== undefined) firstMonster.at = 'Z9';
    expect(level.monsters[0]?.at).toBe('C3');
  });

  it('holds no reference to the Sheet and keeps the Locked_Flag only in the Level (Requirement 6.6)', () => {
    const { level, sheet } = loaded(playableWith({ address: 'D5', raw: '3', locked: true }));
    expect(Object.keys(level).sort()).toEqual(
      ['cells', 'hero', 'hint', 'id', 'ink', 'map', 'monsters', 'schemaVersion', 'seed', 'startingHp', 'title'].sort(),
    );
    expect(Object.values(level)).not.toContain(sheet);
    expect(JSON.stringify(level)).toContain('"locked":true');
    // The engine's read result has no locked field at all.
    expect(getValueByAddress(sheet, 'D5')).not.toHaveProperty('locked');
  });

  it('does not change the input document', () => {
    const doc = playableWith({ address: 'd5', raw: ' =1+ ', locked: false });
    const before = JSON.stringify(doc);
    loadLevel(doc, random);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('loadLevel: engine refusals (Requirement 6.5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns a setRawText refusal into engine-refused with the engine text and no Sheet', () => {
    vi.spyOn(sheetModule, 'setRawText').mockImplementation(() => ({
      accepted: false,
      error: { kind: 'invalid-address' },
    }));
    const result = loadLevel(playableDoc(), random);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('sheet');
    const errors = errorsOf(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('engine-refused');
    expect(errors[0]?.message).toContain('invalid-address');
  });

  it('turns a setCellName refusal into engine-refused at the name path', () => {
    vi.spyOn(sheetModule, 'setCellName').mockImplementation(() => ({
      accepted: false,
      error: { kind: 'invalid-name', failed: 'reserved' },
    }));
    const errors = errorsOf(loadLevel(playableDoc(), random));
    expect(errors[0]?.code).toBe('engine-refused');
    expect(errors[0]?.path).toMatch(/^cells\[\d+\]\.name$/);
    expect(errors[0]?.message).toContain('reserved');
  });

  it('turns a recalculate refusal into engine-refused', () => {
    vi.spyOn(recalculatorModule, 'recalculate').mockImplementation(() => ({
      accepted: false,
      error: { kind: 'invalid-context', field: 'random' },
    }));
    const errors = errorsOf(loadLevel(playableDoc(), random));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('engine-refused');
    expect(errors[0]?.message).toContain('invalid-context');
    expect(errors[0]?.message).toContain('random');
  });

  it('turns an engine exception into a single internal-error', () => {
    vi.spyOn(recalculatorModule, 'recalculate').mockImplementation(() => {
      throw new Error('forced fault');
    });
    const errors = errorsOf(loadLevel(playableDoc(), random));
    expect(errors.map((e) => e.code)).toEqual(['internal-error']);
  });
});

describe('loadLevelText: a valid document', () => {
  it('gives the same result as the value loader', () => {
    const doc = playableDoc();
    const fromText = loadLevelText(JSON.stringify(doc), random);
    const fromValue = loaded(doc);
    if (!fromText.ok) throw new Error('expected a load');
    expect(fromText.level).toEqual(fromValue.level);
  });
});
