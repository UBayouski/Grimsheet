import type { RandomGenerator } from './types';

/**
 * Seeded generator (mulberry32) with one unsigned 32-bit state.
 * When `state` is given, `seed` is ignored.
 */
export function createRandom(seed: number, state?: number): RandomGenerator {
  let s = (state ?? seed) >>> 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state(): number {
      return s;
    },
  };
}

/** Own property `seed` of a plain object when an integer in 0..4294967295, otherwise 0. */
export function seedOf(doc: unknown): number {
  if (typeof doc !== 'object' || doc === null) return 0;
  if (!Object.prototype.hasOwnProperty.call(doc, 'seed')) return 0;
  const seed = (doc as { seed?: unknown }).seed;
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295
    ? seed
    : 0;
}
