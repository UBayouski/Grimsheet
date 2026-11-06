import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '../ast';
import { parseFormula } from '../parser';
import { printFormula } from '../printer';
import {
  assertProperty,
  buildContext,
  chainDefinitions,
  contextSpecArbitrary,
  deterministicShuffle,
  mulberry32,
  sheetCaseArbitrary,
  totalityScenarioArbitrary,
  validAstArbitrary,
} from './arbitraries';

describe('arbitraries smoke test', () => {
  it('produces samples from every arbitrary', () => {
    expect(fc.sample(validAstArbitrary, { numRuns: 20, seed: 1 })).toHaveLength(20);
    const sheets = fc.sample(sheetCaseArbitrary, { numRuns: 20, seed: 2 });
    expect(sheets).toHaveLength(20);
    for (const s of sheets) {
      expect(s.definitions.length).toBeGreaterThanOrEqual(1);
      expect(s.definitions.length).toBeLessThanOrEqual(50);
    }
    const contexts = fc.sample(contextSpecArbitrary, { numRuns: 20, seed: 3 });
    for (const c of contexts) buildContext(c);
    expect(fc.sample(totalityScenarioArbitrary, { numRuns: 20, seed: 4 })).toHaveLength(20);
  });

  it('generated ASTs print and parse', () => {
    for (const ast of fc.sample(validAstArbitrary, { numRuns: 100, seed: 5 })) {
      const printed = printFormula(ast);
      expect(printed.ok).toBe(true);
      if (printed.ok) expect(parseFormula(printed.text).ok).toBe(true);
    }
  });

  it('prints a hand-built depth 6 AST', () => {
    let ast: Node = { kind: 'number', value: 1 };
    // Right-nested binary nodes of equal precedence force a parenthesis at every level.
    for (let i = 0; i < 6; i++) {
      ast = { kind: 'binary', op: '-', left: { kind: 'number', value: 2 }, right: ast };
    }
    const printed = printFormula(ast);
    expect(printed.ok).toBe(true);
    if (printed.ok) {
      const depth = (printed.text.match(/\(/g) ?? []).length;
      expect(depth).toBeGreaterThanOrEqual(5);
    }
  });

  it('seeded source is deterministic, counts calls and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const v = a.random();
      expect(v).toBe(b.random());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(a.calls()).toBe(50);
  });

  it('shuffle is deterministic and a permutation', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const s1 = deterministicShuffle(items, 11);
    expect(s1).toEqual(deterministicShuffle(items, 11));
    expect([...s1].sort((x, y) => x - y)).toEqual(items);
  });

  it('chain scenarios cover the Sheet', () => {
    expect(chainDefinitions('ref-chain-forward')).toHaveLength(240);
    expect(chainDefinitions('long-range-formulas')[0]?.rawText.length).toBeLessThanOrEqual(10_000);
    expect(parseFormula(chainDefinitions('long-range-formulas')[0]?.rawText ?? '').ok).toBe(true);
  });

  it('assertProperty runs a property', () => {
    assertProperty(
      fc.property(fc.nat(), (n) => n >= 0),
      10,
    );
  });

  it('does not use Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      fc.sample(sheetCaseArbitrary, { numRuns: 10, seed: 9 });
      fc.sample(totalityScenarioArbitrary, { numRuns: 10, seed: 9 });
      deterministicShuffle([1, 2, 3], 1);
      mulberry32(1).random();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
