# Implementation Plan: Formula Engine

## Overview

The design uses TypeScript, so no language question is needed. The plan builds `src/engine/` bottom-up in the module order of the design: address, values, AST, names, errors, context, tokenizer, parser, printer, functions, graph, evaluator, sheet, recalculator, per-monster evaluation. Then come the fast-check generators, the three property tests, and last the public barrel `index.ts` and the constraint scan.

Rules that apply to every task:

- Each task ends with an acceptance check. `npm test` (`vitest --run`) and `npm run check` (typecheck + lint) must both pass. They stay green under `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `noUnusedLocals`.
- A module added before its consumer is imported by its own `*.test.ts`, so nothing is unused. Tests import sibling modules directly, never `src/engine/index.ts`.
- Example-based unit tests are part of each implementation task. There are no optional tasks, so no `*` markers are used.
- Tasks in the same Batch edit disjoint files and can run in parallel on separate branches.
- Single owners of shared files: `address.ts` (1.1), `values.ts` (1.2), `ast.ts` (1.3), `errors.ts` (1.5), `src/engine/testing/arbitraries.ts` (5.1) and `src/engine/index.ts` (6.1). `evaluator.ts` is edited by 3.2 and then by 3.3 in a later batch, never in parallel.
- Design adjustment: `buildGraph` in `graph.ts` takes plain per-Cell input (`GraphCell[]`: index, AST or null, isRule) plus a name resolver, not the `SheetState` type. This keeps `graph.ts` independent of `sheet.ts`.
- Design adjustment: `sheet.ts` exports internal helpers (not re-exported from `index.ts`) that `recalculator.ts` and `evaluate-cell.ts` use: `getSheetState`, and a `commitRecalculation` function that writes the Values, cycle flags and `dirty = false` in one step.

## Batch Overview

| Batch | Tasks | Depends on |
|---|---|---|
| 1 | 1.1 address, 1.2 values, 1.3 ast | none |
| 2 | 1.4 names, 1.5 errors, 1.6 context, 2.1 tokenizer | Batch 1 |
| 3 | 2.2 parser, 3.1 functions | Batches 1, 2 |
| 4 | 2.3 printer, 3.2 evaluator core, 4.1 graph | Batches 1 to 3 |
| 5 | 3.3 evaluator calls, 4.2 sheet | Batch 4 (3.2 for 3.3; 2.3 for 4.2) |
| 6 | 4.3 recalculator | Batches 4, 5 |
| 7 | 4.4 evaluate-cell | Batch 6 |
| 8 | 5.1 arbitraries | Batch 7 |
| 9 | 5.2, 5.3, 5.4 property tests | Batch 8 |
| 10 | 6.1 index barrel, 6.2 constraint scan | Batch 9 |

## Tasks

- [x] 1. Foundations: addresses, values, AST, names, errors, context
  - [x] 1.1 [Batch 1] Create `address.ts` with tests
    - Files: create `src/engine/address.ts`, `src/engine/address.test.ts`
    - Export `GridPoint`, `SHEET_COLUMNS`, `SHEET_ROWS`, `SHEET_CELL_COUNT`, `isInSheet`, `parseAddress` (strict `^[A-La-l]([1-9]|1[0-9]|20)$`, canonical upper case), `formatAddress`, `readingIndex`
    - Tests: `A1`, `L20`, `b7` becomes `B7`; reject `M1`, `A0`, `A21`, `A01`, `+A1`, `A1.0`, ` A1`, empty; reading order indices 0 and 239
    - Acceptance: `npm test` passes including `address.test.ts`; `npm run check` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 [Batch 1] Create `values.ts` with tests
    - Files: create `src/engine/values.ts`, `src/engine/values.test.ts`
    - Export `ErrorKind`, `Value` (number, string, boolean, error with `cause` and `origin`, rule), value constructors, `formatValue`, `formatNumber` (shortest round-trip via `toExponential`, no exponent, `-0` prints `0`)
    - No imports from other engine files
    - Tests: `0.1`, `1e21` as `1000000000000000000000`, `5e-7` as `0.0000005`, `-0`, `123456789012345680000`; `formatValue` of each kind; the five error display texts are distinct
    - Acceptance: `npm test` passes including `values.test.ts`; `npm run check` passes
    - _Requirements: 4.7, 9.3, 10.9_

  - [x] 1.3 [Batch 1] Create `ast.ts` with tests
    - Files: create `src/engine/ast.ts`, `src/engine/ast.test.ts`
    - Export `MAX_DEPTH = 200`, `BinaryOperator`, `CellNode`, `Node` and `isRuleAst` (true for a `SELF` name node or a `TOWARD` call anywhere, including untaken `IF` branches; strings do not count)
    - Tests build ASTs by hand: `SELF` found nested in `IF`, `TOWARD` in an argument, string `"SELF"` is not a rule, plain formula is not a rule
    - Acceptance: `npm test` passes including `ast.test.ts`; `npm run check` passes
    - _Requirements: 3.1, 8.14_

  - [x] 1.4 [Batch 2] Create `names.ts` with tests
    - Files: create `src/engine/names.ts`, `src/engine/names.test.ts`
    - Export `FUNCTION_NAMES`, `RESERVED_NAMES`, `NameCheckFailure`, `validateCellName` (checks in order: pattern, reserved, function, address-like; case-insensitive; canonical upper case)
    - Tests: accept `HP`, `_X`, `move_m1`; reject `1HP`, `HERO`, `self`, `SUM`, `A1`, `l20`, bad characters; each failure names the right check
    - Acceptance: `npm test` passes including `names.test.ts`; `npm run check` passes
    - _Requirements: 1.5, 1.6_

  - [x] 1.5 [Batch 2] Create `errors.ts` with tests
    - Files: create `src/engine/errors.ts`, `src/engine/errors.test.ts`
    - Export `makeError` (cause starts with origin), `pickError` (`#CYCLE!` with lowest origin reading index wins, else first in source order), `truncateCause` (at most 200 code points, keeps the start, never splits a surrogate pair)
    - Tests: leftmost error wins; `#CYCLE!` beats other errors; tie on origin; truncation keeps the origin; surrogate pairs intact; cause length 1 to 200
    - Acceptance: `npm test` passes including `errors.test.ts`; `npm run check` passes
    - _Requirements: 10.3, 10.4, 10.10, 10.11, 10.13, 13.9_

  - [x] 1.6 [Batch 2] Create `context.ts` with tests
    - Files: create `src/engine/context.ts`, `src/engine/context.test.ts`
    - Export `EvaluationContext`, `ContextField`, `validateContext` (`heroAddress` needs safe-integer `col` and `row`; `random` must be a function; malformed `selfAddress` counts as absent; out-of-sheet addresses are kept)
    - Tests: valid context; missing or malformed hero; non-function random; non-object input; malformed and out-of-sheet self
    - Acceptance: `npm test` passes including `context.test.ts`; `npm run check` passes
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 2. Tokenizer, parser and printer
  - [x] 2.1 [Batch 2] Create `tokenizer.ts` with tests
    - Files: create `src/engine/tokenizer.ts`, `src/engine/tokenizer.test.ts`
    - Export `TokenKind`, `Token`, `ParseError`, `tokenize` (strict) and `scan` (partial tokens plus first error)
    - Longest-match operators, 1-based UTF-16 columns with `=` as column 1, only U+0020 skipped, doubled quotes, `address` tokens for letter-plus-digits words, `TRUE`/`FALSE` case-insensitive, `$` error, number errors, unterminated string at the opening quote, unknown character (tab, newline) errors
    - Acceptance: `npm test` passes including `tokenizer.test.ts` (operator, column, number, string, `$`, tab and newline cases); `npm run check` passes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [x] 2.2 [Batch 3] Create `parser.ts` with tests
    - Files: create `src/engine/parser.ts`, `src/engine/parser.test.ts`
    - Export `ParseResult`, `parseFormula` using the grammar in the design: precedence, left associativity, grouping, Range only as a direct function argument, names unchecked, unknown functions accepted
    - Error columns: unexpected token at its column, end of input at length + 1, leftover token, lowest column wins when a lexical error follows a syntax error, `Col N: <message>.` format with messages of at most 80 characters
    - Depth cap: recursion and tree height at most 200 (parentheses, unary minus, calls, `1+1+...` chains); never throws
    - Tests: `1-2-3`, `1+2*3`, `1&2=3`, `-2*3`, `--3`, `(1+2)*3`, `SUM(A1:A3)` ok, `SUM(A1:A3+1)`, `=A1:A3`, `=(A1:A3)` fail at the Range start, `A01` is `A1`, depth 200 accepted and 201 and 100000 rejected for each nesting form
    - Acceptance: `npm test` passes including `parser.test.ts`; `npm run check` passes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 6.1, 6.2, 6.3, 6.4, 9.20, 12.1, 12.6, 14.4_

  - [x] 2.3 [Batch 4] Create `printer.ts` with tests
    - Files: create `src/engine/printer.ts`, `src/engine/printer.test.ts`
    - Export `PrintResult`, `printFormula` with the precedence-level parenthesization from the design, one space around binary operators, `, ` between arguments, upper case, string escaping, `formatNumber` for numbers
    - Refuse (no partial text) non-finite numbers, negative number nodes, a Range outside a direct call argument, bad `col` or `row`, unknown kinds, missing children, trees taller than `MAX_DEPTH`
    - Tests (using `parseFormula`): `(1+2)*3`, `1-(2-3)`, `-(1+2)`, `(1=2)=3`, `--3`; spacing; upper-casing; `""` escaping; round trip for a hand-picked list of formulas; refusals
    - Acceptance: `npm test` passes including `printer.test.ts`; `npm run check` passes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

