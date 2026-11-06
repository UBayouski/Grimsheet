import { describe, expect, it } from 'vitest';
import { loadLevel, loadLevelText, quote } from './loader';
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
