import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { listCycleCells } from './evaluate-cell';
import { parseFormula } from './parser';
import { recalculate } from './recalculator';
import { createSheet, getValueByAddress, setCellName, setRawText } from './sheet';
import type { Sheet } from './sheet';
import {
  assertProperty,
  buildContext,
  chainDefinitions,
  isValidContextSpec,
  mulberry32,
  totalityScenarioArbitrary,
} from './testing/arbitraries';
import type { CellDefinition, TotalityScenario } from './testing/arbitraries';
import type { EvaluationContext } from './context';

const ERROR_KINDS: readonly string[] = ['#REF!', '#NAME?', '#DIV/0!', '#VALUE!', '#CYCLE!'];

function buildSheet(definitions: readonly CellDefinition[]): Sheet {
  const sheet = createSheet();
  for (const def of definitions) {
    setRawText(sheet, def.address, def.rawText);
    if (def.name !== undefined) setCellName(sheet, def.address, def.name);
  }
  return sheet;
}

/** Every one of the 240 Cells holds exactly one valid Value; error causes are well formed. */
function assertAllCellsValid(sheet: Sheet): void {
  for (let row = 1; row <= 20; row++) {
    for (let col = 1; col <= 12; col++) {
      const address = `${String.fromCharCode(64 + col)}${row}`;
      const read = getValueByAddress(sheet, address);
      expect(read.ok).toBe(true);
      if (!read.ok) continue;
      const v = read.value;
      switch (v.kind) {
        case 'number':
          expect(Number.isFinite(v.value)).toBe(true);
          break;
        case 'string':
          expect(typeof v.value).toBe('string');
          break;
        case 'boolean':
          expect(typeof v.value).toBe('boolean');
          break;
        case 'rule':
          expect(typeof v.text).toBe('string');
          break;
        case 'error':
          expect(ERROR_KINDS).toContain(v.error);
          expect(v.cause).not.toContain('internal error');
          expect(v.cause.length).toBeGreaterThanOrEqual(1);
          expect(v.cause.length).toBeLessThanOrEqual(200);
          break;
        default:
          expect.unreachable('unknown Value kind');
      }
    }
  }
}

function assertCycleCellsHoldCycleError(sheet: Sheet): string[] {
  const cycleCells = listCycleCells(sheet);
  for (const address of cycleCells) {
    const read = getValueByAddress(sheet, address);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.kind).toBe('error');
      if (read.value.kind === 'error') expect(read.value.error).toBe('#CYCLE!');
    }
  }
  return cycleCells;
}

function runScenario(scenario: TotalityScenario): void {
  switch (scenario.tag) {
    case 'text': {
      const parsed = parseFormula(scenario.text);
      // Exactly one outcome: an AST or a Parse_Error, never both and never neither.
      expect(parsed.ok === true || parsed.ok === false).toBe(true);
      if (parsed.ok) {
        expect(parsed.ast).toBeDefined();
        expect('error' in parsed).toBe(false);
      } else {
        expect(parsed.error.text.length).toBeGreaterThan(0);
        expect('ast' in parsed).toBe(false);
      }
      const sheet = createSheet();
      setRawText(sheet, 'A1', scenario.text);
      const ctx: EvaluationContext = {
        heroAddress: { col: 1, row: 1 },
        random: mulberry32(1).random,
      };
      const result = recalculate(sheet, ctx);
      expect(result.accepted).toBe(true);
      assertAllCellsValid(sheet);
      assertCycleCellsHoldCycleError(sheet);
      return;
    }
    case 'sheet': {
      const sheet = buildSheet(scenario.definitions);
      const result = recalculate(sheet, buildContext(scenario.context) as EvaluationContext);
      if (!result.accepted) {
        expect(result.error.kind).toBe('invalid-context');
        expect(isValidContextSpec(scenario.context)).toBe(false);
        return;
      }
      assertAllCellsValid(sheet);
      assertCycleCellsHoldCycleError(sheet);
      return;
    }
    case 'chain': {
      const sheet = buildSheet(chainDefinitions(scenario.kind));
      const ctx: EvaluationContext = {
        heroAddress: { col: 1, row: 1 },
        random: mulberry32(7).random,
      };
      const result = recalculate(sheet, ctx);
      expect(result.accepted).toBe(true);
      assertAllCellsValid(sheet);
      const cycleCells = assertCycleCellsHoldCycleError(sheet);
      if (scenario.kind === 'self-reference') expect(cycleCells).toEqual(['A1']);
      if (scenario.kind === 'long-cycle') expect(cycleCells).toHaveLength(240);
      return;
    }
  }
}

describe('Property 3: evaluation is total and terminates', () => {
  it('never throws and ends with valid Values', () => {
    // Feature: formula-engine, Property 3: Evaluation is total and terminates
    assertProperty(
      fc.property(totalityScenarioArbitrary, (scenario) => {
        runScenario(scenario);
      }),
      300,
    );
    // No wall-clock assertion here: properties check behaviour. The 5,000 ms limit of Requirement 12.3
    // is checked only by the fixed worst-case test in recalculator.test.ts. The long timeout below
    // is just Vitest's per-test limit for 300 heavy cases, not a check of the engine.
  }, 120_000);
});
