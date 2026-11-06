import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getValueByAddress, parseAddress, validateCellName } from '../engine/index';
import type { Sheet } from '../engine/index';
import { loadLevel } from './loader';
import {
  assertProperty,
  invalidDocumentArbitrary,
  seededRandom,
  validDocumentArbitrary,
} from './testing/arbitraries';
import type { Level } from './types';

const NUM_RUNS = 100;

/** Computed string of a Cell, or undefined when the Value is not a string. */
function stringAt(sheet: Sheet, address: string): string | undefined {
  const read = getValueByAddress(sheet, address);
  if (!read.ok || read.value.kind !== 'string') return undefined;
  return read.value.value;
}

/** Reading-order row (1-based) and column (1-based) of a canonical address. */
function gridOf(address: string): { row: number; col: number } {
  const point = parseAddress(address);
  if (!point.ok) throw new Error(`bad address ${address}`);
  return { row: point.point.row, col: point.point.col };
}

function assertPlacement(level: Level, sheet: Sheet): void {
  const rawAt = new Map<string, string>();
  for (const cell of level.cells) rawAt.set(cell.address, cell.raw);

  // Hero Cell holds a walkable glyph.
  const hero = level.hero.at;
  expect(['.', 'X', '^']).toContain(stringAt(sheet, hero));

  // Monster Cells hold floor; no two entities share an Address.
  const occupied = new Set<string>([hero]);
  expect(occupied.size).toBe(1);
  for (const monster of level.monsters) {
    expect(stringAt(sheet, monster.at)).toBe('.');
    expect(occupied.has(monster.at)).toBe(false);
    occupied.add(monster.at);
  }

  // Cell_Names are unique and valid; collect named Cells by name.
  const byName = new Map<string, string>();
  for (const cell of level.cells) {
    if (cell.name === undefined) continue;
    expect(validateCellName(cell.name).ok).toBe(true);
    expect(byName.has(cell.name)).toBe(false);
    byName.set(cell.name, cell.address);
  }

  // Each Rule_Name names one non-empty Cell in rows 14 to 20.
  for (const monster of level.monsters) {
    for (const ruleName of [monster.move, monster.atk]) {
      const address = byName.get(ruleName);
      expect(address).toBeDefined();
      const { row } = gridOf(address as string);
      expect(row).toBeGreaterThanOrEqual(14);
      expect(row).toBeLessThanOrEqual(20);
      expect((rawAt.get(address as string) ?? '').length).toBeGreaterThan(0);
    }
  }

  // Each named panel Cell has a label to its left: non-empty, not a formula, string Value.
  for (const [, address] of byName) {
    const { row, col } = gridOf(address);
    if (row < 14 || row > 20) continue;
    expect(col).toBeGreaterThan(1);
    const left = `${String.fromCharCode(64 + col - 1)}${row}`;
    const labelRaw = rawAt.get(left) ?? '';
    expect(labelRaw.length).toBeGreaterThan(0);
    expect(labelRaw.startsWith('=')).toBe(false);
    const label = stringAt(sheet, left);
    expect(label).toBeDefined();
    expect((label as string).length).toBeGreaterThan(0);
  }

  // Row 13 holds no Cell.
  for (const cell of level.cells) {
    expect(gridOf(cell.address).row).not.toBe(13);
  }
}

describe('sheet-model placement properties', () => {
  it('Property 7: Accepted levels satisfy the placement invariants', () => {
    // Feature: sheet-model, Property 7: Accepted levels satisfy the placement invariants
    assertProperty(
      fc.property(validDocumentArbitrary, (doc) => {
        const result = loadLevel(doc, seededRandom(1));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        assertPlacement(result.level, result.sheet);
      }),
      NUM_RUNS,
    );
    // The spec's time limits apply per case, not per test, so the test gets a long timeout.
  }, 60_000);

  it('Property 8: Rejected levels produce errors and no Sheet', () => {
    // Feature: sheet-model, Property 8: Rejected levels produce errors and no Sheet
    assertProperty(
      fc.property(invalidDocumentArbitrary, ({ doc }) => {
        const result = loadLevel(doc, seededRandom(1));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.length).toBeGreaterThan(0);
        expect('sheet' in result).toBe(false);
      }),
      NUM_RUNS,
    );
    // The spec's time limits apply per case, not per test, so the test gets a long timeout.
  }, 60_000);
});
