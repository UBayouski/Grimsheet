import { describe, expect, it } from 'vitest';
import { createRandom, seedOf } from './random';

function draw(g: { next(): number }, n: number): number[] {
  return Array.from({ length: n }, () => g.next());
}

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(createRandom(42), 20)).toEqual(draw(createRandom(42), 20));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(createRandom(1), 5)).not.toEqual(draw(createRandom(2), 5));
  });

  it('keeps 10,000 draws in [0, 1)', () => {
    const g = createRandom(7);
    for (const v of draw(g, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes the same sequence from an exposed state', () => {
    const g = createRandom(99);
    draw(g, 13);
    const resumed = createRandom(0, g.state);
    expect(draw(resumed, 20)).toEqual(draw(g, 20));
  });

  it('ignores the seed when a state is given', () => {
    expect(draw(createRandom(5, 123), 5)).toEqual(draw(createRandom(0, 123), 5));
  });

  it('works for seeds 0 and 4294967295', () => {
    for (const seed of [0, 4294967295]) {
      const g = createRandom(seed);
      expect(g.state).toBe(seed);
      for (const v of draw(g, 100)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});

describe('seedOf', () => {
  it('returns valid seeds', () => {
    expect(seedOf({ seed: 0 })).toBe(0);
    expect(seedOf({ seed: 12345 })).toBe(12345);
    expect(seedOf({ seed: 4294967295 })).toBe(4294967295);
  });

  it('returns 0 for invalid values', () => {
    for (const seed of [-1, 1.5, 4294967296, '7', Number.NaN]) {
      expect(seedOf({ seed })).toBe(0);
    }
  });

  it('returns 0 for a missing field, null and non-objects', () => {
    expect(seedOf({})).toBe(0);
    expect(seedOf(null)).toBe(0);
    expect(seedOf(5)).toBe(0);
    expect(seedOf('seed')).toBe(0);
    expect(seedOf(undefined)).toBe(0);
  });

  it('ignores inherited seed properties', () => {
    expect(seedOf(Object.create({ seed: 9 }))).toBe(0);
  });
});
