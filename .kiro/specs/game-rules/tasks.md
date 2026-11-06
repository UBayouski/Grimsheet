# Implementation Plan: Game Rules

## Overview

The design uses TypeScript, so no language question is needed. The plan builds `src/game/` bottom-up: types, the seeded generator and the internal state helpers first, then the run start with its read API, the monster step and the test generators, then `turn.ts` in three sequential steps (moves, waits and the turn sequence; edits; undo), then the three property test files, and last the public barrel, the module scan and the final check.

Rules that apply to every task:

- Each task ends with the same acceptance check: `npm run verify` (`npm test`, then typecheck and lint). It stays green under `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `noUnusedLocals`.
- Game code imports the model only from `../model/index` and the engine only from `../engine/index`. Files under `testing/` import them from `../../model/index` and `../../engine/index`. No game file imports `src/ui/`. The model and the engine are not changed by this spec.
- A module added before its consumer is imported by its own `*.test.ts`, so nothing is unused. Tests sit next to the source and import sibling modules directly, never `src/game/index.ts`, except task 5.1.
- Example-based unit tests are part of each implementation task. The three property test files (4.1, 4.2, 4.3) are required. There are no optional tasks, so no `*` markers are used.
- Run mode: `[Crew]` tasks edit disjoint files and can run in parallel in Kiro Crew. `[IDE]` tasks share files or must run in sequence and run in the IDE.
- Single owners of shared files: `types.ts` (1.1), `random.ts` (1.2), `state.ts` (1.3), `run.ts` (2.1), `monsters.ts` (2.2), `testing/arbitraries.ts` (2.3), `turn.ts` and `turn.test.ts` (3.1 to 3.3, in order), `index.ts` (5.1).
- No `Math.random`, `Date.now`, `new Date`, `eval` or `new Function` anywhere in `src/game/`. All randomness comes from the seeded generator.

## Batch Overview

| Batch | Mode | Tasks | Depends on |
|---|---|---|---|
| 1 | IDE, sequential (each task builds on the one before) | 1.1 types, 1.2 random, 1.3 state helpers | none |
| 2 | Crew, parallel (disjoint files) | 2.1 run and read API, 2.2 monsters, 2.3 test generators | Batch 1 |
| 3 | IDE, strictly sequential (all edit `turn.ts` and `turn.test.ts`) | 3.1 moves, waits and turn sequence; 3.2 edits; 3.3 undo | Batches 1, 2 |
| 4 | Crew, parallel (disjoint files) | 4.1 determinism properties, 4.2 undo properties, 4.3 invariant properties | Batches 2, 3 |
| 5 | IDE, sequential | 5.1 barrel and module scan, 5.2 final checkpoint | Batch 4 |

## Tasks

- [x] 1. Foundations: types, random generator, state helpers
  - [x] 1.1 [Batch 1] [IDE] Create `types.ts` with tests
    - Files: create `src/game/types.ts`, `src/game/types.test.ts`
    - Export every public type of the design (`Direction`, `Status`, `Action`, `EditRecordEntry`, `MonsterState`, `UndoSnapshot`, `RunState`, `RefusalReason`, `DamageSource`, `DamageEntry`, `DamageLog`, `Refusal`, `ActionResult`, `StartRunResult`, `RandomGenerator`), all fields `readonly`; export `REFUSAL_REASONS` with exactly the twelve codes of the design and `MAX_DAMAGE = 1_000_000_000`; `Value`, `Level` and `LoadError` are imported as types from `../engine/index` and `../model/index`
    - Tests: `REFUSAL_REASONS` equals the hard-coded expected array, has no duplicates, and every code is non-empty kebab-case; `MAX_DAMAGE` equals `1e9`; a type-level sample `RunState` and `ActionResult` literal compiles
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.3, 1.4, 1.6, 3.1, 8.1_

  - [x] 1.2 [Batch 1] [IDE] Create `random.ts` with tests
    - Files: create `src/game/random.ts`, `src/game/random.test.ts`
    - Export `createRandom(seed, state?)` (mulberry32, one unsigned 32-bit state, `state` read through a getter, `seed` ignored when `state` is given) and `seedOf(doc)` (own property `seed` of a plain object, an integer from 0 to 4294967295, otherwise 0)
    - Tests: same seed gives the same sequence; 10,000 draws all in [0, 1); resuming with `createRandom(0, g.state)` continues the same sequence; seeds 0 and 4294967295 work; `seedOf` returns the seed for valid values and 0 for `-1`, `1.5`, `4294967296`, a string, `NaN`, a missing field, `null` and a non-object
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.2, 2.1, 2.2, 15.4_

  - [x] 1.3 [Batch 1] [IDE] Create `state.ts` with tests
    - Files: create `src/game/state.ts`, `src/game/state.test.ts`
    - Internal module (not exported by the barrel): the module-private `WeakMap<RunState, Sheet>` registry with `sheetOf`; `makeSheet(level, edits)` that mirrors the model loader (`createSheet`, `setRawText` for the 144 map characters, then every Cell_Spec, then `setCellName`, then the Edit_Record in order) and returns `undefined` on any refused call; `recalc(sheet, heroAddress, generator)` calling `recalculate` with `random: () => gen.next()`; `makeState(fields, sheet)` that deep-freezes the state, its arrays and its snapshot and registers the Sheet; `levelIndex(level)` cached in a `WeakMap` (raw, locked, name per Address); `effectiveRaw`, `currentRaw`, `isLocked`; `wholeDamage(n)` with the `MAX_DAMAGE` cap; address helpers (`neighbour`, in-map test for rows 1 to 12 and columns A to L, `point` conversion) and Reading_Order sorting of monster indices
    - Tests: `wholeDamage` for `0.9` (0), `1.5` (1), `2` (2), `-1` (0), `0` (0), `1e9` (`1e9`), `1e300` (`MAX_DAMAGE`), `NaN` (0), `Infinity` (`MAX_DAMAGE`), `-Infinity` (0); `makeSheet` gives the same 240 Values as the model loader for a small level; applying an Edit_Record changes the edited Cell; two `makeSheet` calls share nothing; `makeState` output is frozen at every depth and registered; `currentRaw` prefers the last edit and falls back to the Level; `levelIndex` merges map characters and specs; `neighbour` off the map and on the map edge; Reading_Order sorts by row then column
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.5, 4.2, 6.6, 7.1, 7.6, 8.1, 10.1, 11.1_

- [x] 2. Run start, monsters, test generators
  - [x] 2.1 [Batch 2] [Crew] Create `run.ts` with tests
    - Files: create `src/game/run.ts`, `src/game/run.test.ts`
    - Export `startRun(doc)` per the design (seed fallback, `loadLevel` with a generator seeded from the document, Load_Errors passed through unchanged, Sheet rebuilt through `makeSheet` and replayed with the seed state, `rngState` equal to the loader position, `valuesHero` and `valuesRngState` set, outer catch giving one `internal-error` Load_Error with a fixed message) and the read API: `cellValue`, `cellRawText`, `isCellLocked`, `cellName`, `describeCellError`, `isPlaying`, `canUndo`
    - Tests: start state fields (hp, ink, turn 0, `playing`, hero, monsters in Author_Order, empty Edit_Record, `undoSnapshot` null); Load_Errors for an invalid document equal the model's; bad seeds start with seed 0; after the replay a generator seeded with the seed ends at the `rngState` the loader left; each reader on a valid Address, an out-of-sheet Address and a non-string Address returns `undefined` for the last two; `cellName` for named and unnamed Cells; `describeCellError` text for an error Cell and `undefined` otherwise; `isPlaying` follows the Status; `canUndo` is false at start; a forged state object gives `undefined`, `false`, `false`; two starts from the same document are equal in every readable field and share no Sheet (an edit built on one leaves the other unchanged)
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 2.2, 11.2_

  - [x] 2.2 [Batch 2] [Crew] Create `monsters.ts` with tests
    - Files: create `src/game/monsters.ts`, `src/game/monsters.test.ts`
    - Export `stepMonsters(sheet, hero, monsters, hp, log, gen)` per the design: monster order fixed in Reading_Order before the loop, live positions so later monsters see earlier moves, `evaluateCell` for `move` then `atk` with `selfAddress`, exact `"N"`, `"S"`, `"E"`, `"W"`, target must be inside the map with Value `"."`, not the hero Address, not another monster, `atk` through `wholeDamage`, one `monster` Damage_Log entry per damaging `atk`, `evaluateCell` results that are not `ok` meaning no move and no damage, every monster acts even when `hp` is 0 or below
    - Tests: one move example per direction; lower-case `"n"`, `"-"`, a number, a boolean, an empty string and an error leave the monster in place; blocked by wall, exit, trap, hero, another monster, an error Cell and the map edge; Reading_Order and live occupancy (two monsters aiming at one Cell); `atk` of `2` (amount 2), `1.5` (amount 1), `0.9`, `0`, `-1`, text, boolean and error (no entry); `atk` of `1e300` logs `MAX_DAMAGE`; `atk` evaluated with the position after the move; the three explicit examples of Requirement 7.7 (a `move` Cell that is an error leaves the monster in place; an `atk` Cell that is an error deals no damage; a wall Cell turned into floor by an edit opens a move that was refused before, built with `makeSheet` and an Edit_Record); a monster keeps acting at `hp` 0
    - Acceptance: `npm run verify` passes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 2.2_

  - [x] 2.3 [Batch 2] [Crew] Create `testing/arbitraries.ts` with a smoke test
    - Files: create `src/game/testing/arbitraries.ts`, `src/game/testing/arbitraries.test.ts`
    - Single owner of all generators. Imports only `fast-check`, `../../model/index`, `../../engine/index` and sibling game files that already exist. Export `gameLevelArbitrary` (12 by 12 map from `# . X ^` with a guaranteed floor patch; hero on a floor Cell; 0 to 4 monsters on distinct `.` Cells with labelled `MOVE_Mn` and `ATK_Mn` rule Cells in rows 14 to 20; seed; `startingHp` 1 to 20; `ink` 0 to 5; the `move` pool, `atk` pool and `TRAP` pool of the design including `0.9`, `1.5`, `1e300`, text and error values; extra Cells with `RAND()` terrain away from entity starts, `=1/0`, a two-Cell cycle and locked Cells), `actionListArbitrary` (0 to 40 entries; weighted moves, waits, edits over all 240 Cells including row 13 and invalid address text, undos and malformed values such as `null`, `{ kind: 'jump' }`, `{ kind: 'move', dir: 'X' }`, `{ kind: 'edit', address: 5, raw: 'x' }`; edit texts from literals, glyphs, valid formulas, `RAND()` formulas, cycles, invalid formulas such as `=1+` and text over 500 characters), `stateDifference(a, b, options)` implementing State_Equality (`hero`, `hp`, `ink`, `turn`, `status`, `rngState`, `valuesHero`, `valuesRngState`, `edits`, `monsters`, the Level reference, `[cellRawText, cellValue]` for all 240 Cells, the snapshot recursively; `options.ignoreSnapshot` skips the snapshot; returns `undefined` when equal, else the name of the first differing field), `assertProperty(property, numRuns)` that honours `FC_SEED`, and a seeded `RandomSource`. Nothing here is exported from the barrel
    - Smoke tests that do not need `run.ts` or `turn.ts`: generated Level_Documents have the expected shape (12 map rows of 12 glyphs, at most 4 monsters, rule Cells in rows 14 to 20 with labels); every generated Level_Document is accepted by the model's `loadLevel`; generated action lists have 0 to 40 entries and include at least one malformed value across many samples; `stateDifference` is exercised on hand-built plain objects only where it does not need the registry; the file never uses `Math.random`
    - Acceptance: `npm run verify` passes
    - _Requirements: 12.2, 13.3, 14.5, 15.2, 15.4_

