import { describe, expect, it } from 'vitest';
import {
  absOf,
  andOf,
  argModeAt,
  arityAccepts,
  colOf,
  distOf,
  FUNCTION_TABLE,
  lookupFunction,
  maxOf,
  minOf,
  modOf,
  notOf,
  orOf,
  rowOf,
  sumOf,
  towardOf,
} from './functions';

const pt = (row: number, col: number) => ({ row, col });

describe('arity', () => {
  const cases: ReadonlyArray<readonly [string, number, number | null]> = [
    ['SUM', 1, null],
    ['MIN', 1, null],
    ['MAX', 1, null],
    ['ABS', 1, 1],
    ['MOD', 2, 2],
    ['IF', 3, 3],
    ['AND', 1, null],
    ['OR', 1, null],
    ['NOT', 1, 1],
    ['ROW', 1, 1],
    ['COL', 1, 1],
    ['DIST', 2, 2],
    ['TOWARD', 1, 1],
    ['RAND', 0, 0],
  ];

  it.each(cases)('%s accepts %i..%s arguments', (name, min, max) => {
    const spec = lookupFunction(name);
    expect(spec).toBeDefined();
    if (!spec) return;
    expect(spec.min).toBe(min);
    expect(spec.max).toBe(max);
    expect(arityAccepts(spec, min)).toBe(true);
    if (min > 0) expect(arityAccepts(spec, min - 1)).toBe(false);
    if (max === null) expect(arityAccepts(spec, 50)).toBe(true);
    else expect(arityAccepts(spec, max + 1)).toBe(false);
  });

  it('has exactly the frozen function set', () => {
    expect([...FUNCTION_TABLE.keys()].sort()).toEqual(
      ['ABS', 'AND', 'COL', 'DIST', 'IF', 'MAX', 'MIN', 'MOD', 'NOT', 'OR', 'RAND', 'ROW', 'SUM', 'TOWARD'].sort(),
    );
  });

  it('looks up case-insensitively and rejects unknown names', () => {
    expect(lookupFunction('sum')?.name).toBe('SUM');
    expect(lookupFunction('NOPE')).toBeUndefined();
  });

  it('repeats the last argument mode for variadic functions', () => {
    const sum = lookupFunction('SUM');
    if (!sum) throw new Error('missing SUM');
    expect(argModeAt(sum, 0)).toBe('rangeOrValue');
    expect(argModeAt(sum, 5)).toBe('rangeOrValue');
    const rand = lookupFunction('RAND');
    if (!rand) throw new Error('missing RAND');
    expect(argModeAt(rand, 0)).toBeUndefined();
  });
});

describe('SUM / MIN / MAX', () => {
  it('sums numbers, and nothing is 0', () => {
    expect(sumOf([1, 2, 3.5])).toBe(6.5);
    expect(sumOf([])).toBe(0);
  });

  it('finds min and max', () => {
    expect(minOf([3, -1, 2])).toBe(-1);
    expect(maxOf([3, -1, 2])).toBe(3);
  });

  it('flags nothing as undefined (#VALUE!)', () => {
    expect(minOf([])).toBeUndefined();
    expect(maxOf([])).toBeUndefined();
  });
});

describe('ABS', () => {
  it('returns the magnitude', () => {
    expect(absOf(-4)).toBe(4);
    expect(absOf(4)).toBe(4);
    expect(absOf(0)).toBe(0);
  });
});

describe('MOD', () => {
  it('takes the sign of the divisor', () => {
    expect(modOf(7, 3)).toEqual({ ok: true, value: 1 });
    expect(modOf(-7, 3)).toEqual({ ok: true, value: 2 });
    expect(modOf(7, -3)).toEqual({ ok: true, value: -2 });
    expect(modOf(-7, -3)).toEqual({ ok: true, value: -1 });
  });

  it('returns 0 for exact multiples, never -0', () => {
    const r = modOf(-6, 3);
    expect(r).toEqual({ ok: true, value: 0 });
    if (r.ok) expect(Object.is(r.value, 0)).toBe(true);
  });

  it('flags a zero divisor as #DIV/0!', () => {
    expect(modOf(5, 0)).toEqual({ ok: false, error: '#DIV/0!' });
    expect(modOf(5, -0)).toEqual({ ok: false, error: '#DIV/0!' });
  });
});

describe('boolean helpers', () => {
  it('AND', () => {
    expect(andOf([true, true])).toBe(true);
    expect(andOf([true, false])).toBe(false);
  });

  it('OR', () => {
    expect(orOf([false, true])).toBe(true);
    expect(orOf([false, false])).toBe(false);
  });

  it('NOT', () => {
    expect(notOf(true)).toBe(false);
    expect(notOf(false)).toBe(true);
  });
});

describe('ROW / COL / DIST', () => {
  it('reads the 1-based row and column', () => {
    expect(rowOf(pt(9, 2))).toBe(9);
    expect(colOf(pt(9, 2))).toBe(2);
  });

  it('computes Manhattan distance', () => {
    expect(distOf(pt(1, 1), pt(4, 5))).toBe(7);
    expect(distOf(pt(4, 5), pt(1, 1))).toBe(7);
    expect(distOf(pt(3, 3), pt(3, 3))).toBe(0);
  });
});

describe('TOWARD', () => {
  const self = pt(5, 5);

  it('goes in all four directions', () => {
    expect(towardOf(self, pt(1, 5))).toBe('N');
    expect(towardOf(self, pt(9, 5))).toBe('S');
    expect(towardOf(self, pt(5, 9))).toBe('E');
    expect(towardOf(self, pt(5, 1))).toBe('W');
  });

  it('follows the axis with the larger distance', () => {
    expect(towardOf(self, pt(4, 9))).toBe('E');
    expect(towardOf(self, pt(8, 4))).toBe('S');
  });

  it('breaks ties vertically', () => {
    expect(towardOf(self, pt(7, 7))).toBe('S');
    expect(towardOf(self, pt(3, 3))).toBe('N');
    expect(towardOf(self, pt(3, 7))).toBe('N');
  });

  it("returns '-' when already there", () => {
    expect(towardOf(self, pt(5, 5))).toBe('-');
  });
});
