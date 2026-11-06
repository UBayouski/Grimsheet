# Implementation Plan: Sheet Model

## Overview

The design uses TypeScript, so no language question is needed. The plan builds `src/model/` bottom-up: one two-line engine export, the types and error codes, the serializer and the test generators, then the loader in four sequential steps, then the three property test files, and last the public barrel and the module scan.

Rules that apply to every task:

- Each task ends with the same acceptance check: `npm run verify` (`npm test`, then typecheck and lint). It stays green under `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `noUnusedLocals`.
- A module added before its consumer is imported by its own `*.test.ts`, so nothing is unused. Tests import sibling modules directly, never `src/model/index.ts` or `src/engine/index.ts`, except where a task says so. Model code reaches the engine only through `../engine/index` (Requirement 14.3).
- Example-based unit tests are part of each implementation task. The three property test files (4.1, 4.2, 4.3) are required. There are no optional tasks, so no `*` markers are used.
- Run mode: `[Crew]` tasks edit disjoint files and can run in parallel in Kiro Crew. `[IDE]` tasks share files or must run in sequence and run in the IDE.
- Single owners of shared files: `src/engine/index.ts` and `src/engine/index.test.ts` (1.1, the only engine change), `types.ts` (1.2), `serializer.ts` (2.1), `testing/arbitraries.ts` (2.2), `loader.ts` and `loader.test.ts` (3.1 to 3.4, in order), `index.ts` (5.1).
- Design adjustment: `loader.ts` imports `normalize` from `serializer.ts` and the types from `types.ts`. `serializer.ts` imports only `types.ts`.
- Generator bugs found in Batch 4 are fixed in the IDE in `testing/arbitraries.ts` (owned by 2.2), never in parallel.

## Batch Overview

| Batch | Mode | Tasks | Depends on |
|---|---|---|---|
| 1 | IDE for 1.1, Crew for 1.2 (disjoint files, 1.2 may run beside 1.1) | 1.1 engine export, 1.2 types | none |
| 2 | Crew, parallel | 2.1 serializer, 2.2 arbitraries | Batch 1 |
| 3 | IDE, strictly sequential (all edit `loader.ts` and `loader.test.ts`) | 3.1 guard, collector, shape, metadata, map, text loader; 3.2 cell specs; 3.3 hero and monsters; 3.4 build, placement, finish | Batches 1, 2 |
| 4 | Crew, parallel | 4.1 round-trip properties, 4.2 totality properties, 4.3 placement properties | Batches 2, 3 |
| 5 | IDE, sequential | 5.1 barrel and module scan, 5.2 final checkpoint | Batch 4 |

## Tasks

- [ ] 1. Engine export and model types
  - [ ] 1.1 [Batch 1] [IDE] Export `validateCellName` from the engine barrel
    - Files: edit `src/engine/index.ts`, edit `src/engine/index.test.ts` (no other engine file)
    - Add `export { validateCellName } from './names';` and `export type { NameCheckFailure } from './names';` to `src/engine/index.ts`
    - Test: add `'validateCellName'` to `EXPECTED_EXPORTS` in `src/engine/index.test.ts`; the exact-export-set assertion stays green
    - Acceptance: `npm run verify` passes
    - _Requirements: 14.1, 14.2_

  - [ ] 1.2 [Batch 1] [Crew] Create `types.ts` with tests
    - Files: create `src/model/types.ts`, `src/model/types.test.ts`
    - Export `RandomSource`, `CellSpec`, `MonsterSpec`, `LevelDocument` (all fields `readonly`, `schemaVersion: 1`), `Level` as an alias of `LevelDocument`, `LOAD_ERROR_CODES` (every code in the design table, including `bad-label-value` and `too-many-errors`), `LoadErrorCode`, `LoadError`, `LoadResult`; `Sheet` is imported as a type from `../engine/index`
    - Test: the codes are unique, the list equals the design table exactly (hard-coded expected array), every code is a non-empty kebab-case string; a type-level sample `Level` literal compiles
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.3_

- [ ] 2. Serializer and test generators
  - [ ] 2.1 [Batch 2] [Crew] Create `serializer.ts` with tests
    - Files: create `src/model/serializer.ts`, `src/model/serializer.test.ts`
    - Export `normalize` (Effective_Raw per Map_Area Cell, glyph or `.`, upper-case Addresses and names, `locked` only when `true`, drop redundant specs, Reading_Order, upper-case rule names, fixed key order built key by key), `serializeLevel`, `serializeLevelText` (`JSON.stringify(doc, null, 2) + '\n'`) and `tabLabel` (`Sheet${Number(id.slice(0, 2))}: ${title}`)
    - Tests: `tabLabel` for `01-the-corridor` and `10-x`; root, cell and monster field order; trailing newline and no `\r`; removable spec (unlocked, unnamed, raw equals glyph, or empty outside the map) is dropped; override `raw: "X"` over `.` folds into the map; non-glyph override folds to `.` and the spec stays; `locked: false` dropped; lower-case address and name upper-cased; specs sorted in Reading_Order; `normalize` is idempotent on a hand-built Level; equal Levels give identical text
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ] 2.2 [Batch 2] [Crew] Create `testing/arbitraries.ts` with a smoke test
    - Files: create `src/model/testing/arbitraries.ts`, `src/model/testing/arbitraries.test.ts`
    - Single owner of all generators: a `mulberry32`-style seeded `RandomSource`; `validDocumentArbitrary` (12x12 map, labelled rule cells whose label is a non-empty literal or a formula giving a non-empty string, 0 to 16 monsters on floor, hero on a walkable cell, 0 to 240 specs with formulas, literals, quotes and Unicode, `locked` true, false or absent, lower-case letters, restating and overriding map specs, removable specs, shuffled order, blocking overrides kept off entity cells); `invalidDocumentArbitrary` (one fault each: hero on a blocking cell, monster on wall, exit, trap or error cell, bad glyph, duplicate name, unknown rule, rule outside the panel, missing label, label whose Value is a number); `mutatedDocumentArbitrary` (field removed, retyped, value replaced, unknown field added, address changed, map character changed); `jsonValueArbitrary`; `anyStringArbitrary` (arbitrary, JSON-like, repeated character up to 300,000); `deepNestingArbitrary` (depth 101 to 5,000, built iteratively, value and text forms); `normalizeOracle` written independently of `serializer.ts` (a `Map` keyed by address, explicit `(row, col)` sort, output built key by key, no import of `serializer.ts`); `assertProperty(property, numRuns)` that honours `FC_SEED`
    - Smoke tests that do not need the loader: generated documents have the expected shape (12 map rows of 12 glyphs, at most 16 monsters, at most 240 specs); `normalizeOracle` is idempotent on its own output; invalid documents differ from their valid base; nesting generators reach the stated depth; the seeded source is repeatable and stays in [0, 1); the file never uses `Math.random`
    - Acceptance: `npm run verify` passes
    - _Requirements: 11.5, 11.6, 12.6, 12.7, 13.5_

- [ ] 3. Loader
  - [ ] 3.1 [Batch 3] [IDE] Create `loader.ts`: guard, collector, shape, metadata, map, text loader
    - Files: create `src/model/loader.ts`, `src/model/loader.test.ts`
    - Implement the iterative guard (not a plain object, depth over 100 gives `too-deep`, over 100,000 nodes gives `too-large`; explicit stack, no recursion, no writes); the error collector (`push`, `has(pathPrefix)`, cap of 50 with an exact dropped count and the `too-many-errors` marker); `makeError` (message clamped to 1 to 300 characters) and `quote` (at most 40 code points, escaped, ellipsis on truncation); `loadLevel(doc, random)` skeleton with the outer `try/catch` returning `internal-error`; root shape (missing fields, unknown fields with the allowed list, wrong types reported once, `cells` over 240 and `monsters` over 16, entry shapes for cells, monsters and `hero`); metadata checks; map checks; `loadLevelText` (over 200,000 characters gives `too-large` before parsing, `SyntaxError` gives `invalid-json` with position when available, `RangeError` gives `too-deep`, otherwise the same result as `loadLevel`)
    - Tests: Requirement 2 boundaries (HP 1 and 0, ink 0 and -1, id of 40 and 41 characters, seed 0, 4294967295 and 4294967296, version 2); Requirement 3 (null, array, number, string, missing field, unknown field `lokced` with allowed list, NaN and Infinity, wrong types, list caps); Requirement 4 (row count, row length, glyph message `map row 3, column F: "Q" is not one of # . X ^`); error order and the 50-error cap with its marker; quote truncation; a throwing getter gives `internal-error`; text loader cases (too large, invalid JSON, deep text, equal to the value loader); the input is not mutated
    - Acceptance: `npm run verify` passes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 12.3, 12.4, 12.5_

  - [ ] 3.2 [Batch 3] [IDE] Add cell-spec checks to `loader.ts`
    - Files: edit `src/model/loader.ts`, edit `src/model/loader.test.ts` (no other files)
    - Add `checkCells`: `parseAddress` from the engine barrel, row 13 refusal, duplicate Address after upper-casing, `raw` over 500 characters, `parseFormula` with the engine's `Col N: <message>.` text and the Address in the message, `locked` default, `validateCellName` (pattern, reserved, function, address-like) with the rejected text, duplicate names (case-insensitive) naming the earlier Address, the pre-recalculation label rules (`missing-label`, including column A; `label-is-named`), map-area names accepted without a label; build the `effective` Address map and the `names` map; apply the skip rules through `has(prefix)` so no derived error follows a failed field
    - Tests: every Requirement 5 criterion 1 to 13; duplicate address by case; four name-check failures; label cases (empty left cell, formula left cell, column A, named label); a name kept in `names` when its `raw` failed; `raw` stored exactly as written
    - Acceptance: `npm run verify` passes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 8.5, 14.3_

  - [ ] 3.3 [Batch 3] [IDE] Add hero and monster checks to `loader.ts`
    - Files: edit `src/model/loader.ts`, edit `src/model/loader.test.ts` (no other files)
    - Add `checkEntities`: `hero.at` and monster `at` must be Addresses in rows 1 to 12; monster id pattern and length; duplicate ids; overlaps with the hero or an earlier monster; `move` and `atk` must name a Cell_Name (`unknown-rule`, message `monster M1: move rule MOVE_X is not a named cell`); named Cell must be in rows 14 to 20 and non-empty (`bad-rule-cell`, naming the Address); Rule_Names stored upper-case; Author_Order kept; empty `monsters` accepted
    - Tests: Requirement 7 criteria 1, 4, 5, 6, 8, 9, 10, 11, 12; message forms; no derived `unknown-rule` when the named cell's `raw` failed; skip of overlap checks when `at` failed
    - Acceptance: `npm run verify` passes
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.8, 7.9, 7.10, 7.11, 7.12, 8.5_

  - [ ] 3.4 [Batch 3] [IDE] Add sheet construction, placement checks and the final result to `loader.ts`
    - Files: edit `src/model/loader.ts`, edit `src/model/loader.test.ts` (no other files)
    - Add `buildSheet` (only when the collector is empty: `createSheet`, `setRawText` for the 144 map cells then every spec, `setCellName`, `recalculate` with the hero Address and the caller's `RandomSource`; any refusal becomes `engine-refused` with the engine's text and no Sheet); `checkPlacement` in the Requirement 8.1 order (hero Value must be `.`, `X` or `^`; monsters must stand on `.`; each named Rules_Panel Cell's label Value must be a non-empty string, else `bad-label-value` naming the Cell_Name, the label Address and the Value found); skip all of it while any earlier error exists, with no note; finish with `normalize` from `serializer.ts`, `deepFreeze`, and `{ ok: true, level, sheet }`; the Level holds no reference to the Sheet
    - Tests: hero on wall and on `#DIV/0!` (messages `hero start B3 is a wall (#)`), hero on `.`, `X`, `^`; monster on exit, trap, wall and error cell; labels with raw `5`, `=2+3`, `=1=1`, `=1/0`, `=""` give `bad-label-value`; placement checks skipped when an earlier error exists; two loads with equivalent sources give independent Sheets with equal Values and an edit to one leaves the other unchanged; the Level is frozen; the Locked_Flag is read only from the Level; `ink: 0` valid level loads; `engine-refused` through a stubbed refusal where reachable
    - Acceptance: `npm run verify` passes
    - _Requirements: 4.4, 5.14, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.2, 7.3, 7.7, 8.1, 10.1, 12.4_

- [ ] 4. Property-based testing
  - [ ] 4.1 [Batch 4] [Crew] Write property tests for serialization and round trip
    - Files: create `src/model/round-trip.prop.test.ts`
    - **Property 1: Serialization equals the independent normalization**
    - **Property 2: Level round trip and text idempotence**
    - **Property 3: Normalization preserves computed Values**
    - One `assertProperty` per property, at least 100 runs each, each with a comment `// Feature: sheet-model, Property N: <title>`; Property 1 compares `serializeLevel(level)` with `normalizeOracle(doc)`; Property 2 checks the object round trip, the text round trip and byte-identical second text; Property 3 loads `doc` and `serializeLevel(level)` with fresh equal-seed sources and compares all 240 Values; failure output includes the shrunk counterexample and the seed
    - Acceptance: `npm run verify` passes
    - **Validates: Requirements 6.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**

  - [ ] 4.2 [Batch 4] [Crew] Write property tests for loader totality
    - Files: create `src/model/totality.prop.test.ts`
    - **Property 4: The loader is total and does not mutate its input**
    - **Property 5: The text loader is total**
    - **Property 6: Deep nesting is refused, not crashed on**
    - One `assertProperty` per property, at least 100 runs each, comment `// Feature: sheet-model, Property N: <title>`; Property 4 runs `jsonValueArbitrary` and `mutatedDocumentArbitrary`, asserts a result without a throw, codes from `LOAD_ERROR_CODES`, messages of 1 to 300 characters and an input deeply equal to a clone taken before the call; Property 5 runs `anyStringArbitrary` through `loadLevelText`; Property 6 runs `deepNestingArbitrary` as value and as text and expects `ok: false` with `too-deep`
    - Acceptance: `npm run verify` passes
    - **Validates: Requirements 8.3, 9.2, 9.3, 12.1, 12.2, 12.3, 12.5, 12.6, 12.7**

  - [ ] 4.3 [Batch 4] [Crew] Write property tests for placement invariants
    - Files: create `src/model/placement.prop.test.ts`
    - **Property 7: Accepted levels satisfy the placement invariants**
    - **Property 8: Rejected levels produce errors and no Sheet**
    - One `assertProperty` per property, at least 100 runs each, comment `// Feature: sheet-model, Property N: <title>`; Property 7 asserts, for every accepted document, the hero and monster Cell Values, no shared Address, each Rule_Name naming one non-empty Cell in rows 14 to 20, each named panel Cell having a label whose Value is a non-empty string, unique names that pass `validateCellName`, and an empty row 13; Property 8 runs `invalidDocumentArbitrary` and asserts `ok: false`, a non-empty `errors` list and no `sheet` key
    - Acceptance: `npm run verify` passes
    - **Validates: Requirements 5.2, 5.9, 5.11, 5.14, 7.2, 7.3, 7.7, 7.8, 7.9, 7.10, 8.1, 13.1, 13.2, 13.3, 13.4, 13.5**

- [ ] 5. Public API and constraints
  - [ ] 5.1 [Batch 5] [IDE] Create `index.ts` barrel, module scan and loader sanity checks
    - Files: create `src/model/index.ts`, `src/model/module.test.ts`; edit `src/model/testing/arbitraries.test.ts` (adds loader sanity checks, now allowed because the loader exists)
    - Single owner of `index.ts`: named exports only, no default export: `loadLevel`, `loadLevelText`, `serializeLevel`, `serializeLevelText`, `tabLabel`, `LOAD_ERROR_CODES`, and the types `Level`, `LevelDocument`, `CellSpec`, `MonsterSpec`, `LoadError`, `LoadErrorCode`, `LoadResult`, `RandomSource` (`export type` for types); `normalize` and the generators are not exported
    - `module.test.ts` imports `* as model from './index'` and asserts the exact set of runtime export names and no `default`; reads every non-test `.ts` file in `src/model/` (excluding `*.test.ts`, `*.prop.test.ts` and `testing/`), strips comments and string literals, and asserts no `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch`, `XMLHttpRequest`, `Math.random`, `Date.now`, `new Date`, `eval`, `new Function`, no import of `src/game` or `src/ui`, no engine import other than `../engine` or `../engine/index`, and no copy of the Cell_Name or Address regular expressions; includes a self-check that the scanner flags a sample bad snippet; a short end-to-end flow loads a small valid document and calls `tabLabel`
    - `arbitraries.test.ts` additions: generated valid documents load with `ok: true`; generated invalid documents load with `ok: false`
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.5, 1.6, 14.3, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ] 5.2 [Batch 5] [IDE] Final checkpoint
    - Files: none edited unless a defect is found
    - Run `npm run verify`; confirm under Node 22 or later it reports zero failures and zero DOM-related errors
    - Confirm with `git status` and `git diff` that the engine changed only in `src/engine/index.ts` and `src/engine/index.test.ts`, and that nothing is committed
    - Confirm by search that no name of an AI tool other than Kiro appears in `src/model/` or in the sheet-model spec files
    - Ensure all tests pass, ask the user if questions arise.
    - Acceptance: `npm run verify` passes
    - _Requirements: 14.2, 15.6, 15.7_

## Notes

- There are no optional tasks. Example-based tests are part of each implementation task, and the three property test files (4.1, 4.2, 4.3) are required and are the only property-based tests (Requirements 11, 12 and 13).
- Batches 1 (task 1.2), 2 and 4 can be run in Kiro Crew: their tasks edit disjoint files. Batches 3 and 5 run in the IDE because they share files or must run in sequence. Task 1.1 also runs in the IDE and may run beside 1.2.
- Tasks 3.1 to 3.4 edit `loader.ts` and `loader.test.ts` and are strictly sequential.
- Merge a whole batch before starting the next. Fix generator defects found in Batch 4 in the IDE in `testing/arbitraries.ts`.
- The engine changes only in `src/engine/index.ts` and `src/engine/index.test.ts` (task 1.1).
- Each task references granular requirement clauses for traceability.
- This workflow only creates the plan. Start execution by opening this file and choosing "Start task" next to a task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3"] },
    { "id": 5, "tasks": ["3.4"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] }
  ]
}
```