- [ ] 3. Functions and evaluator
  - [x] 3.1 [Batch 3] Create `functions.ts` with tests
    - Files: create `src/engine/functions.ts`, `src/engine/functions.test.ts`
    - Export the function table: name, arity (`min`, `max`), argument modes, and pure helpers on checked arguments (`SUM`/`MIN`/`MAX` aggregation with empty-argument results, `ABS`, `MOD` with divisor sign and rounding guard, `TOWARD` direction with vertical tie rule, `ROW`, `COL`, `DIST`, `AND`, `OR`, `NOT`)
    - No dependency on `evaluator.ts` (the evaluator will consume this table)
    - Tests: every arity from Requirement 9 criterion 18; `MOD` signs and zero divisor result flag; `TOWARD` all four directions, ties, `"-"`; `SUM` of nothing is `0`, `MIN`/`MAX` of nothing flagged `#VALUE!`
    - Acceptance: `npm test` passes including `functions.test.ts`; `npm run check` passes
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.9, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16, 9.18_

  - [x] 3.2 [Batch 4] Create `evaluator.ts` core (operands, references, operators) with tests
    - Files: create `src/engine/evaluator.ts`, `src/engine/evaluator.test.ts`
    - Export `CellView`, `EvalEnv`, `evaluateAst`. Implement literals, cell references (in-sheet `ref`, out-of-sheet `#REF!`), ranges (bounds check, normalization), names (`HERO`, `SELF`, Cell_Name, unknown name `#REF!`), `deref` with the Rule_Cell `#VALUE!` cause, the empty-Cell coercion table, unary minus, arithmetic, `&`, case-insensitive comparison, `#DIV/0!` including `-0`, non-finite results to `#VALUE!`, `pickError` for operand errors, per-call `try/catch`
    - `call` nodes go through a single internal `evaluateCall` stub that returns `#NAME?`; task 3.3 replaces it
    - Tests use `parseFormula` plus a stub `EvalEnv`: empty Cell in every operator and comparison, out-of-sheet and unknown-name `#REF!`, string versus number `#VALUE!`, `"a"="A"`, `"a"<"B"`, `"a"<>"A"`, `"ß"="SS"`, Range as a plain value `#REF!`, `HERO`/`SELF` resolution, Rule_Cell reference `#VALUE!` with cause naming the Rule_Cell, `=A1` of an empty Cell is `0`
    - Acceptance: `npm test` passes including `evaluator.test.ts`; `npm run check` passes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 8.5, 8.6, 8.7, 8.8, 8.10, 8.12, 9.1, 9.2, 9.3, 9.4, 9.21, 9.22, 9.25, 10.1, 10.3, 10.4, 10.12, 12.5_

  - [ ] 3.3 [Batch 5] Complete `evaluator.ts` function calls with tests
    - Files: edit `src/engine/evaluator.ts`, edit `src/engine/evaluator.test.ts` (no other files)
    - Replace the `evaluateCall` stub with the call pipeline: evaluate arguments in source order, `#CYCLE!` precedence, unknown function `#NAME?`, arity `#VALUE!`, leftmost argument error, type checks, then compute through the `functions.ts` table
    - Lazy `IF` (only the chosen branch evaluated; error condition returned at once; Range operand passed through), `SUM`/`MIN`/`MAX` over Ranges in row-major order (skip empty, string and boolean members; Rule_Cell member `#VALUE!`), `ROW`/`COL`/`DIST`/`TOWARD` on `ref` operands (names resolve to Addresses, absent `SELF` gives `#REF!`), `RAND()` once per call with a guard for a bad Random_Source
    - Tests: every function with good and bad arguments, `#NAME?`, arity errors, `TOWARD` ties and `"-"`, absent Self_Address, `IF` laziness for both branches, `SUM(IF(c, A1:A3, B1:B3))`, first-error row-major order in Ranges, `#CYCLE!` beats other errors in calls and Ranges, `#CYCLE!` in an untaken `IF` branch ignored, `RAND` call order with a scripted source, out-of-contract random values give `#VALUE!`
    - Acceptance: `npm test` passes including the extended `evaluator.test.ts`; `npm run check` passes
    - _Requirements: 8.9, 8.11, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.17, 9.18, 9.19, 9.23, 9.24, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 13.3, 13.9_