- [x] 3. Turn algorithm
  - [x] 3.1 [Batch 3] [IDE] Create `turn.ts`: action shell, moves, waits and the turn sequence
    - Files: create `src/game/turn.ts`, `src/game/turn.test.ts`
    - Implement `parseAction` (copies fields, `invalid-action` for any malformed value), `applyAction` with the registry check (`internal-error` for a forged state), the `not-playing` check, the fixed refusal message templates of the design, and one outer `try/catch` that ignores the thrown value and returns the fixed `internal-error` Refusal; the move path (`blocked` for a target outside rows 1 to 12 or columns A to L or not `.`, `X` or `^`, checked before `occupied`) and the wait path; `runTurn` for steps 3 to 7: fresh Sheet and recalculation, `stepMonsters`, the trap (hero Cell is `^`, `TRAP` number through `wholeDamage`), haunting once when `listCycleCells` is non-empty on the step 3 Sheet, the second recalculation with `valuesRngState` taken just before it, the outcome (loss before win, a hero on a non-walkable Cell stays alive), `turn + 1`, `undoSnapshot` of the previous state, results and Damage_Logs frozen. Edit and undo actions return a placeholder `internal-error` Refusal until 3.2 and 3.3
    - Tests: `REFUSAL_REASONS` all have messages of 1 to 200 characters; each malformed Action gives `invalid-action`; a throwing getter gives `internal-error`; a forged state gives `internal-error`; one move per direction; wall, error Cell, map edge and row 13 neighbour give `blocked`; a monster on a walkable Cell gives `occupied`; a refused move leaves `turn`, `ink` and `rngState` of the caller alone and returns no state; `turn` rises by exactly 1 on an accepted Action; step order with scripted rules (trap damage is logged before haunting damage; a monster that moves is seen by the next monster); `TRAP` absent, `0`, `0.5`, `1.5` (damage 1), `2`, text, a positive number; trap damage again on every turn spent on `^`; haunting once for several cycle Cells; loss beats win on `X` with `hp` 0; a hero on an error Cell lives and can walk out; `not-playing` for move and wait after a win and after a loss; whole-number damage examples: `atk` `0.9` logs nothing, `1.5` logs 1, `1e300` logs exactly `MAX_DAMAGE` with `hp` equal to old `hp - 1e9`, a safe integer and Status `lost`, the same for `TRAP` `1e300`, several monsters with `1e300` give `hp` equal to the old `hp` minus the logged sum and still a safe integer, and `startingHp` of `Number.MAX_SAFE_INTEGER` with damage 1 gives `Number.MAX_SAFE_INTEGER - 1`; a `RAND()` turn stores the advanced `rngState`
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.5, 1.6, 1.7, 3.1, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 11.1_

  - [x] 3.2 [Batch 3] [IDE] Add the edit action to `turn.ts`
    - Files: edit `src/game/turn.ts`, edit `src/game/turn.test.ts` (no other files)
    - Replace the edit placeholder: the checks in the Requirement 6.1 order (`not-playing`, `bad-address` via `parseAddress`, `reserved-row` for row 13, `locked`, `unchanged` against `currentRaw`, `no-ink`, `parse-error`), where the last check refuses text over 500 characters with `Text is longer than 500 characters.` and refuses a leading `=` text that `parseFormula` rejects with the engine's `Col N: <message>.` text unchanged; validate before anything is stored; on success append the canonical `{ address, raw }` to the Edit_Record, subtract 1 from `ink`, run `runTurn`; no check against the Cell under the hero or a monster; a `setRawText` refusal after validation gives `internal-error`
    - Tests: each refusal reason in the Requirement 6.1 order (a case that fails two checks reports the earlier one); a Cell without a Cell_Spec is editable; lower-case address accepted and stored canonical; a `Col N:` message equals the engine text; a 500-character literal is accepted and a 501-character one is `parse-error` with the fixed message and no ink spent; refused edits leave `turn`, `ink`, `rngState` and the Edit_Record alone; an accepted edit spends 1 ink, appends one entry and runs the full turn (monsters act, haunting applies); an edit that makes the Cell under the hero or a monster a wall is accepted and the entity stays; an edit that removes the last cycle causes no haunting that turn; an edit that turns a wall into floor opens a move that was refused before; a move onto a Cell where a monster stands, after an edit turned that Cell into a wall, is refused as `blocked` and not `occupied`; an edit that breaks a monster's `atk` stops its damage
    - Acceptance: `npm run verify` passes
    - _Requirements: 4.1, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.7, 8.3_

  - [x] 3.3 [Batch 3] [IDE] Add undo and isolation to `turn.ts`
    - Files: edit `src/game/turn.ts`, edit `src/game/turn.test.ts` (no other files)
    - Replace the undo placeholder: `not-playing` once the Status is `won` or `lost`, `nothing-to-undo` when `undoSnapshot` is `null`, otherwise `restore`: `makeSheet(level, snapshot.edits)`, `recalc` at `valuesHero` with `createRandom(0, valuesRngState)`, the snapshot fields restored exactly (`hp`, `ink`, `turn`, `rngState` and the rest, no clamp), `undoSnapshot` set to `null`, `damage` an empty Damage_Log; one level of undo only
    - Tests: undo after a move; undo after an edit refunds the ink and restores the Raw_Text; undo after a turn that took damage restores `hp` exactly; undo after a `RAND()` turn restores the Values of `RAND()` Cells and the next draw equals the next draw before the undone turn; a second undo is `nothing-to-undo`; undo at start is `nothing-to-undo`; undo after a win and after a loss is `not-playing`; a refused Action does not change what an undo does; the old state passed in keeps every readable value after later Actions and after an undo (no shared Sheet); no snapshot chain deeper than one
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.5, 5.5, 10.1, 10.2, 10.3, 10.4, 11.1_

