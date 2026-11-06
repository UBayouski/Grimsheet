# Implementation Plan: Levels

**Note: Batches 1 to 4 do not depend on grid-ui. They need only the finished barrels `src/engine/index.ts`, `src/model/index.ts` and `src/game/index.ts`, which exist already. Batch 5 (the `main.ts` swap, Requirement 14) waits for grid-ui tasks 4.2 and 5.2, because `src/stub-levels.ts` and the `mountApp` call in `src/main.ts` do not exist yet. Task 5.1 is tagged `[needs grid-ui 4.2 and 5.2]`.**

## Overview

The design uses TypeScript, so no language question is needed. The plan adds `src/levels/` bottom-up: the repository config and the shared test helper first (task 1.1), then the five levels in parallel (each one a Level_File, a Solution_File and a per-level test file, tasks 2.1 to 2.5), then the cross-level files (the barrel with its test, and the files, solutions, search and scan tests, tasks 3.1 to 3.5), then the final check (4.1), and last the `main.ts` swap (5.1), which waits for grid-ui.

Rules that apply to every task:

- Each task ends with the same acceptance check: `npm run verify` (`npm test`, then typecheck and lint). It stays green under `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `noUnusedLocals`. Task 5.1 also needs `npm run build` to succeed with the checks of the design.
- Level tests import the lower layers only through `../game/index`, `../model/index` and `../engine/index`, and the helper as `./helpers`. Besides `vitest` and `node:` modules they import nothing else (Requirement 15.1). No file under `src/levels/` is imported by a layer below it. No task changes `src/game/`, `src/model/` or `src/engine/`.
- Example-based unit tests are part of each task. There are no optional tasks, so no `*` markers are used. There are no property tests in this spec (see the Property-based testing note in `requirements.md`): the inputs are five fixed documents and five fixed action lists.
- All tests run in the default Node environment with no DOM. No test calls a clock or asserts elapsed time. No file under `src/levels/` uses `Math.random`, `Date.now`, `new Date`, `performance.now`, `eval` or `new Function`.
- Search tests (3.4) carry the Vitest timeout of 60_000 ms as the third argument of `it`.
- Level files are produced, not typed (design, Authoring workflow). Each level task uses a throwaway scratch test `src/levels/author-NN.scratch.test.ts` that builds the Level_Document, loads it with `loadLevel` and `createRandom(seed)`, fails on any Load_Error, writes `serializeLevelText(level)` to the Level_File and `JSON.stringify(solution, null, 2) + '\n'` to the Solution_File with `writeFileSync`, and is deleted before the task ends. Scratch files never ship.
- The level facts come from the design blueprints, which came from throwaway drafts. If a hand number fails when the real file is tested, fix the level (not the test) within the bounds of the requirements, and report the change.
- Run mode: `[Crew]` tasks edit disjoint files and can run in parallel in Kiro Crew. `[IDE]` tasks share files or must run in sequence and run in the IDE.
- Single owners of shared files: `.gitattributes`, `src/levels/helpers.ts` and `src/levels/helpers.test.ts` (1.1), `eslint.config.js` (1.1, only if the fallback is needed), each `NN-slug.json`, `tests/solutions/NN-slug.json` and `level-NN.test.ts` (2.N), `src/levels/index.ts` and `index.test.ts` (3.1), `files.test.ts` (3.2), `solutions.test.ts` (3.3), `search.test.ts` (3.4), `scan.test.ts` (3.5), `src/main.ts`, `src/stub-levels.ts` and `src/ui/fixture-levels.test.ts` (5.1).
- Because the repo-wide checks (the barrel, the cross-level tests, the Deny_List scan) come in Batch 3, the level tasks of Batch 2 check only their own level.

## Batch Overview

| Batch | Mode | Tasks | Depends on |
|---|---|---|---|
| 1 | IDE | 1.1 `.gitattributes` and the helper | None (the three barrels exist) |
| 2 | Crew, parallel (disjoint files) | 2.1 Level 1, 2.2 Level 2, 2.3 Level 3, 2.4 Level 4, 2.5 Level 5 | Batch 1 |
| 3 | Crew, parallel (disjoint files) | 3.1 barrel and index test, 3.2 files test, 3.3 solutions test, 3.4 search test, 3.5 scan test | Batch 2 |
| 4 | IDE | 4.1 final checkpoint | Batch 3 |
| 5 | IDE, blocked | 5.1 `main.ts` swap and stub removal | Batch 4 and grid-ui tasks 4.2 and 5.2 |

## Tasks

- [ ] 1. Repository config and shared helper
  - [ ] 1.1 [Batch 1] [IDE] Create `.gitattributes` and `helpers.ts` with tests
    - Files: create `.gitattributes`, `src/levels/helpers.ts`, `src/levels/helpers.test.ts`; edit `eslint.config.js` only if `npm run lint` flags `helpers.ts`
    - `.gitattributes` holds exactly the lines `src/levels/*.json text eol=lf` and `tests/solutions/*.json text eol=lf`. Create it before any level file exists, so `core.autocrlf=true` cannot rewrite the JSON later. Later (task 4.1) `git ls-files --eol` confirms it
    - `helpers.ts` imports only `node:fs`, `../game/index`, `../model/index` and `../engine/index`, and exports the full API of the design: `LEVEL_IDS` (the five ids in order), `readLevelText`, `loadLevelFile` (uses `loadLevelText` with `createRandom(seedOf(doc))`, throws with each Load_Error printed as `path: code: message`), `readSolutionText`, `parseSolution(text)` (pure: `JSON.parse` plus the Requirement 9 shape checks, throwing with the file text's first bad field path such as `actions[3]: unexpected key "foo"`), `readSolution(id)` (wraps `parseSolution` around `readSolutionText`), `replay` (stops at the first refusal and records `refusedAt`), `finalSnapshot`, `stateKey` (exact joined text, `turn` excluded), `searchEditFree(doc, limits)` (breadth-first over `move N/S/E/W` and `wait`, defaults `{ maxDepth: 100, maxStates: 1000 }`, outcomes `exhausted`, `won`, `limit`), `describeLimit(result, levelId)` (the inconclusive message of the design), `walkableCount`, `manhattan`, `boardText` and `describeStep`
    - File reading uses `readFileSync(new URL('./<id>.json', import.meta.url), 'utf8')` for levels and `new URL('../../tests/solutions/<id>.json', import.meta.url)` for solutions (design D1). No `node:path`, no `__dirname`, no clock of any kind (no `performance.now`), no `Math.random`, no `Date.now`, no `new Date`
    - Tests use small INLINE Level_Documents (the real level files do not exist yet) and in-memory JSON text, so the test file reads no file: `replay` stops at the first refusal and records `refusedAt`, and leaves later actions unapplied; `stateKey` is equal for two starts of one document, differs after a move and after a hit, and ignores `turn` (a wait in a safe spot returns the same key); `searchEditFree` returns `won` on a tiny corridor, `exhausted` on a tiny closed room with no exit (states above 1), and `limit` with `{ maxDepth: 1, maxStates: 3 }` on an open room, with `limit` set to `depth` or `states` as the case may be; `describeLimit` returns the text "Edit-free search of <id> is inconclusive: stopped at the <states|depth> limit after N states and M layers (limits: 100 turns, 1000 states)." followed by "Shrink the walkable area of the level before raising a limit." (assert the key phrases and the numbers, not the whole text); `walkableCount` counts `.`, `X`, `^` Map_Area cells of an inline level and not a cell whose Value is `#` or an error; `manhattan('B6','K6')` is 9 and `manhattan('B6','C7')` is 2; `parseSolution` accepts a valid text and rejects an `undo` action, an extra field on an action, a missing `minimalInk`, a bad `dir`, an empty `actions` array and an edit count different from `minimalInk`; `LEVEL_IDS` has five unique ids in numeric order; `boardText` shows `@` for the hero and `M` for a monster
    - If `eslint` flags `helpers.ts`, add `'src/levels/helpers.ts'` to the `files` list of the Node-globals block of `eslint.config.js` (the fallback of the design) and nothing else, and report it
    - Acceptance: `npm run verify` passes
    - _Requirements: 2.3, 9.1, 9.2, 9.3, 11.1, 11.2, 11.3, 15.1, 15.3, Decisions 8, 14, 16 and 18, design D1_

- [ ] 2. The five levels
  - [ ] 2.1 [Batch 2] [Crew] Level 1, The Corridor
    - Files: create `src/levels/01-the-corridor.json`, `tests/solutions/01-the-corridor.json`, `src/levels/level-01.test.ts`; create and delete `src/levels/author-01.scratch.test.ts`
    - Produce both JSON files with the scratch generator exactly per Blueprint 1 of the design: title `The Corridor`, `startingHp` 3, `ink` 0, `seed` 1, hero `B6`, no monsters, a corridor `B6` to `K6` with `X` at `K6`, all 144 map cells locked, one panel row (row 14: locked label `Steps to the exit` at `A14`, locked named cell `DIST_TO_EXIT` at `B14` with `=DIST(HERO,K6)`), the hint `Walk east. The rules panel counts the steps in DIST_TO_EXIT. Someone has to.`, solution of nine `move E` with `minimalInk` 0
    - Tests in `level-01.test.ts`: the level loads and `startRun` is ok with `hp` 3, `ink` 0 and Status `playing`; the file text equals `serializeLevelText` of its loaded Level; the raw text, locked flag and Cell_Name of `DIST_TO_EXIT`; the Editable_Cell set is empty; no monsters; the hero starts on `B6` and the Value at `K6` is `X`; the title, the Tab_Label `Sheet1: The Corridor` and the hint substring checks of Requirement 2.5 (`DIST_TO_EXIT`, and `rules panel` case-insensitive); `DIST_TO_EXIT` reads 9 at load and 0 after the last step; the stored solution replays to `won` through the helper, every action accepted, `hp` above 0 before the last action and `hp` 3 at the end
    - Hand check from the design: nine moves, no monster, trap or cycle
    - The scratch file is deleted at the end; `git status` shows only the three files of this task
    - Acceptance: `npm run verify` passes
    - _Requirements: 4.1, 4.2, 2.1, 2.2, 2.5, 3.1, 3.3, 9.1, 9.3, 10.1, 10.2, 10.3, 13.1_

  - [ ] 2.2 [Batch 2] [Crew] Level 2, The Chaser
    - Files: create `src/levels/02-the-chaser.json`, `tests/solutions/02-the-chaser.json`, `src/levels/level-02.test.ts`; create and delete `src/levels/author-02.scratch.test.ts`
    - Produce both JSON files per Blueprint 2: title `The Chaser`, `startingHp` 3, `ink` 2, `seed` 2, hero `B6`, monster `M1` at `H6` with `move` `MOVE_M1` and `atk` `ATK_M1`, a 10 by 5 room (rows 4 to 8, columns B to K) with `X` at `K6`, all map cells locked, panel rows 14 and 15 with locked labels `Move rule of M1` and `Attack rule of M1` and unlocked named cells `MOVE_M1` (`=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")`) and `ATK_M1` (`=IF(DIST(HERO,SELF)<2,2,0)`), the hint `MOVE_M1 decides who gets chased. It is only text.`, seed 2, and the solution of 14 actions with `minimalInk` 1: `edit B14 =IF(DIST(HERO,SELF)<1,TOWARD(HERO),"-")`, `move E` x4, `move N` x2, `move E` x5, `move S` x2
    - Tests in `level-02.test.ts`: loads, `startRun` ok with `hp` 3 and `ink` 2, file text equals `serializeLevelText` of the loaded Level; raw texts and locked flags of `MOVE_M1` and `ATK_M1`; the Editable_Cell set is exactly `MOVE_M1` and `ATK_M1`; one monster `M1` at `H6` with the rule names; the exit `X` at `K6` lies behind the monster; size rule of Requirement 11.4: `walkableCount` is at most 60 (50 in the blueprint); title, Tab_Label `Sheet2: The Chaser`, hint substring `MOVE_M1`; the stored solution replays to `won`, every action accepted, `hp` above 0 before the last action and `hp` 3 at the end; no path cell of the stored route is closer than 2 to `H6` (hand check of the design, computed from the Manhattan distance)
    - The scratch file is deleted at the end; `git status` shows only the three files of this task
    - Acceptance: `npm run verify` passes
    - _Requirements: 5.1, 5.2, 5.3, 2.1, 2.2, 2.5, 3.1, 3.3, 9.1, 9.3, 10.1, 10.2, 10.3, 11.4, 13.1_

  - [ ] 2.3 [Batch 2] [Crew] Level 3, The Locked Crypt
    - Files: create `src/levels/03-the-locked-crypt.json`, `tests/solutions/03-the-locked-crypt.json`, `src/levels/level-03.test.ts`; create and delete `src/levels/author-03.scratch.test.ts`
    - Produce both JSON files per Blueprint 3: title `The Locked Crypt`, `startingHp` 3, `ink` 2, `seed` 3, hero `B6`, no monsters, two chambers divided by column G (wall in rows 4, 5, 7 and 8) with the locked door formula cell `G6` (`=IF(KEY=1337,".","#")`) and `X` at `K6`, panel rows 14 to 17: `RUNE_ASH` `8`, `RUNE_SALT` `190`, `RUNE_DUST` `13` (all three unlocked) and `KEY` `=RUNE_ASH*RUNE_SALT` (locked), each with a locked label of 1 to 24 characters, the hint `The door asks KEY a question. Read what feeds KEY: RUNE_ASH, RUNE_SALT. Not every rune is on the payroll.`, and the solution of 11 actions with `minimalInk` 2: `edit B14 7`, `edit B15 191`, `move E` x9
    - Tests in `level-03.test.ts`: loads, `startRun` ok with `hp` 3 and `ink` 2, file text equals `serializeLevelText` of the loaded Level; the door text at `G6` and its lock flag; `KEY` text and lock flag; at load `KEY` reads 1520 and the Value at `G6` is `#`; `RUNE_DUST` is read by no formula (its raw text appears in no other cell's formula); the Editable_Cell set is exactly `RUNE_ASH`, `RUNE_SALT` and `RUNE_DUST`; title, Tab_Label `Sheet3: The Locked Crypt`, hint substrings (`KEY`, and `RUNE_ASH` or `RUNE_SALT`); an edit of `RUNE_DUST` alone leaves the door at `#`; the stored solution replays to `won`, every action accepted, `hp` above 0 before the last action, `hp` 3 and `ink` 0 at the end, with `KEY` 1330 after the first edit and 1337 after the second. No test claims that two edits are required (Decisions 9 and 17)
    - The scratch file is deleted at the end; `git status` shows only the three files of this task
    - Acceptance: `npm run verify` passes
    - _Requirements: 6.1, 6.2, 6.3, 2.1, 2.2, 2.5, 3.1, 3.3, 9.1, 9.3, 10.1, 10.2, 10.3, 13.1_

  - [ ] 2.4 [Batch 2] [Crew] Level 4, The Trap Row
    - Files: create `src/levels/04-the-trap-row.json`, `tests/solutions/04-the-trap-row.json`, `src/levels/level-04.test.ts`; create and delete `src/levels/author-04.scratch.test.ts`
    - Produce both JSON files per Blueprint 4: title `The Trap Row`, `startingHp` 5, `ink` 1, `seed` 4, hero `B6`, no monsters, a room (rows 2 to 11, columns B to K) crossed by a two-column band of `^` in columns F and G, a gap in row 6 where `F6` is the locked formula cell `=IF(RATIO>=0,".","#")` and `G6` is floor, `X` at `K6`, panel rows 14 to 17: `TRAP` `3` (locked), `RATIO` `=LOAD/DIVISOR` (locked), `LOAD` `6` and `DIVISOR` `0` (unlocked), each with a locked label, the hint `The #DIV/0! cell is a hole. Follow RATIO back to its cause. Traps bite.`, and the solution of 10 actions with `minimalInk` 1: `edit B17 1`, `move E` x9
    - Tests in `level-04.test.ts`: loads, `startRun` ok with `hp` 5 and `ink` 1, file text equals `serializeLevelText` of the loaded Level; `TRAP` is 3 and locked; the raw text of `RATIO`, `LOAD` and `DIVISOR`; at load the Value at `F6` and the Value of `RATIO` are `#DIV/0!`; the Editable_Cell set is exactly `LOAD` and `DIVISOR`; no monsters; the band covers columns F and G in rows 2 to 5 and 7 to 11; title, Tab_Label `Sheet4: The Trap Row`, hint substrings (`#DIV/0!` and `RATIO`); an edit of `LOAD` leaves `RATIO` as `#DIV/0!` (decoy); a crossing over the traps loses (one step onto `F5` leaves `hp` 2, the second step is fatal); the stored solution replays to `won`, every action accepted, `hp` above 0 before the last action, `hp` 5 and `ink` 0 at the end
    - The scratch file is deleted at the end; `git status` shows only the three files of this task
    - Acceptance: `npm run verify` passes
    - _Requirements: 7.1, 7.2, 7.3, 2.1, 2.2, 2.5, 3.1, 3.3, 9.1, 9.3, 10.1, 10.2, 10.3, 13.1_

  - [ ] 2.5 [Batch 2] [Crew] Level 5, The Lich
    - Files: create `src/levels/05-the-lich.json`, `tests/solutions/05-the-lich.json`, `src/levels/level-05.test.ts`; create and delete `src/levels/author-05.scratch.test.ts`
    - Produce both JSON files per Blueprint 5: title `The Lich`, `startingHp` 6, `ink` 2, `seed` 5, hero `B6`, monster `M1` at `I6` (`DIST` 7 from the hero on a straight line of floor), a 10 by 5 room (rows 4 to 8, columns B to K) with the locked gate formula cell `K4` (`=IF(LICH_HP<=0,"X","#")`), panel rows 14 to 19: `MOVE_M1` (`=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")`, locked), `ATK_M1` (`=IF(DIST(HERO,SELF)<=2,LICH_HP,0)`, locked), `LICH_HP` (`=MAX(1,PHYLACTERY)`, unlocked), `PHYLACTERY` (`4`, locked), `HEX_A` (`=HEX_B+1`, unlocked), `HEX_B` (`=HEX_A+1`, unlocked), each with a locked label, the hint `LICH_HP is just a number. Change it while he is far. HEX_A and HEX_B haunt the sheet.`, and the solution of 13 actions with `minimalInk` 2: `edit B16 0`, `edit B19 0`, `move N` x2, `move E` x9
    - Tests in `level-05.test.ts`: loads, `startRun` ok with `hp` 6 and `ink` 2, file text equals `serializeLevelText` of the loaded Level; raw texts and lock flags of every named cell; the Editable_Cell set is exactly `LICH_HP`, `HEX_A` and `HEX_B`; at load `LICH_HP` is 4, the Value at `K4` is `#`, and `HEX_A` and `HEX_B` are `#CYCLE!`; one monster `M1` with `MOVE_M1` and `ATK_M1`; size rule: `walkableCount` is 49 and at most 60 (the gate counts as not walkable at load); title, Tab_Label `Sheet5: The Lich`, hint substrings (`LICH_HP`, and `HEX_A` or `HEX_B`)
    - Requirement 8.1 arithmetic: `manhattan(hero, M1)` is 7 and the cells between them are floor; the shortest walkable route from the hero start to `K4` (a small flood fill on the Values after the gate is opened by `LICH_HP` 0) is at least 6 moves (11 in the blueprint); one haunting turn of the stored solution against `startingHp` 6, and a player who never breaks the cycle pays at least 1 + 6 = 7 HP against 6
    - First three moves (`move E` x3): each accepted, Status `playing`, `M1` still on `I6`, each Damage_Log is exactly `[{ source: { kind: 'haunt' }, amount: 1 }]`, `hp` 5, 4, 3
    - Loss_Variant defined as data in the test (`move E` x4, then `edit B16 0`, then `edit B19 0`): the 4th move ends with Status `lost` and a Damage_Log entry from `M1` of amount 4; the two edits after it are refused with `not-playing`
    - `LICH_HP` edit distance: the `edit B16 0` Action is accepted as the first Action while `manhattan(hero, M1)` is 7, which is greater than 2
    - Minus-one-ink: the stored solution on a copy of the document with `ink` 1 is refused at the second edit with `no-ink`
    - Stored solution: replays to `won`, every action accepted, `hp` above 0 before the last action, final `hp` 5, `ink` 0, `turn` 13 and exactly one haunting turn (turn 1)
    - The scratch file is deleted at the end; `git status` shows only the three files of this task
    - Acceptance: `npm run verify` passes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 2.1, 2.2, 2.5, 3.1, 3.3, 9.1, 9.3, 10.1, 10.2, 10.3, 11.4, 13.1, 13.2_

- [ ] 3. Cross-level files
  - [ ] 3.1 [Batch 3] [Crew] Create the `index.ts` barrel with its test
    - Files: create `src/levels/index.ts`, `src/levels/index.test.ts`
    - `index.ts` holds exactly the five JSON imports (`./01-the-corridor.json` to `./05-the-lich.json`) and `export const LEVELS: readonly unknown[] = [level01, level02, level03, level04, level05];`. No call, no default export, no browser global, no other import
    - Tests: the non-test entries of `src/levels/` (read with `node:fs`) are exactly the five Level_Files, `index.ts` and `helpers.ts`, with no subdirectory; `LEVELS` has 5 entries and `Object.keys` of the module is `['LEVELS']` with no `default`; each element deep-equals `JSON.parse` of the file text at the same position; the source of `index.ts` has exactly five imports of the five JSON files, one export, no `(` call and no `default`
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 15.3, Decision 1_

  - [ ] 3.2 [Batch 3] [Crew] Create the files test (all five levels)
    - Files: create `src/levels/files.test.ts`
    - Tests across all five levels, driven by `LEVEL_IDS`: `loadLevelFile` is ok and `startRun` is ok with Status `playing`, `hp` equal to `startingHp` and `ink` equal to the document `ink`; the file text equals `serializeLevelText` of the loaded Level, contains no `\r` and no byte order mark (the first difference is reported as an index and a kind); `.gitattributes` (read with `node:fs`) holds both required lines; each `id` equals the file name without `.json`, the two-digit prefix equals the position in `LEVELS` counted from 1, the five ids are unique; `tabLabel` equals `Sheet1: The Corridor`, `Sheet2: The Chaser`, `Sheet3: The Locked Crypt`, `Sheet4: The Trap Row`, `Sheet5: The Lich` and the five are distinct; each hint is one line of 1 to 120 characters with the substrings of Requirement 2.5; every Panel_Label (the spec to the left of each named cell in rows 14 to 20) is 1 to 24 characters; every Map_Area cell and every Panel_Label cell is locked, and the Cell_Names of the unlocked cells are exactly the Editable_Cells of each level; no raw text contains `rand` (case-insensitive); the `seed` of level N is N; monster counts are 0, 1, 0, 0, 1 with the ids and rule names `M1`, `MOVE_M1`, `ATK_M1`; levels 1 to 4 each have a Map_Area cell with the Value `X` after `startRun`, and level 5 has the gate raw text `=IF(LICH_HP<=0,"X","#")` at `K4` with the Value `#` at load
    - Acceptance: `npm run verify` passes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_

  - [ ] 3.3 [Batch 3] [Crew] Create the solutions test (all five levels)
    - Files: create `src/levels/solutions.test.ts`
    - Tests across all five levels, driven by `LEVEL_IDS`: `readSolution` shape (kinds `move`, `wait`, `edit`, no `undo`, no extra key, `dir` in `N S E W`, a non-empty `actions` array), `levelId` equals the level id, the edit count equals `minimalInk`, level 1 has `minimalInk` 0 and no `edit`, and the Solution_File text equals `JSON.stringify(parsed, null, 2) + '\n'` with no `\r`; replay of each solution: every Action accepted with no Refusal (a refusal fails with `describeStep`), after every Action but the last `hp` above 0, `ink` at 0 or above and Status `playing`, after the last Action Status `won`, `hp` above 0 and the hero standing on a cell whose Value is `X`; determinism: two replays from two `startRun` calls give `finalSnapshot` values that are `toEqual`; ink table: `ink` 0, 2, 2, 1, 2 with `minimalInk` 0, 1, 2, 1, 2 and `startingHp` 3, 3, 3, 5, 6, and `ink` is `minimalInk` or `minimalInk` plus 1; for levels with `minimalInk` of 1 or more, the replay on a copy of the document with `ink` one lower stops at the last `edit` Action with the reason `no-ink`
    - Acceptance: `npm run verify` passes
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 12.1, 13.1, 13.2_

  - [ ] 3.4 [Batch 3] [Crew] Create the edit-free search test
    - Files: create `src/levels/search.test.ts`
    - Tests: `searchEditFree` on level 1 returns the outcome `won`; on levels 2 to 5 it returns the outcome `exhausted` with `states` above 1 (a `won` result fails and prints the depth and `boardText`); a `limit` outcome fails the test as inconclusive with the text of `describeLimit`; the default limits are 100 turns and 1,000 states. Each test is written `it('...', () => { ... }, 60_000)`. No clock, no elapsed-time assertion
    - Acceptance: `npm run verify` passes
    - _Requirements: 11.1, 11.2, 11.3, 11.4, Decisions 8, 14 and 15_

  - [ ] 3.5 [Batch 3] [Crew] Create the scan test
    - Files: create `src/levels/scan.test.ts`
    - Tests: the Deny_List is assembled from string fragments inside the test, so no test file contains an entry as a whole word, and every file under `src/levels/` and `tests/solutions/` is scanned case-insensitively for each entry with none found; the forbidden strings `Math.random`, `Date.now`, `new Date`, `eval`, `new Function` and `performance.now` are also built from fragments and found in none of the `*.test.ts` files of `src/levels/` and not in `helpers.ts`; the import lists: each test file imports, besides `vitest` and `node:` modules, only `./helpers`, sibling files and the barrels `../game/index`, `../model/index` and `../engine/index`; `helpers.ts` imports exactly `node:fs`, `../game/index`, `../model/index` and `../engine/index`; `index.ts` imports exactly the five JSON files, contains no `(` call and no browser global (`window`, `document`, `localStorage`, `navigator`); no non-test `.ts` file under `src/` imports `levels/helpers` or a `./helpers` that resolves to it (the scan walks `src/` with `node:fs`); a self-check proves that the scanner flags a sample bad snippet
    - Acceptance: `npm run verify` passes
    - _Requirements: 15.1, 15.2, 15.3, Decision 16_

- [ ] 4. Final check
  - [ ] 4.1 [Batch 4] [IDE] Final checkpoint
    - Files: edit `.kiro/specs/levels/tasks.md` to tick the checkboxes; no source edits unless a defect is found
    - Run `npm run verify`; confirm it reports zero failures under Node 22 or later
    - Confirm with `git status` that only files under `src/levels/` and `tests/solutions/`, `.gitattributes` and the levels spec files are new or changed (plus `eslint.config.js` only if the fallback of 1.1 was needed), that no `author-*.scratch.test.ts` file exists, and that nothing is committed
    - Confirm that no Level_File or Solution_File contains `\r`, with a short Node check, and with `git ls-files --eol src/levels tests/solutions` after `git add -N` of those paths (or by the Node check alone if staging is not wanted); `.gitattributes` must report `eol=lf` for them
    - Search `src/levels/`, `tests/solutions/` and the levels spec files for names of AI tools other than Kiro; there must be none
    - Note, without writing it, the `KIRO_USAGE.md` entry for the levels spec
    - Ensure all tests pass, ask the user if questions arise.
    - Acceptance: `npm run verify` passes
    - _Requirements: 2.2, 2.3, 15.1, 15.2, 15.3_

- [ ] 5. Entry point and stub removal
  - [ ] 5.1 [Batch 5] [IDE] [needs grid-ui 4.2 and 5.2] Swap the stub list for the real levels
    - Files: edit `src/main.ts`, `src/ui/fixture-levels.test.ts`; delete `src/stub-levels.ts`; keep `tests/fixtures/levels.ts`
    - In `src/main.ts` replace the `STUB_LEVELS` import from `./stub-levels` by `import { LEVELS } from './levels/index'` and pass `LEVELS` to `mountApp`; nothing else changes. Remove the assertions about `src/stub-levels.ts` from `src/ui/fixture-levels.test.ts` and keep the ones about `tests/fixtures/levels.ts`
    - Tests: the remaining `fixture-levels.test.ts` assertions still pass; the scan of 3.5 still passes (no non-test file imports the helper)
    - Run `npm run build`, then search `dist/` for the five level ids (`01-the-corridor` to `05-the-lich`) and for the two fixture ids (`01-fixture-corridor`, `02-fixture-lab`); the five must be found and the two must be absent; report the result
    - Acceptance: `npm run verify` passes and `npm run build` succeeds with the checks of the design
    - _Requirements: 14.1, 14.2, Decisions 1, 2 and 19_

## Notes

- There are no optional tasks. Example-based tests are part of each task. There are no property tests in this spec.
- Batches 2 and 3 can be run in Kiro Crew: their tasks edit disjoint files. Batches 1, 4 and 5 run in the IDE because they hold shared config or depend on other specs.
- Batches 1 to 4 do not depend on grid-ui. Batch 5 waits for grid-ui tasks 4.2 and 5.2.
- The author scratch files `src/levels/author-NN.scratch.test.ts` never ship: each level task deletes its own before it ends, and task 4.1 checks that none is left.
- Merge a whole batch before starting the next. A defect found in a level by a Batch 3 test is fixed in the level file of its Batch 2 task, within the bounds of the requirements, never by loosening the test.
- Each task references granular requirement clauses for traceability.
- This workflow only creates the plan. Start execution by opening this file and choosing "Start task" next to a task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5.1"] }
  ]
}
```