- [ ] 4. Graph, sheet, recalculation and per-monster evaluation
  - [x] 4.1 [Batch 4] Create `graph.ts` with tests
    - Files: create `src/engine/graph.ts`, `src/engine/graph.test.ts`
    - Export `DependencyGraph`, `GraphCell`, `extractDependencies`, `buildGraph` (takes `GraphCell[]`, a name resolver and the hero index), `findCycleCells` (iterative Tarjan: two or more members, or one member with a self-edge), `topologicalOrder` (Kahn over the condensation, smallest reading index first, members of a cycle emitted together)
    - Edges: in-sheet references, Range members when both endpoints are in the Sheet, Cell_Names, `HERO` in value position for non-Rule_Cells; no edges for out-of-sheet references, unknown names or a Range with an out-of-sheet endpoint; edges come from text, so untaken `IF` branches count
    - Tests (using `parseFormula`): each edge kind and each non-edge, self-loop, two-Cell cycle, cycle with a tail, tie order by reading index, same result for shuffled input, `HERO` edge and the direct-argument exception
    - Acceptance: `npm test` passes including `graph.test.ts`; `npm run check` passes
    - _Requirements: 11.1, 11.2, 13.1, 13.2, 13.5, 13.6, 13.7, 13.8_

  - [ ] 4.2 [Batch 5] Create `sheet.ts` with tests
    - Files: create `src/engine/sheet.ts`, `src/engine/sheet.test.ts`
    - Export `Sheet`, `createSheet`, `CellTarget`, `setRawText`, `setCellName`, `getValueByAddress`, `getValueByName`, result types, plus the internal helpers `getSheetState` and `commitRecalculation`
    - 240 Cells; Literals stored without parsing; a Formula is parsed first and a failed parse changes nothing (Raw_Text, AST, name, Value); successful edits cache the AST and `isRule`, set `dirty`, and return `canonicalText` from the printer; names unique case-insensitively with the failing check or the conflicting name reported; reads return the last Value with `stale`
    - Tests: 240 Cells; invalid Address refused; refused edit leaves everything unchanged; duplicate name (different case); name rejection keeps the previous name; clearing a name; reads by Address and name; `cell-not-found`; new Sheet reads `""`; `stale` flag
    - Acceptance: `npm test` passes including `sheet.test.ts`; `npm run check` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 6.1, 6.5, 6.6, 14.2, 14.3_

  - [ ] 4.3 [Batch 6] Create `recalculator.ts` with tests
    - Files: create `src/engine/recalculator.ts`, `src/engine/recalculator.test.ts`
    - Export `RecalculateResult`, `recalculate`: validate the context; build the graph, find cycles, order; evaluate each Cell into a fresh array (empty gives `""`, Literal classified with `^[+-]?\d+(\.\d+)?$`, cycle Cell gets `#CYCLE!` with the cause texts from the design, Rule_Cell off a cycle gets the rule Value with no evaluation and no `random()` call, other Formulas through `evaluateAst` with `self` undefined inside `try/catch`); commit in one step through `commitRecalculation`
    - Tests: dependents defined before dependencies; cycle set, cleared by an edit, and Rule_Cell regaining its rule Value; downstream `#CYCLE!`; untaken `IF` branch not an operand but still an edge; `#CYCLE!` from a Range member; Rule_Cell on a cycle holds `#CYCLE!`; a Cell reading a Rule_Cell gets `#VALUE!` naming it; scripted Random_Source shows call order and that Rule_Cells draw nothing; Self_Address ignored; `HERO` outside the Sheet gives `#REF!`; invalid context refused with nothing changed; literal classification table
    - Acceptance: `npm test` passes including `recalculator.test.ts`; `npm run check` passes
    - _Requirements: 1.8, 1.9, 8.1, 8.3, 8.4, 8.13, 8.14, 8.15, 8.17, 10.12, 11.2, 11.3, 11.4, 11.9, 11.10, 11.11, 12.2, 13.1, 13.2, 13.3, 13.4, 13.9_

  - [ ] 4.4 [Batch 7] Create `evaluate-cell.ts` with tests
    - Files: create `src/engine/evaluate-cell.ts`, `src/engine/evaluate-cell.test.ts`
    - Export `EvaluateCellResult`, `evaluateCell` (check order: Cell exists, then Rule_Cell off a cycle needs a valid context, then evaluate with Self_Address reading stored Values, store nothing), `listCycleCells` (reading order, no duplicates), `ErrorDescription`, `DescribeErrorResult`, `describeError`
    - Tests: `cell-not-found` before the context check; Rule_Cell evaluated with Self_Address; absent or out-of-sheet Self_Address gives `#REF!`; non-Rule_Cell and cycle Rule_Cell return stored Values without reading the context; empty Cell returns `""`; nothing stored; Rule_Cell referencing a Rule_Cell sees `#VALUE!`; erroring formula returns the Error_Value; `stale`; cycle list ordering and empty list; `describeError` for an error, a non-error and a missing Cell
    - Acceptance: `npm test` passes including `evaluate-cell.test.ts`; `npm run check` passes
    - _Requirements: 8.2, 8.3, 8.16, 8.18, 8.19, 10.10, 10.11, 10.12, 13.5, 13.6, 13.9, 14.2, 14.3_

