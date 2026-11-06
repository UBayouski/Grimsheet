import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseFormula } from './parser';
import { printFormula } from './printer';
import { assertProperty, validAstArbitrary } from './testing/arbitraries';

describe('print and parse', () => {
  it('printing then parsing then printing is stable', () => {
    // Feature: formula-engine, Property 1: Parse-print-parse is stable
    assertProperty(
      fc.property(validAstArbitrary, (ast) => {
        const astJson = JSON.stringify(ast);

        const printed = printFormula(ast);
        if (!printed.ok) {
          throw new Error(`printer refused a valid AST: ${printed.error.kind}: ${printed.error.detail}\nAST: ${astJson}`);
        }

        const parsed = parseFormula(printed.text);
        if (!parsed.ok) {
          throw new Error(
            `parser rejected printed text: ${JSON.stringify(parsed.error)}\n` +
              `AST: ${astJson}\nPrinted: ${printed.text}`,
          );
        }

        try {
          expect(parsed.ast).toStrictEqual(ast);
        } catch {
          throw new Error(
            `parsed AST differs from the original\nAST: ${astJson}\n` +
              `Printed: ${printed.text}\nParsed: ${JSON.stringify(parsed.ast)}`,
          );
        }

        const reprinted = printFormula(parsed.ast);
        if (!reprinted.ok) {
          throw new Error(
            `printer refused the parsed AST: ${reprinted.error.kind}: ${reprinted.error.detail}\nAST: ${astJson}\nPrinted: ${printed.text}`,
          );
        }
        if (reprinted.text !== printed.text) {
          throw new Error(
            `second print differs\nAST: ${astJson}\nFirst: ${printed.text}\nSecond: ${reprinted.text}`,
          );
        }
      }),
      500,
    );
  }, 60_000);
});
