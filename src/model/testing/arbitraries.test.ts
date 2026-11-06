import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../loader';
import {
  anyStringArbitrary,
  assertProperty,
  buildDeepNesting,
  deepNestingArbitrary,
  deterministicShuffle,
  invalidDocumentArbitrary,
  jsonValueArbitrary,
  measureDepth,
  mutatedDocumentArbitrary,
  normalizeOracle,
  seededRandom,
  validDocumentArbitrary,
} from './arbitraries';

describe('validDocumentArbitrary loads', () => {
  it('every one of 200 generated valid documents loads with ok: true', () => {
    // A generator that breaks validity fails here first, with the loader's errors in the message.
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const result = loadLevel(doc, seededRandom(1));
        if (!result.ok) {
          const lines = result.errors.map((e) => `  ${e.code} at ${e.path || '(root)'}: ${e.message}`);
          throw new Error(
            `validDocumentArbitrary produced a document the loader refuses:\n${lines.join('\n')}\n` +
              `Cells: ${JSON.stringify(doc.cells)}`,
          );
        }
      }),
      200,
    );
  });

  it('puts names only in the Map_Area unless a labelled rule slot made them', () => {
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        for (const cell of doc.cells) {
          if (cell.name === undefined) continue;
          const row = Number(cell.address.slice(1));
          if (row >= 14) expect(cell.name.toUpperCase()).toMatch(/^RULE_\d+$/);
        }
      }),
      100,
    );
  });
});

describe('validDocumentArbitrary', () => {
  it('generates documents of the expected shape', () => {
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        expect(doc.schemaVersion).toBe(1);
        expect(doc.map).toHaveLength(12);
        for (const row of doc.map) expect(row).toMatch(/^[#.X^]{12}$/);
        expect(doc.monsters.length).toBeLessThanOrEqual(16);
        expect(doc.cells.length).toBeLessThanOrEqual(240);
        expect(doc.cells.length).toBeGreaterThan(0);
        expect(doc.hero.at).toMatch(/^[A-L]([1-9]|1[0-2])$/);
      }),
      40,
    );
  });

  it('keeps entities off blocking overrides and addresses unique', () => {
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const addresses = doc.cells.map((c) => c.address.toUpperCase());
        expect(new Set(addresses).size).toBe(addresses.length);
        const names = doc.cells.flatMap((c) => (c.name === undefined ? [] : [c.name.toUpperCase()]));
        expect(new Set(names).size).toBe(names.length);
        const entityAddresses = [doc.hero.at, ...doc.monsters.map((m) => m.at)];
        expect(new Set(entityAddresses).size).toBe(entityAddresses.length);
        for (const at of entityAddresses) {
          const spec = doc.cells.find((c) => c.address.toUpperCase() === at);
          if (spec !== undefined) expect(['.', 'X', '^']).toContain(spec.raw);
        }
        for (const cell of doc.cells) expect(cell.address).not.toMatch(/^[A-La-l]13$/);
      }),
      40,
    );
  });
});

describe('normalizeOracle', () => {
  it('is idempotent on its own output', () => {
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const once = normalizeOracle(doc);
        expect(normalizeOracle(once)).toEqual(once);
      }),
      40,
    );
  });

  it('folds, drops and sorts as the rules say', () => {
    const doc = {
      schemaVersion: 1 as const,
      id: '01-x',
      title: 'T',
      hint: 'H',
      startingHp: 3,
      ink: 0,
      seed: 1,
      hero: { at: 'a1' },
      monsters: [],
      map: Array.from({ length: 12 }, () => '.'.repeat(12)),
      cells: [
        { address: 'c3', raw: 'zz', name: 'who', locked: false },
        { address: 'b2', raw: 'X' },
        { address: 'a2', raw: '.' },
        { address: 'a1', raw: '5', locked: true },
        { address: 'a15', raw: '' },
      ],
    };
    const out = normalizeOracle(doc);
    expect(out.map[1]?.charAt(1)).toBe('X');
    expect(out.cells).toEqual([
      { address: 'A1', raw: '5', locked: true },
      { address: 'C3', raw: 'zz', name: 'WHO' },
    ]);
    expect(out.hero.at).toBe('A1');
  });
});

describe('invalidDocumentArbitrary', () => {
  it('differs from its valid base', () => {
    assertProperty(
      fc.property(invalidDocumentArbitrary, ({ base, doc }) => {
        expect(doc).not.toEqual(base);
        expect(doc.map).toHaveLength(12);
        expect(doc.monsters.length).toBeLessThanOrEqual(16);
      }),
      60,
    );
  });
});

describe('invalidDocumentArbitrary loads', () => {
  it('every generated invalid document loads with ok: false', () => {
    assertProperty(
      fc.property(invalidDocumentArbitrary, ({ doc }) => {
        expect(loadLevel(doc, seededRandom(1)).ok).toBe(false);
      }),
      100,
    );
  });
});

describe('mutatedDocumentArbitrary and jsonValueArbitrary', () => {
  it('produce plain JSON-compatible values', () => {
    assertProperty(
      fc.property(fc.oneof(mutatedDocumentArbitrary, jsonValueArbitrary), (value) => {
        expect(JSON.parse(JSON.stringify(value))).toEqual(value);
      }),
      40,
    );
  });
});

describe('anyStringArbitrary', () => {
  it('stays within 300,000 characters', () => {
    assertProperty(
      fc.property(anyStringArbitrary, (text) => {
        expect(typeof text).toBe('string');
        expect(text.length).toBeLessThanOrEqual(300000);
      }),
      30,
    );
  });
});

describe('deepNestingArbitrary', () => {
  it('reaches the stated depth as a value and as text', () => {
    assertProperty(
      fc.property(deepNestingArbitrary, (nesting) => {
        expect(nesting.depth).toBeGreaterThanOrEqual(101);
        expect(nesting.depth).toBeLessThanOrEqual(5000);
        expect(measureDepth(nesting.value)).toBe(nesting.depth);
        expect(Array.isArray(nesting.value)).toBe(false);
        expect(measureDepth(JSON.parse(nesting.text))).toBe(nesting.depth);
      }),
      20,
    );
  });

  it('builds both forms at the minimum depth', () => {
    expect(measureDepth(buildDeepNesting('array', 101).value)).toBe(101);
    expect(measureDepth(buildDeepNesting('object', 101).value)).toBe(101);
  });
});

describe('seededRandom', () => {
  it('is repeatable and stays in [0, 1)', () => {
    assertProperty(
      fc.property(fc.integer({ min: 0, max: 4294967295 }), (seed) => {
        const a = seededRandom(seed);
        const b = seededRandom(seed);
        for (let i = 0; i < 50; i++) {
          const x = a();
          expect(x).toBe(b());
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
      50,
    );
  });

  it('shuffles deterministically without losing items', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const first = deterministicShuffle(items, 7);
    expect(deterministicShuffle(items, 7)).toEqual(first);
    expect([...first].sort((a, b) => a - b)).toEqual(items);
  });
});

describe('source hygiene', () => {
  it('never uses the unseeded random function', () => {
    const source = readFileSync(new URL('./arbitraries.ts', import.meta.url), 'utf8');
    expect(source.includes(['Math', 'random'].join('.'))).toBe(false);
    expect(source).not.toMatch(/from ['"]\.\.\/serializer['"]/);
  });
});