- [ ] 5. Property-based testing
  - [ ] 5.1 [Batch 8] Create `testing/arbitraries.ts` with a smoke test
    - Files: create `src/engine/testing/arbitraries.ts`, `src/engine/testing/arbitraries.test.ts`
    - Single owner of all fast-check generators: `mulberry32` seeded Random_Source (counts calls); valid-AST arbitrary via `fc.letrec` (all node kinds and 11 operators, depth 0 to 8, strings of 0 to 50 characters with embedded quotes, Ranges only as direct call arguments); random Sheet definition list (1 to 50 Cells, Ranges, names, `RAND()`, `IF`, Rule_Cells, self-references and cycles, forward and backward references) with seed, Hero_Address, permutation seed, edit script (including invalid Formulas); arbitrary Evaluation_Context (valid and invalid forms, misbehaving `random`); totality scenarios (`text`, `sheet`, `chain`); deterministic shuffle helper; `FC_SEED`-aware `assertProperty` helper
    - Smoke test: each arbitrary produces values with `fc.sample`; generated ASTs print and parse; a hand-built depth 6 AST prints; no use of `Math.random`
    - Acceptance: `npm test` passes including `arbitraries.test.ts`; `npm run check` passes
    - _Requirements: 5.3, 11.7, 12.4_

  - [ ] 5.2 [Batch 9] Write property test for parse-print-parse stability
    - Files: create `src/engine/print-parse.prop.test.ts`
    - **Property 1: Parse-print-parse is stable**
    - One `fc.assert(fc.property(...))`, 500 runs, `// Feature: formula-engine, Property 1: Parse-print-parse is stable`; asserts the printed text parses, the AST is structurally equal, and the second print is identical; failure output includes the AST, the printed text, the seed and the shrunk counterexample
    - Acceptance: `npm test` passes including `print-parse.prop.test.ts`; `npm run check` passes
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [ ] 5.3 [Batch 9] Write property test for order-independent recalculation
    - Files: create `src/engine/recalc-order.prop.test.ts`
    - **Property 2: Recalculation is independent of definition order and edit order**
    - One `fc.assert(fc.property(...))`, 200 runs, comment `// Feature: formula-engine, Property 2: ...`; builds three Sheets (baseline, shuffled definition order, edit-script replay with intermediate recalculations), recalculates with fresh seeded sources, asserts all 240 Values deeply equal, equal `random()` call counts, equal `listCycleCells`, and that Rule_Cells draw nothing
    - Acceptance: `npm test` passes including `recalc-order.prop.test.ts`; `npm run check` passes
    - **Validates: Requirements 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11**

  - [ ] 5.4 [Batch 9] Write property test for total evaluation
    - Files: create `src/engine/totality.prop.test.ts`
    - **Property 3: Evaluation is total and terminates**
    - One `fc.assert(fc.property(...))`, 300 runs, comment `// Feature: formula-engine, Property 3: ...`; covers the `text`, `sheet` and `chain` scenarios; asserts nothing throws, `parseFormula` returns exactly one outcome, an invalid context is refused or all 240 Cells hold a valid Value, every Cell in `listCycleCells` holds `#CYCLE!`, no cause contains `internal error`, error causes are 1 to 200 characters, and each case takes under 5000 ms (`performance.now()`)
    - Acceptance: `npm test` passes including `totality.prop.test.ts`; `npm run check` passes
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**

