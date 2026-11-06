import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { listCycleCells } from './evaluate-cell';
import { recalculate } from './recalculator';
import { createSheet, getValueByAddress, setCellName, setRawText } from './sheet';
import type { Sheet } from './sheet';
import {
  addressOfIndex,
  assertProperty,
  deterministicShuffle,
  mulberry32,
  sheetCaseArbitrary,
} from './testing/arbitraries';
import type { CellDefinition, SheetCase } from './testing/arbitraries';
import type { Value } from './values';

function applyDefinitions(sheet: Sheet, definitions: readonly CellDefinition[]): void {
  for (const def of definitions) {
    setRawText(sheet, def.address, def.rawText);
    if (def.name !== undefined) setCellName(sheet, def.address, def.name);
  }
}

function finalRecalculate(sheet: Sheet, sheetCase: SheetCase): { calls: number } {
  const source = mulberry32(sheetCase.randomSeed);
  const result = recalculate(sheet, { heroAddress: sheetCase.hero, random: source.random });
  expect(result.accepted).toBe(true);
  return { calls: source.calls() };
}

function readAll(sheet: Sheet): Value[] {
  const values: Value[] = [];
  for (let i = 0; i < 240; i++) {
    const read = getValueByAddress(sheet, addressOfIndex(i));
    if (!read.ok) throw new Error(`cell ${addressOfIndex(i)} not found`);
    values.push(read.value);
  }
  return values;
}

const RULE_TEXT = '=IF(RAND() < 2, TOWARD(HERO), "-")';
const ADDRESS_PATTERN = /[A-L](?:[1-9]|1\d|20)(?!\d)/g;

/** Addresses touched by any formula text or definition, including every cell inside a Range. */
function touchedAddresses(sheetCase: SheetCase): Set<string> {
  const touched = new Set<string>();
  const texts: string[] = [];
  for (const def of sheetCase.definitions) {
    touched.add(def.address);
    texts.push(def.rawText);
  }
  for (const step of sheetCase.editScript) {
    touched.add(step.address);
    texts.push(step.text);
  }
  for (const text of texts) {
    for (const m of text.matchAll(/([A-L])(\d+):([A-L])(\d+)/g)) {
      const c1 = (m[1] as string).charCodeAt(0);
      const c2 = (m[3] as string).charCodeAt(0);
      const r1 = Number(m[2]);
      const r2 = Number(m[4]);
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
          touched.add(`${String.fromCharCode(c)}${r}`);
        }
      }
    }
    for (const m of text.matchAll(ADDRESS_PATTERN)) touched.add(m[0]);
  }
  return touched;
}

/**
 * A Rule_Cell is never evaluated, so adding Rule_Cells containing RAND() to cells that nothing
 * touches must not change the number of random() draws.
 */
function assertRuleCellsDrawNothing(sheetCase: SheetCase, baselineCalls: number): void {
  const touched = touchedAddresses(sheetCase);
  const free: string[] = [];
  for (let i = 0; i < 240 && free.length < 3; i++) {
    const address = addressOfIndex(i);
    if (!touched.has(address)) free.push(address);
  }
  const sheet = createSheet();
  applyDefinitions(sheet, sheetCase.definitions);
  for (const step of sheetCase.editScript) setRawText(sheet, step.address, step.text);
  for (const address of free) setRawText(sheet, address, RULE_TEXT);
  const { calls } = finalRecalculate(sheet, sheetCase);
  expect(calls).toBe(baselineCalls);
  for (const address of free) {
    const read = getValueByAddress(sheet, address);
    expect(read.ok && read.value.kind === 'rule').toBe(true);
  }
}

describe('Property 2: recalculation order independence', () => {
  it('gives the same Values, random draws and cycles for any definition or edit order', () => {
    // Feature: formula-engine, Property 2: Recalculation is independent of definition order and edit order
    assertProperty(
      fc.property(sheetCaseArbitrary, (sheetCase) => {
        // Baseline: definitions in given order, then the edit script, one recalculation.
        const baseline = createSheet();
        applyDefinitions(baseline, sheetCase.definitions);
        for (const step of sheetCase.editScript) setRawText(baseline, step.address, step.text);

        // Shuffled definition order, same edit script.
        const shuffled = createSheet();
        applyDefinitions(
          shuffled,
          deterministicShuffle(sheetCase.definitions, sheetCase.permutationSeed),
        );
        for (const step of sheetCase.editScript) setRawText(shuffled, step.address, step.text);

        // Edit-script replay with intermediate recalculations, each with its own fresh source.
        const replay = createSheet();
        applyDefinitions(replay, sheetCase.definitions);
        sheetCase.editScript.forEach((step, n) => {
          setRawText(replay, step.address, step.text);
          if (step.recalculateAfter) {
            const intermediate = mulberry32(sheetCase.randomSeed + n + 1);
            recalculate(replay, { heroAddress: sheetCase.hero, random: intermediate.random });
          }
        });

        const a = finalRecalculate(baseline, sheetCase);
        const b = finalRecalculate(shuffled, sheetCase);
        const c = finalRecalculate(replay, sheetCase);

        const valuesA = readAll(baseline);
        expect(valuesA).toHaveLength(240);
        expect(readAll(shuffled)).toStrictEqual(valuesA);
        expect(readAll(replay)).toStrictEqual(valuesA);

        expect(b.calls).toBe(a.calls);
        expect(c.calls).toBe(a.calls);

        const cyclesA = listCycleCells(baseline);
        expect(listCycleCells(shuffled)).toStrictEqual(cyclesA);
        expect(listCycleCells(replay)).toStrictEqual(cyclesA);

        assertRuleCellsDrawNothing(sheetCase, a.calls);
      }),
      200,
    );
  }, 60_000);
});