- [x] 4. Property-based testing
  - [x] 4.1 [Batch 4] [Crew] Write the determinism property test
    - Files: create `src/game/determinism.prop.test.ts`
    - **Property 1: Determinism**
    - One `assertProperty` of at least 100 runs (planned 200), comment `// Feature: game-rules, Property 1: Determinism`; run `startRun` and the Action list twice and compare each `ActionResult` (`ok` values, Refusal reasons and messages, Damage_Logs) and each Run_State with `stateDifference`; failure output includes the shrunk counterexample and the seed
    - Acceptance: `npm run verify` passes
    - **Validates: Requirements 12.1, 12.2, 2.1, 2.2, 11.2**

  - [x] 4.2 [Batch 4] [Crew] Write the undo property tests
    - Files: create `src/game/undo.prop.test.ts`
    - **Property 2: Accepted undo is the exact inverse of an accepted Turn_Action**
    - **Property 3: Undo refusals**
    - One `assertProperty` per property, at least 100 runs each, comment `// Feature: game-rules, Property N: <title>`; Property 2 walks the list, applies an undo after each accepted Turn_Action, compares with the earlier state through `stateDifference` with `ignoreSnapshot`, checks the snapshot is `null`, and checks the next generator draw from the restored `rngState` equals the next draw from the earlier state, then continues from the post-turn state; Property 3 checks `nothing-to-undo` on fresh and just-undone states and that an undo gives the same result before and after any refused Action
    - Acceptance: `npm run verify` passes
    - **Validates: Requirements 13.1, 13.2, 13.3, 10.1, 10.2, 10.3, 6.6, 1.5, 4.4**

  - [x] 4.3 [Batch 4] [Crew] Write the invariant property tests
    - Files: create `src/game/invariants.prop.test.ts`
    - **Property 4: Ink bounds**
    - **Property 5: HP accounting and the Damage_Log**
    - **Property 6: Entity placement**
    - **Property 7: Status finality and meaning**
    - One `assertProperty` per property, at least 100 runs each (planned 200 for Properties 5 to 7), comment `// Feature: game-rules, Property N: <title>`; Property 4 checks `ink` stays within 0 and the level ink and rises only through an accepted undo; Property 5 replays each Damage_Log against the earlier `hp` in log order, checks whole amounts from 1 to `MAX_DAMAGE`, entry order (monsters, then at most one trap, then at most one haunt of amount 1), `hp` a safe integer, and, with the smaller generator that keeps `RAND()` out of `atk`, the "present exactly when" clauses using the read API and `evaluateCell` on a Sheet built the same way; Property 6 checks distinct Addresses and positions inside rows 1 to 12 and columns A to L; Property 7 checks finality, `won` implies `hp > 0` and the hero Cell `X`, `lost` iff `hp <= 0`
    - Acceptance: `npm run verify` passes
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 5.1, 5.5, 6.4, 6.6, 7.3, 7.6, 8.1, 8.3, 9.1, 9.2, 9.3, 9.4**