- [ ] 6. Public API and constraints
  - [ ] 6.1 [Batch 10] Create `index.ts` barrel with API-surface test
    - Files: create `src/engine/index.ts`, `src/engine/index.test.ts`
    - Single owner of `index.ts`: named exports only, no default export. Export the 11 operations (`parseFormula`, `printFormula`, `createSheet`, `setRawText`, `setCellName`, `recalculate`, `getValueByAddress`, `getValueByName`, `evaluateCell`, `listCycleCells`, `describeError`) plus the supporting exports and types listed in the design (`tokenize`, `formatValue`, `formatNumber`, `parseAddress`, `formatAddress`, `isRuleAst`, `MAX_DEPTH`, result and context types) using `export type` for types
    - Test: imports `* as engine from './index'`; asserts the exact set of runtime export names, no `default`, and a short end-to-end flow (create Sheet, set Cells, recalculate, read Values, evaluate a Rule_Cell)
    - Acceptance: `npm test` passes including `index.test.ts`; `npm run check` passes
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.8_

  - [ ] 6.2 [Batch 10] Create source-constraint scan test
    - Files: create `src/engine/constraints.test.ts`
    - Reads every non-test `.ts` file under `src/engine/` (excluding `*.test.ts` and `*.prop.test.ts`), strips comments and string literals, and asserts no `eval`, `new Function`, `Math.random`, `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch` or `XMLHttpRequest` (word-boundary match), and no import path containing `src/model`, `src/game` or `src/ui` (or relative paths reaching them); asserts the scanner finds at least the expected module files; includes a self-check that the scanner flags a sample bad snippet
    - Acceptance: `npm test` passes including `constraints.test.ts`; `npm run check` passes
    - _Requirements: 8.11, 8.12, 14.5, 14.6, 14.7, 14.9_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Run `npm test` and `npm run check`; both must pass with zero failures and zero DOM-related errors under Node 22 or later
  - Confirm `src/engine/index.ts` is the only file that re-exports the engine API, and that no file under `src/engine/` imports it
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 14.1, 14.8_

## Notes

- There are no optional tasks. Example-based tests are part of each implementation task, and the three property tests (5.2, 5.3, 5.4) are required and are the only property-based tests.
- Tasks in one Batch touch disjoint files and can run on separate branches. Merge a whole batch before starting the next.
- `evaluator.ts` is edited by 3.2 (Batch 4) and 3.3 (Batch 5) only, in different batches.
- `index.ts` is owned by 6.1 alone. `testing/arbitraries.ts` is owned by 5.1 alone.
- Each task references granular requirement clauses for traceability.
- This workflow only creates the plan. Start execution by opening this file and choosing "Start task" next to a task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.5", "1.6", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "4.1"] },
    { "id": 4, "tasks": ["3.3", "4.2"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["4.4"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 9, "tasks": ["6.1", "6.2"] }
  ]
}
```
