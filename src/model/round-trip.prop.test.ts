import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getValueByAddress } from '../engine/index';
import { loadLevel, loadLevelText } from './loader';
import { serializeLevel, serializeLevelText } from './serializer';
import {
  assertProperty,
  normalizeOracle,
  seededRandom,
  validDocumentArbitrary,
} from './testing/arbitraries';
import type { Level } from './types';

const NUM_RUNS = 100;
const COLUMNS = 'ABCDEFGHIJKL';

function loadOrThrow(doc: unknown, seed: number): ReturnType<typeof loadLevel> & { ok: true } {
  const result = loadLevel(doc, seededRandom(seed));
  if (!result.ok) {
    throw new Error(`loader refused a valid document: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function levelOf(doc: unknown, seed: number): Level {
  return loadOrThrow(doc, seed).level;
}

function readAllValues(sheet: Parameters<typeof getValueByAddress>[0]): unknown[] {
  const values: unknown[] = [];
  for (let i = 0; i < 240; i++) {
    const address = `${COLUMNS.charAt(i % 12)}${Math.floor(i / 12) + 1}`;
    const read = getValueByAddress(sheet, address);
    values.push(read.ok ? read.value : { missing: address });
  }
  return values;
}

describe('sheet-model round-trip properties', () => {
  it('Property 1: serialization equals the independent normalization', () => {
    // Feature: sheet-model, Property 1: Serialization equals the independent normalization
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const level = levelOf(doc, doc.seed);
        expect(serializeLevel(level)).toEqual(normalizeOracle(doc));
      }),
      NUM_RUNS,
    );
  });

  it('Property 2: level round trip and text idempotence', () => {
    // Feature: sheet-model, Property 2: Level round trip and text idempotence
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const level = levelOf(doc, doc.seed);

        const again = levelOf(serializeLevel(level), doc.seed);
        expect(again).toEqual(level);

        const text = serializeLevelText(level);
        const fromText = loadLevelText(text, seededRandom(doc.seed));
        if (!fromText.ok) {
          throw new Error(`text loader refused serialized text: ${JSON.stringify(fromText.errors)}`);
        }
        expect(fromText.level).toEqual(level);
        expect(serializeLevelText(fromText.level)).toBe(text);
      }),
      NUM_RUNS,
    );
  });

  it('Property 3: normalization preserves computed Values', () => {
    // Feature: sheet-model, Property 3: Normalization preserves computed Values
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const original = loadOrThrow(doc, doc.seed);
        const normalized = loadOrThrow(serializeLevel(original.level), doc.seed);
        expect(readAllValues(normalized.sheet)).toEqual(readAllValues(original.sheet));
      }),
      NUM_RUNS,
    );
  });
});
