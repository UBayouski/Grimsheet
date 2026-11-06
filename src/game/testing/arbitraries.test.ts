import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../model/index';
import {
  actionListArbitrary,
  ALL_ADDRESSES,
  assertProperty,
  gameLevelArbitrary,
  seededRandom,
  stateDifference,
  type StateLike,
} from './arbitraries';

function isWellFormed(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v['kind']) {
    case 'wait':
    case 'undo':
      return true;
    case 'move':
      return v['dir'] === 'N' || v['dir'] === 'S' || v['dir'] === 'E' || v['dir'] === 'W';
    case 'edit':
      return typeof v['address'] === 'string' && typeof v['raw'] === 'string';
    default:
      return false;
  }
}

describe('gameLevelArbitrary', () => {
  it('generates documents of the expected shape', () => {
    assertProperty(
      fc.property(gameLevelArbitrary, (doc) => {
        expect(doc.map).toHaveLength(12);
        for (const row of doc.map) expect(row).toMatch(/^[#.X^]{12}$/);
        expect(doc.monsters.length).toBeLessThanOrEqual(4);
        expect(doc.startingHp).toBeGreaterThanOrEqual(1);
        expect(doc.startingHp).toBeLessThanOrEqual(20);
        expect(doc.ink).toBeGreaterThanOrEqual(0);
        expect(doc.ink).toBeLessThanOrEqual(5);
        const byAddress = new Map(doc.cells.map((c) => [c.address, c]));
        for (const cell of doc.cells) {
          if (cell.name === undefined) continue;
          const row = Number(cell.address.slice(1));
          expect(row).toBeGreaterThanOrEqual(14);
          expect(row).toBeLessThanOrEqual(20);
          const left = ALL_ADDRESSES[ALL_ADDRESSES.indexOf(cell.address) - 1] as string;
          const label = byAddress.get(left);
          expect(label?.raw.length ?? 0).toBeGreaterThan(0);
          expect(Number.isNaN(Number(label?.raw))).toBe(true);
        }
        doc.monsters.forEach((m, i) => {
          expect(m.move).toBe(`MOVE_M${i + 1}`);
          expect(m.atk).toBe(`ATK_M${i + 1}`);
          expect(byAddress.get(m.at)).toBeUndefined();
        });
        expect(new Set(doc.monsters.map((m) => m.at)).size).toBe(doc.monsters.length);
      }),
      200,
    );
  });

  it('every generated document is accepted by the model loader', () => {
    assertProperty(
      fc.property(gameLevelArbitrary, (doc) => {
        const result = loadLevel(doc, seededRandom(1));
        if (!result.ok) {
          const lines = result.errors.map((e) => `  ${e.code} at ${e.path || '(root)'}: ${e.message}`);
          throw new Error(`gameLevelArbitrary produced a refused document:\n${lines.join('\n')}`);
        }
      }),
      300,
    );
  });
});

describe('actionListArbitrary', () => {
  it('makes lists of 0 to 40 entries that include malformed values', () => {
    const lists = fc.sample(actionListArbitrary, { numRuns: 300, seed: 7 });
    for (const list of lists) {
      expect(list.length).toBeGreaterThanOrEqual(0);
      expect(list.length).toBeLessThanOrEqual(40);
    }
    const all = lists.flat();
    expect(all.some((a) => !isWellFormed(a))).toBe(true);
    expect(all.some((a) => isWellFormed(a))).toBe(true);
    expect(lists.some((l) => l.length === 0)).toBe(true);
  });
});

describe('stateDifference', () => {
  const level = {};
  const base: StateLike = {
    hero: 'B2',
    hp: 5,
    ink: 2,
    turn: 0,
    status: 'playing',
    rngState: 1,
    valuesHero: 'B2',
    valuesRngState: 1,
    edits: [],
    monsters: [{ id: 'M1', at: 'C3', move: 'MOVE_M1', atk: 'ATK_M1' }],
    level,
    undoSnapshot: null,
  };

  it('is undefined for equal states', () => {
    expect(stateDifference(base, { ...base, edits: [], monsters: [...(base.monsters as unknown[])] })).toBeUndefined();
  });

  it('names the first differing field', () => {
    expect(stateDifference(base, { ...base, hp: 4 })).toBe('hp');
    expect(stateDifference(base, { ...base, hero: 'B3', hp: 4 })).toBe('hero');
    expect(stateDifference(base, { ...base, edits: [{ address: 'A1', raw: 'x' }] })).toBe('edits');
    expect(stateDifference(base, { ...base, monsters: [] })).toBe('monsters');
    expect(stateDifference(base, { ...base, level: {} })).toBe('level');
  });

  it('compares cells through a reader and the snapshot recursively', () => {
    const readCell = (s: StateLike, a: string): readonly [unknown, unknown] =>
      [a, s === base ? 1 : a === 'D4' ? 2 : 1];
    expect(stateDifference(base, { ...base }, { readCell })).toBe('cell D4');
    const snap = { ...base, level: undefined, undoSnapshot: undefined };
    const a = { ...base, undoSnapshot: snap };
    const b = { ...base, undoSnapshot: { ...snap, ink: 9 } };
    expect(stateDifference(a, b)).toBe('undoSnapshot.ink');
    expect(stateDifference(a, b, { ignoreSnapshot: true })).toBeUndefined();
    expect(stateDifference(a, base)).toBe('undoSnapshot');
  });
});

describe('source', () => {
  it('does not use Math.random', () => {
    const text = readFileSync(new URL('./arbitraries.ts', import.meta.url), 'utf8');
    expect(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toContain('Math.random');
  });
});
