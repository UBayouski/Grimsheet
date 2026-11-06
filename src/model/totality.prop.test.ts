import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadLevel, loadLevelText } from './loader';
import {
  anyStringArbitrary,
  assertProperty,
  deepNestingArbitrary,
  jsonValueArbitrary,
  mutatedDocumentArbitrary,
  seededRandom,
} from './testing/arbitraries';
import { LOAD_ERROR_CODES } from './types';
import type { LoadResult } from './types';

const NUM_RUNS = 100;
const KNOWN_CODES: readonly string[] = LOAD_ERROR_CODES;

/** A result is well formed when it is ok, or has 1+ errors with known codes and 1..300 char messages. */
function assertWellFormed(result: LoadResult): void {
  expect(typeof result).toBe('object');
  if (result.ok) return;
  expect(result.errors.length).toBeGreaterThan(0);
  for (const error of result.errors) {
    expect(KNOWN_CODES).toContain(error.code);
    expect(error.message.length).toBeGreaterThanOrEqual(1);
    expect(error.message.length).toBeLessThanOrEqual(300);
  }
}

describe('sheet-model loader totality properties', () => {
  it('Property 4: The loader is total and does not mutate its input', () => {
    // Feature: sheet-model, Property 4: The loader is total and does not mutate its input
    assertProperty(
      fc.property(fc.oneof(jsonValueArbitrary, mutatedDocumentArbitrary), (input) => {
        const before = structuredClone(input);
        let result: LoadResult | undefined;
        expect(() => {
          result = loadLevel(input, seededRandom(1));
        }).not.toThrow();
        assertWellFormed(result as LoadResult);
        expect(input).toEqual(before);
      }),
      NUM_RUNS,
    );
  });

  it('Property 5: The text loader is total', () => {
    // Feature: sheet-model, Property 5: The text loader is total
    assertProperty(
      fc.property(anyStringArbitrary, (text) => {
        let result: LoadResult | undefined;
        expect(() => {
          result = loadLevelText(text, seededRandom(1));
        }).not.toThrow();
        assertWellFormed(result as LoadResult);
      }),
      NUM_RUNS,
    );
  });

  it('Property 6: Deep nesting is refused, not crashed on', () => {
    // Feature: sheet-model, Property 6: Deep nesting is refused, not crashed on
    assertProperty(
      fc.property(deepNestingArbitrary, (nesting) => {
        const fromValue = loadLevel(nesting.value, seededRandom(1));
        expect(fromValue.ok).toBe(false);
        if (!fromValue.ok) {
          expect(fromValue.errors.some((e) => e.code === 'too-deep')).toBe(true);
        }
        const fromText = loadLevelText(nesting.text, seededRandom(1));
        expect(fromText.ok).toBe(false);
        if (!fromText.ok) {
          expect(fromText.errors.some((e) => e.code === 'too-deep')).toBe(true);
        }
      }),
      NUM_RUNS,
    );
  });
});