- [ ] 5. Public API and constraints
  - [ ] 5.1 [Batch 5] [IDE] Create the `index.ts` barrel, module scan and generator sanity checks
    - Files: create `src/game/index.ts`, `src/game/module.test.ts`; edit `src/game/testing/arbitraries.test.ts` (adds checks that need `run.ts` and `turn.ts`, now allowed because they exist)
    - Single owner of `index.ts`: named exports only, no default export. Runtime names (13): `startRun`, `applyAction`, `createRandom`, `cellValue`, `cellRawText`, `isCellLocked`, `cellName`, `describeCellError`, `isPlaying`, `canUndo`, `REFUSAL_REASONS`, `MAX_DAMAGE`, `seedOf`. Types via `export type`: `Action`, `Direction`, `Status`, `RunState`, `UndoSnapshot`, `MonsterState`, `EditRecordEntry`, `ActionResult`, `Refusal`, `RefusalReason`, `DamageEntry`, `DamageLog`, `DamageSource`, `StartRunResult`, `RandomGenerator`, plus `Value` and `Level` re-exported from the engine and model. Nothing else is exported (not the registry, `makeSheet`, `recalc`, `stepMonsters`, `wholeDamage` or any test helper)
    - `module.test.ts`: parses `index.ts` and compares the sorted exported names with the expected list of 13 runtime and 17 type names; imports the barrel and compares `Object.keys` with the 13 runtime names and asserts no `default`; reads every non-test `.ts` file under `src/game/`, including `testing/` and excluding `*.test.ts` and `*.prop.test.ts`, strips comments and string literals, and asserts the file list matches the design table, no `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch`, `XMLHttpRequest`, `AudioContext`, `Math.random`, `Date.now`, `new Date`, `eval`, `new Function`, imports only from files inside `src/game/`, `../model/index` and `../engine/index` (`../../model/index` and `../../engine/index` from `testing/`), no `src/ui` import, and no AI tool name other than Kiro using a deny-list assembled from string fragments so the test file does not spell the names; includes a self-check that the scanner flags a sample bad snippet; the suite needs no DOM environment
    - `arbitraries.test.ts` additions: every generated level starts with `startRun`; every generated action list is accepted by `applyAction` without throwing (refusals are fine); `stateDifference` reports `undefined` for two starts of one document and a field name after a move
    - Acceptance: `npm run verify` passes
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 12.2_

  - [ ] 5.2 [Batch 5] [IDE] Final checkpoint
    - Files: edit `.kiro/specs/game-rules/tasks.md` to tick the checkboxes; no source edits unless a defect is found
    - Run `npm run verify`; confirm under Node 22 or later it reports zero failures and zero DOM-related errors
    - Confirm with `git status` and `git diff` that only files under `src/game/` and the game-rules spec files changed, with no change under `src/model/` or `src/engine/`, and that nothing is committed
    - Confirm by search that no name of an AI tool other than Kiro appears in `src/game/` or in the game-rules spec files
    - Ensure all tests pass, ask the user if questions arise.
    - Acceptance: `npm run verify` passes
    - _Requirements: 15.5, 15.6_

## Notes

- There are no optional tasks. Example-based tests are part of each implementation task, and the three property test files (4.1, 4.2, 4.3) are required and are the only property-based tests (Requirements 12, 13 and 14).
- Batches 2 and 4 can be run in Kiro Crew: their tasks edit disjoint files. Batches 1, 3 and 5 run in the IDE because their tasks build on each other or share files.
- Tasks 3.1 to 3.3 edit `turn.ts` and `turn.test.ts` and are strictly sequential.
- Merge a whole batch before starting the next. Fix generator defects found in Batch 4 in the IDE in `testing/arbitraries.ts` (owned by 2.3), never in parallel.
- The model and the engine are not changed by this spec.
- Each task references granular requirement clauses for traceability.
- This workflow only creates the plan. Start execution by opening this file and choosing "Start task" next to a task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["3.3"] },
    { "id": 7, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2"] }
  ]
}
```
