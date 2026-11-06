import { describe, expect, it } from 'vitest';
import { checkCells, createErrorCollector, loadLevel, loadLevelText, quote } from './loader';
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
    expect(codesOf(doc)).not.toContain('bad-map-glyph');
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
