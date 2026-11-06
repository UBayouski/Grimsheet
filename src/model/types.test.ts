import { describe, expect, it } from 'vitest';
import { LOAD_ERROR_CODES } from './types';
import type { Level, LevelDocument, LoadError } from './types';

const EXPECTED_CODES = [
  'not-an-object',
  'missing-field',
  'unknown-field',
  'wrong-type',
  'too-many-items',
  'bad-schema-version',
  'bad-id',
  'bad-title',
  'bad-hint',
  'bad-hp',
  'bad-ink',
  'bad-seed',
  'bad-map-size',
  'bad-map-row',
  'bad-map-glyph',
  'bad-address',
  'reserved-row',
  'duplicate-address',
  'bad-raw',
  'formula-parse',
  'bad-name',
  'duplicate-name',
  'missing-label',
  'label-is-named',
  'bad-label-value',
  'bad-monster-id',
  'duplicate-monster-id',
  'entity-overlap',
  'unknown-rule',
  'bad-rule-cell',
  'hero-blocked',
  'monster-not-on-floor',
  'engine-refused',
  'too-large',
  'invalid-json',
  'too-deep',
  'internal-error',
  'too-many-errors',
];

describe('LOAD_ERROR_CODES', () => {
  it('has unique codes', () => {
    expect(new Set(LOAD_ERROR_CODES).size).toBe(LOAD_ERROR_CODES.length);
  });

  it('equals the design table in order', () => {
    expect([...LOAD_ERROR_CODES]).toEqual(EXPECTED_CODES);
  });

  it('uses non-empty kebab-case strings', () => {
    for (const code of LOAD_ERROR_CODES) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('Level types', () => {
  it('accepts a sample Level literal', () => {
    const doc: LevelDocument = {
      schemaVersion: 1,
      id: '01-the-corridor',
      title: 'The Corridor',
      hint: 'Walk east.',
      startingHp: 3,
      ink: 0,
      seed: 1,
      hero: { at: 'A1' },
      monsters: [{ id: 'M1', at: 'C1', move: 'MOVE_M1', atk: 'ATK_M1' }],
      map: Array.from({ length: 12 }, () => '.'.repeat(12)),
      cells: [{ address: 'B14', raw: '="x"', locked: true, name: 'MOVE_M1' }],
    };
    const level: Level = doc;
    const err: LoadError = { path: '', code: LOAD_ERROR_CODES[0], message: 'x' };
    expect(level.schemaVersion).toBe(1);
    expect(err.code).toBe('not-an-object');
  });
});
