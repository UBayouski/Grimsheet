# Implementation Plan: Sixth Level

**HOLD: do not start any task of this plan until the user says the `skin-and-sound` amendment (its tasks 7.1 to 7.3: sticky formula row, cue on unlocked cells) is finished in the other session. That session edits `src/ui/render.ts`, `src/ui/render.test.ts` and `tests/e2e/skin.spec.ts`, which tasks 2.1 and 2.2 of this plan also edit. The amendment itself is NOT written here. The uncommitted `README.md` and `skin-and-sound` spec changes in the working tree belong to that session and the user: leave them, and build on top of them (tasks 2.1, 2.2 and 3.1 read the current files first and edit on top of what is there). No revert, no overwrite, and no git command of any kind: no commit, push, stash, checkout or reset. Task 4.2 keeps its own gate on the amendment and stops if the gate fails.**

## Overview

The design uses TypeScript, so no implementation-language question is needed. The plan adds `06-the-audit` to the finished levels module and the short tab label to the UI, then updates the documents, in four batches:

1. Batch 1 (IDE) is ONE UNIT made of tasks 1.1 and 1.2. Task 1.1 creates the level data with its own tests, and task 1.2 registers the level in the shared level code and tests. They cannot be separated: adding `06-the-audit.json` alone makes `npm run verify` fail, because `src/levels/index.test.ts` line 21 asserts `has exactly the five level files, index.ts and helpers.ts as non-test entries` (with `LEVEL_FILES` at lines 9 to 15 ending in `05-the-lich.json` and line 28 `expect(names).toEqual([...LEVEL_FILES, 'helpers.ts', 'index.ts'].sort())`), and `src/levels/scan.test.ts` line 173 asserts `index.ts imports exactly the five level files` (the list at lines 175 to 181 ends with `./05-the-lich.json`). Neither test is weakened: 1.2 updates the lists and counts to six. The intermediate state between 1.1 and 1.2 is not green. The generator, the new files and the registration and count edits are all done BEFORE `npm run verify` is run, and both checkboxes are ticked together after it passes.
2. Batch 2 (IDE, sequential) adds the short tab label `tabDisplayLabel` through `progress.ts`, `types.ts`, `view-model.ts` and `render.ts` (2.1), then the Playwright layout checks with the measured 24 px spare (2.2).
3. Batch 3 (Crew, parallel, disjoint files) updates `README.md` (3.1) and the brief, steering files and levels-spec note (3.2), each with a small text test.
4. Batch 4 (IDE, sequential) is the checkpoint (4.1), then the screenshots and the final gate (4.2), which is last and gated.

### End of game: level 5 is no longer the last level

Verified by reading the code (a search of `src/ui` and `tests/e2e` for `isLast`, `hasNext`, `entries.length`, `wonLast`, `win-next` and `win-ok`). The last-level logic is data-driven:

- `src/ui/controller.ts`: `accept` line 152 computes `isLast = state.levelIndex + 1 >= env.entries.length` and passes it to `endMessage('won', isLast)` (line 155); `keyContext` line 138 sets `hasNext: state.levelIndex + 1 < env.entries.length`.
- `src/ui/view-model.ts` (`win`, lines 209 and 210): body is `STRINGS.won` or `STRINGS.wonLast` and `hasNext` uses the same `levelIndex + 1 < env.entries.length` test; line 197 `nextVisible` uses it too.
- `src/ui/messages.ts` line 42: `endMessage(_kind, isLast)` returns `STRINGS.wonLast` or `STRINGS.won`.
- `src/ui/app.ts` line 171 (`syncDialogs`): on `won` it focuses `#win-ok` when `vm.win?.hasNext === false`, else `#win-next`.
- `src/ui/render.ts` lines 346 to 348: `#win-next` is hidden when `hasNext` is false, and `data-default` moves to `#win-ok`.

Result: with six level entries, level 5 shows `Changes saved.` and the Next button, and level 6 shows `Workbook saved. Your soul was not.` with `#win-next` hidden and `#win-ok` focused. No code change is needed. The tests that assert last-level behaviour use small injected lists (`controller.test.ts` around lines 302 to 307, `view-model.test.ts` around line 466 to 470, `app.test.ts` around line 593, `messages.test.ts` around line 75, `key-map.test.ts`), so they do not depend on the real five or six levels. No string names the Lich: `STRINGS.wonLast` is `Workbook saved. Your soul was not.` and `docs/BRIEF.md` 6a (line 119) says "on the last level", which stays true for level 6. So NO string change is proposed. The user asked to see any string change before it is made. None is needed, and if any task finds one it must stop and show it first. Tests for this are added in 2.1 and 2.2.

Rules that apply to every task:

- HOLD: do not start any task until the user says the `skin-and-sound` amendment (its tasks 7.1 to 7.3) is finished in the other session, which edits `src/ui/render.ts`, `src/ui/render.test.ts` and `tests/e2e/skin.spec.ts`. Leave the uncommitted `README.md` and `skin-and-sound` spec changes alone and build on them. Run no git command of any kind (no commit, push, stash, checkout or reset).
- Tasks 1.1 and 1.2 are one unit: both are finished before `npm run verify` is run and both are ticked together.
- Each task's acceptance line is exactly "Acceptance: `npm run verify` passes". E2E tasks add "and `npm run e2e` passes". The screenshot task (4.2) states its own gate and checks, plus `npm run verify` and `npm run e2e`. `npm run verify` stays green under `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `noUnusedLocals`.
- Every task lists Files and Tests. There are no optional tasks, so no `*` markers are used. There are no property tests in this spec (see the Testing Strategy of the design): the inputs are one fixed level, ten fixed candidate pairs and six fixed labels.
- No task changes `src/engine/`, `src/model/` or `src/game/`, and none changes the five existing level files, solutions, ids, maps or numbers.
- Level tests import the lower layers only through `../game/index`, `../model/index` and `../engine/index`, and the helper as `./helpers`. `level-06.test.ts` does not import `./index` and does not use `LEVEL_IDS`. No file under `src/levels/` uses `Math.random`, `Date.now`, `new Date`, `performance.now`, `eval` or `new Function`. No test asserts elapsed time.
- Level files are produced, not typed (design D7 and the levels spec). Task 1.1 uses a throwaway generator `src/levels/author-06.scratch.test.ts` and deletes it before the task ends. Scratch files never ship.
- The level numbers come from the design's hand work. If a hand number fails against the real engine, fix the level within the bounds of the requirements (never the test) and report the change.
- No file under `src/`, `tests/`, the docs or this spec folder names an AI tool other than Kiro, and none contains the Product_Name strings forbidden by the steering files.
- Run mode: `[Crew]` tasks edit disjoint files and can run in parallel in Kiro Crew. `[IDE]` tasks share files or run in sequence and run in the IDE.
- Single owners of shared files: `src/levels/06-the-audit.json`, `tests/solutions/06-the-audit.json` and `src/levels/level-06.test.ts` (1.1); `src/levels/index.ts`, `helpers.ts`, `helpers.test.ts`, `index.test.ts`, `files.test.ts`, `solutions.test.ts`, `search.test.ts`, `scan.test.ts` and `src/play/headless.test.ts` (1.2); `src/ui/progress.ts`, `types.ts`, `view-model.ts`, `render.ts` and their tests (2.1); the e2e specs (2.2); `README.md` and `src/ui/docs.test.ts` (3.1); `docs/BRIEF.md`, the two steering files, the dated note in the levels spec and `src/levels/docs.test.ts` (3.2); `docs/screenshots/*` and `KIRO_USAGE.md` (4.2); this `tasks.md` checkboxes (4.1).

### Text search results (re-run when this plan was written)

Searched `.ts`, `.mjs`, `.md`, `.json`, `.yaml`, `.yml`, `.html` and `.css` files outside `node_modules`, `dist`, `dist-play`, `.git`, `.playwright-mcp`, `package-lock.json`, `KIRO_USAGE.md` and the `sixth-level` spec, with the patterns `five`, `Five`, `5 levels`, `LEVEL_IDS`, `toHaveLength(5)`, `length).toBe(5)`, `Sheet5`, `[0-4]`, `levels/0`, `05-the-lich`, and a `Sheet` search in `tests/e2e`. The line numbers below are the real ones at that time. The implementing task repeats the search before editing and uses what it finds.

| File | Real hits (line numbers) |
|---|---|
| `src/levels/helpers.ts` | 19 (doc comment `The five level ids`), 20 to 26 (`LEVEL_IDS`, last entry at 25) |
| `src/levels/helpers.test.ts` | 79 to 85: line 80 title `holds five unique ids`, 81 `toHaveLength(5)`, 82 `Set size toBe(5)`, 84 the id regex `/^0[1-5]-.../` (found by reading, not by a pattern); 223 uses `05-the-lich` as an example id (no change) |
| `src/levels/index.test.ts` | 13 (file list ends with `05-the-lich.json`), 21 and 31 and 43 (titles with `five`), 34 and 46 (`toHaveLength(5)`) |
| `src/levels/files.test.ts` | 6, 14 (tab label list ends `Sheet5: The Lich`), 55 and 56 (titles), 57 and 59 (`toHaveLength(5)`), 58 (`Set size toBe(5)`), 69, 181 (title `five distinct tab labels`), 182 |
| `src/levels/solutions.test.ts` | 4, 18 (`LEVEL_IDS`); the three tables at lines 13 to 15 (`EXPECTED_INK`, `EXPECTED_MINIMAL_INK`, `EXPECTED_HP`) have no pattern hit and need a sixth entry |
| `src/levels/search.test.ts` | 30 (level list ends with `05-the-lich`; title comment says levels 2 to 5) |
| `src/levels/scan.test.ts` | 173 (title `exactly the five level files`), 179 (`./05-the-lich.json` in the import list) |
| `src/levels/index.ts` | 5 (`import level05`), 7 (`LEVELS`) |
| `src/play/headless.test.ts` | 23 to 27 (table `EXPECTED`, last row `05-the-lich` at 27: final `hp` and final `ink`), 125 (title `lists the five level ids`), 126 to 133 (id list, `05-the-lich` at 131); 75 and 109 use level 5 as an example (no change) |
| `tests/e2e/grid-layout.spec.ts` | 88 (title `five tab buttons`), 94 to 98 (seeded progress ends at `05-the-lich`), 113 (`toHaveLength(5)`), 116 to 119 (resting tab count 4) |
| `tests/e2e/layout-shift.spec.ts` | 7 to 13 (`LEVEL_IDS`), 23, 28 (`Sheet${n}:` in the status bar, stays), 66 (title `all five levels`), 70 |
| `tests/e2e/skin.spec.ts` | 3 to 9 (`LEVEL_IDS`), 17, 18, 97 |
| `tests/e2e/error-monsters.spec.ts` | 24 (`five error kinds`, noise: no change) |
| `README.md` | 17 (`five hand-built puzzle levels`), 61 (heading `The five levels`), 63 (tab names), 156 (`The five hand-written level JSON files`), 163 (`all five levels have been played through`), 171 (`Eight spec folders`, to check), 49, 173 (`five error kinds`, `Five files` of steering: no change) |
| `docs/BRIEF.md` | 116 (section 6a tab names), 125 (`Five hand-written levels`), 182 (`the five levels`), 171 (dated schedule: no change) |
| `.kiro/steering/product.md`, `structure.md` | `product.md` 49 (`Five hand-written JSON levels` and the title list), `structure.md` 15 (`the five level JSON files`) |
| Noise, no change | `src/engine/values.test.ts` 42, `src/styles/error-monsters.css` 1, `src/ui/error-css.test.ts` 15, `src/ui/render.test.ts` 187 (five error kinds); `src/levels/level-05.test.ts` 8 and 110 (level 5 facts) |

Differences from the design's Current hits table: `files.test.ts` also hits at line 6 and 14 (the import line and the label list); the `solutions.test.ts` hits are `LEVEL_IDS` lines 4 and 18, not the word `five`, and its three tables at 13 to 15 are the real edit; `helpers.test.ts` also has the regex at line 84 and `index.test.ts` has its file list at line 13; `headless.test.ts` has the `EXPECTED` table at lines 23 to 27 (level 5 at 27, not 26) and the title at 125; `scan.test.ts` hits at 173 and 179; `grid-layout.spec.ts` also hits at 94 to 98 and 116 to 119; `layout-shift.spec.ts` and `skin.spec.ts` have their lists at lines 7 to 13 and 3 to 9. `src/ui/render.test.ts`, `view-model.test.ts` and `progress.test.ts` have no pattern hit; their tab fixtures are found by searching `label:`.

## Batch Overview

| Batch | Mode | Tasks | Depends on |
|---|---|---|---|
| 0 (hold) | None | No task starts until the user says the `skin-and-sound` amendment (7.1 to 7.3) is finished | The user's go-ahead |
| 1 | IDE, ONE unit (1.1 and 1.2 together, not green in between) | 1.1 level data and its tests; 1.2 register the level in shared code and tests | Batch 0 |
| 2 | IDE, sequential | 2.1 short tab label and end-of-game unit tests; 2.2 Playwright layout checks and end-of-game e2e | Batch 1 (2.2 needs six levels in the app) |
| 3 | Crew, parallel (disjoint files) | 3.1 `README.md` and its test; 3.2 brief, steering, levels-spec note and its test | Batch 2 (the tab names are final) |
| 4 | IDE, sequential, last | 4.1 checkpoint; 4.2 screenshots and final gate; 4.2b held live playthrough and README sentence | Batch 3; 4.2 also needs the separate `skin-and-sound` amendment ticked (checked first, stops if missing); 4.2b waits for the user to say the deploy is live |

## Tasks

- [x] 1. Level data and registration
  - [x] 1.1 [Batch 1] [IDE] [unit with 1.2] Create the level, its solution and `level-06.test.ts`
    - One unit with 1.2: do all of 1.1 and 1.2 (generator, new files, registration and count edits) before running `npm run verify`. The state after 1.1 alone is not green (`index.test.ts` line 21 and `scan.test.ts` line 173 still say five). Tick 1.1 and 1.2 together after verify passes. `level-06.test.ts` must still not import `./index` or use `LEVEL_IDS`
    - Files: create `src/levels/06-the-audit.json`, `tests/solutions/06-the-audit.json`, `src/levels/level-06.test.ts`; create and delete `src/levels/author-06.scratch.test.ts`
    - Generator: the scratch test builds the Level_Document of the design (144 locked map cells, labels at `A14` to `A18` locked, named cells `B14` to `B18`; `B17` and `B18` are NOT locked, everything else is locked), loads it with `loadLevel` and `createRandom(6)`, fails on any Load_Error, and writes `serializeLevelText(level)` to `src/levels/06-the-audit.json` and `JSON.stringify(solution, null, 2) + '\n'` to `tests/solutions/06-the-audit.json`. The solution holds the 13 actions of the design (`edit B17 -1`, `move N` x4, `move E` x8) with `minimalInk` 1. Title `The Audit`, hint `ATK_M1 bills every turn. Check the SUM range before changing a charge.`, hero `B8`, monster `M1` at `J7` (`MOVE_M1`, `ATK_M1`), `startingHp` 6, `ink` 1, `seed` 6, exit `X` at `J4`. The scratch file is deleted at the end
    - Tests in `level-06.test.ts`, following the pattern of `level-05.test.ts` and importing only `vitest`, the three barrels and `./helpers` (no `./index`, no `LEVEL_IDS`): the level loads and `startRun` is ok with `hp` 6 and `ink` 1; the file text equals `serializeLevelText` of its loaded Level, with no `\r` and no byte order mark; the exact raw text, lock flag and Cell_Name of `B14` to `B18`, and the Editable_Cell set (through `lockReport`) is exactly `LIVE_CHARGE` and `UNFILED_CHARGE`; one monster `M1` at `J7` with `MOVE_M1` and `ATK_M1`; hero `B8`; the Value at `J4` is `X`; the title, the Tab_Label `Sheet6: The Audit`, the hint substrings `ATK_M1` and `SUM`; the hint is 1 to 120 characters and every panel label is 1 to 24 characters; no raw text contains `RAND` (case-insensitive); the `seed` is 6; `walkableCount` is 41 and at most 60
    - Attack facts: `ATK_M1` is 3 at load; editing `B17` to `-1` gives 0; editing `B18` alone leaves it 3; editing `B17` or `B18` changes no `MOVE_M1` value
    - Stored solution: every action accepted, `hp` above 0 and `ink` at or above 0 after each action, Status `won` at the end, hero on `X`, `ink` 0 and `hp` 6; two replays give equal `finalSnapshot` values
    - Route trace (Requirement 1.6): after each action the test records the address of `M1`; `M1` never stands on the hero's next stored-route cell and never blocks a stored move; `M1` stays on `J7` through the edit and the first eleven moves
    - Minus-one-ink: on a copy of the document with `ink` 0 the first action is refused with `no-ink`, `turn` stays 0, and `hp` and the hero are unchanged
    - No-edit proof: `searchEditFree` returns `exhausted` with `states` above 1 (a `limit` outcome fails the test with `describeLimit`); the arithmetic check: two accepted waits at the start kill the hero (3 + 3 against `hp` 6), and `manhattan('B8','J4')` is 12
    - Candidate tests (Requirement 4): ten `it()` blocks, one per cell/value pair (`B17` and `B18` with `-1`, `0`, `1`, `=1/0`, `=MISSING`), each with an explicit `60_000` as the third argument. Each first applies the edit from a fresh `startRun`, asserts it was accepted, and asserts the post-edit `ATK_M1` value or error kind: `B17` gives 0, 1, 2, `#DIV/0!`, `#REF!` in that order, and every `B18` value leaves 3. Winners (`B17` = `-1`, `=1/0`, `=MISSING`) replay the stored route with the first action's `raw` replaced and assert every action accepted and Status `won`. Non-winners (`B17` = `0` and `1`, and all five `B18` values) use the local function `searchAfterEdit(start, limits)` (about 30 lines; breadth-first over `move N/S/E/W` and `wait`, uses `applyAction` from the game barrel and `stateKey` from `./helpers`, caps 100 turns and 1,000 states, skips refusals, does not expand lost states, fails on a win, and fails a `limit` outcome as inconclusive with a message) and assert `exhausted` with no win
    - Report the measured wall time of `level-06.test.ts` (no assertion on it) and the time of `npm run test:fast` before and after this task
    - The scratch file is deleted at the end; `git status` shows only the three files of this task. If a hand number of the design fails against the real engine, fix the level within the requirement bounds, not the test, and report it
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, Decisions D1, D3, D7_

  - [x] 1.2 [Batch 1] [IDE] [unit with 1.1] Register the level in the shared code and tests
    - One unit with 1.1: run together with 1.1 and ticked together with it. No test is weakened: `index.test.ts` (line 21 title and file list, lines 31 and 43) and `scan.test.ts` (line 173 title and list) are updated to six entries
    - Files: edit `src/levels/index.ts`, `src/levels/helpers.ts`, `src/levels/helpers.test.ts`, `src/levels/index.test.ts`, `src/levels/files.test.ts`, `src/levels/solutions.test.ts`, `src/levels/search.test.ts`, `src/levels/scan.test.ts`, `src/play/headless.test.ts`; any other `src/` file the fresh text search finds, except `level-05.test.ts`, the `five error kinds` noise and `src/play/headless.ts` and `scripts/play.mjs` (they read `LEVELS` and need no change)
    - `index.ts`: add `import level06 from './06-the-audit.json'` and the sixth `LEVELS` entry, in order. `helpers.ts`: add `'06-the-audit'` to `LEVEL_IDS` and make the doc comment say six
    - Tests updated in place: `helpers.test.ts` (title, `toHaveLength(6)`, `Set size toBe(6)`, id regex accepts `0[1-6]`); `index.test.ts` (file list gains `06-the-audit.json`, both `toHaveLength` and the import count become 6, the titles say six); `files.test.ts` (tab label list gains `'Sheet6: The Audit'`, counts 6, the titles say six or distinct tab labels, and any per-level array such as seeds or monster counts gains its sixth entry: seed 6, one monster `M1`; the Level 5 gate check stays; level 6 has the exit `X` at `J4` after `startRun`); `solutions.test.ts` (`EXPECTED_INK` gains 1, `EXPECTED_MINIMAL_INK` gains 1, `EXPECTED_HP` gains 6; the first five entries stay); `search.test.ts` (the level list gains `06-the-audit` and the comment says levels 2 to 6); `scan.test.ts` (the `index.ts` import list gains `./06-the-audit.json`, the title says six; check that the Deny_List scan picks up `level-06.test.ts` and the new JSON files); `headless.test.ts` (the `EXPECTED` table gains `{ id: '06-the-audit', hp: 6, ink: 0 }`, the id-list title and the id list gain the sixth id)
    - New assertion in `index.test.ts`: the first five `LEVELS` entries keep their ids and titles, in order (`01-the-corridor` to `05-the-lich`, `The Corridor` to `The Lich`)
    - Report the time of `npm run test:fast` after this task
    - Acceptance: `npm run verify` passes, run once after both 1.1 and 1.2 are complete
    - _Requirements: 1.1, 1.2, 2.4, 3.1, 6.1, Decisions D1, D7_

- [x] 2. Short tab label
  - [x] 2.1 [Batch 2] [IDE] Add `tabDisplayLabel` and show it on the tab buttons
    - Files: edit `src/ui/progress.ts`, `src/ui/types.ts`, `src/ui/view-model.ts`, `src/ui/render.ts`, `src/ui/progress.test.ts`, `src/ui/view-model.test.ts`, `src/ui/render.test.ts`, `src/ui/app.test.ts` (or `controller.test.ts`, whichever holds the confirmation test), `src/ui/controller.test.ts`; `src/ui/module.test.ts` needs no edit. Read the current `render.ts` and `render.test.ts` first and edit on top of them (the other session's amendment may have changed them; no revert, no overwrite, no git command)
    - `progress.ts`: add the pure named export `tabDisplayLabel(label: string): string` (removes a leading `Sheet`; a label without it is returned unchanged; never throws). `types.ts`: `TabView` gains `readonly displayLabel: string`. `view-model.ts`: `tabsOf` sets `displayLabel: tabDisplayLabel(entry.label)` and keeps `label` full. `render.ts`: `updateTabs` writes `tab.displayLabel` into the button instead of `tab.label` (line 318 today). The status bar label (`vm.status.label`) and the confirmation prompts (`STRINGS.confirmSwitch`) stay full. No `aria-label` and no tooltip are added
    - Tests: `progress.test.ts` exhaustive table for all six labels (`Sheet1: The Corridor` gives `1: The Corridor`, `Sheet2: The Chaser` gives `2: The Chaser`, `Sheet3: The Locked Crypt` gives `3: The Locked Crypt`, `Sheet4: The Trap Row` gives `4: The Trap Row`, `Sheet5: The Lich` gives `5: The Lich`, `Sheet6: The Audit` gives `6: The Audit`), `Sheet10: X` gives `10: X`, a label without the prefix is unchanged, the empty string is unchanged, and two calls give equal strings. `view-model.test.ts`: every `TabView` has `displayLabel`, `label` is still the full label, and the status label is still the full `SheetN: Title`; the by-hand `TabView` literals gain the new field. `render.test.ts`: the button text equals `displayLabel` for every tab including disabled ones, no `aria-label` is added, and markup in a label shows as text (no element created); the by-hand `TabView` literals (fixtures near lines 49, 50 and 396) gain the field. App or controller test: the confirmation prompt text for a tab switch contains the full `Sheet2: The Chaser`. `strings.test.ts` stays unchanged. `module.test.ts` passes (`progress.ts` stays pure)
    - End-of-game tests (no code change, no string change; if a string change turns out to be needed, STOP and show it to the user first). All use small injected docs, not the real levels:
      - `controller.test.ts`: an `Env` of six entries built from small injected docs. A win on index 4 gives message `Changes saved.` (`STRINGS.won`) and the `next-level` command starts index 5. A win on index 5 gives `STRINGS.wonLast`, `hasNext` false (`keyContext`), and `next-level` is ignored (the state is unchanged)
      - `view-model.test.ts`: with six entries, `win` on index 4 is `{ body: STRINGS.won, hasNext: true }` and on index 5 is `{ body: STRINGS.wonLast, hasNext: false }`
      - `app.test.ts` (happy-dom, injected six-entry list): the win dialog focuses `#win-next` on the fifth level, and focuses `#win-ok` with `#win-next` hidden on the sixth
      - `progress.test.ts`: six injected level ids where the first five are cleared. With `current` set to the fifth id: `isTabEnabled` is true for index 5 (level 6 is unlocked), `firstUnclearedIndex` is 5, `startIndexFor` gives 4 (the saved current, which is enabled), and the `TabView` built by `viewOf` has `enabled` true for index 5. With `current` null: `startIndexFor` gives 5
    - Acceptance: `npm run verify` passes
    - _Requirements: 5.2, 5.3, Decisions D4, D5_

  - [x] 2.2 [Batch 2] [IDE] Playwright layout checks with the measured 24 px spare
    - Files: edit `tests/e2e/grid-layout.spec.ts`, `tests/e2e/layout-shift.spec.ts`, `tests/e2e/skin.spec.ts` (read the current file first and edit on top of the other session's amendment; no revert, no overwrite, no git command); create `tests/e2e/end-of-game.spec.ts` (owned by this task, so it does not collide with `skin.spec.ts`); edit `tests/e2e/error-monsters.spec.ts` only if the fresh search shows a real tab or level-count dependency (line 24 is noise today)
    - `grid-layout.spec.ts`: the tab test (title at line 88, seeded progress at 94 to 98, `toHaveLength(5)` at 113, resting count 4) becomes the six-tab test with the progress ending at `06-the-audit`: six buttons, one row, no wrap, the six resting-or-current tops as before (five share one top, the current one is 2 px above), the button texts equal `1: The Corridor`, `2: The Chaser`, `3: The Locked Crypt`, `4: The Trap Row`, `5: The Lich` and `6: The Audit`, the last button's right edge is at least 24 px inside the content box of `#tab-bar`, no horizontal page scroll (`scrollWidth <= clientWidth`), and the window width is 832 px. It runs at 1280x1024 and at 1366x768 and reports the measured spare for both
    - `layout-shift.spec.ts`: `LEVEL_IDS` gains `06-the-audit`, the title says six levels (the loop already uses `LEVEL_IDS.length`), the status bar check `Sheet${n}:` stays, and a tab switch check is added: after switching to another tab the window box and the page width are unchanged. `skin.spec.ts`: `LEVEL_IDS` gains the sixth id, the layout loop covers it, the tab texts are the display labels, and the status bar still shows the full `SheetN: Title`
    - `end-of-game.spec.ts` (real app at `/`, dismiss the title dialog first as the other specs do; the editing steps follow `tests/e2e/edit-and-fix.spec.ts`):
      - Unlock case: seed `grimsheet.progress = { version: 1, cleared: [the first five real ids], current: '05-the-lich' }`. Tab 6 (`6: The Audit`) is enabled and not disabled. Clicking it asks for confirmation, and the pending prompt names `Sheet6: The Audit` in full. Enter confirms. Then the status bar shows `Sheet6: The Audit` and the level starts
      - Final-win case: on level 6, play the stored solution (read `tests/solutions/06-the-audit.json` for the actions) through the keyboard and mouse: click `B17`, Enter, type `-1`, Enter, then ArrowUp x4 and ArrowRight x8. Assert `data-screen` is `won`, the win dialog body is `Workbook saved. Your soul was not.`, `#win-next` is hidden, and `#win-ok` is focused and is the default button. Assert that `grimsheet.progress` now holds all six ids in `cleared`
    - **Stop condition:** if the measured spare is under 24 px at either viewport, STOP and report to the user. The design's fallback is Option B (`Sheet1` to `Sheet6`), which is a new decision. Do not switch silently and do not tick the task
    - Tests: the specs are the tests. If Chromium is missing run `npx playwright install chromium` and report; if the environment cannot run Playwright say so and do not tick the task
    - Acceptance: `npm run verify` passes and `npm run e2e` passes
    - _Requirements: 5.1, 5.2, 5.3, 6.1, Decisions D4_

- [x] 3. Documents
  - Execution note: tasks 3.1 and 3.2 were done in a separate session outside Kiro; Kiro reviewed them in task 4.1.
  - [x] 3.1 [Batch 3] [Crew] Update `README.md` and add its text test
    - Files: edit `README.md` (it has uncommitted changes from the other session and the user: read the current file first and edit on top of it; no revert, no overwrite, no git command); create `src/ui/docs.test.ts` (checked: no existing docs test in the repo)
    - Edit: the intro line 17 (`five hand-built puzzle levels` becomes six); the heading at line 61 and the sentence at line 63 (Option A: tabs read `1: The Corridor` through `6: The Audit`, and the status bar keeps the full `SheetN: Title`); a sixth table row `| 6 | The Audit | ... |` (what it teaches: read a monster's attack formula, `ATK_M1` is `=SUM(B16:B17)`, and a charge inside the range is the one to edit; ink 1); line 156 (project layout row says six level JSON files); line 163 (the live playthrough claim: do not claim a live playthrough of level 6 that was not done; reword to what is true, for example that levels 1 to 5 were played through live and level 6 is covered by the stored solution replay and the candidate checks); line 171 (`Eight spec folders`: check the count against `.kiro/specs/` and update it if `sixth-level` is counted, adding it to any list). No change to `five error kinds`, `five beeps` or `Five files` of steering. The Screenshots section line stays unchanged (images come in 4.2)
    - Tests: `src/ui/docs.test.ts` (Node, reads `README.md` with `node:fs`, kept tiny): the README contains `6: The Audit`, contains `The Audit`, and does not contain `five hand-built`
    - Acceptance: `npm run verify` passes
    - _Requirements: 6.1, 5.2, Decision D4_

  - [x] 3.2 [Batch 3] [Crew] Update the brief, the steering files and the levels-spec note
    - Files: edit `docs/BRIEF.md`, `.kiro/steering/product.md`, `.kiro/steering/structure.md`, `.kiro/specs/levels/requirements.md` (one dated note at the end, no other edit to the levels spec); create `src/levels/docs.test.ts`
    - `docs/BRIEF.md`: section 6a tab names (line 116) say `Sheet1: The Corridor` through `Sheet6: The Audit`, shown on the tabs as `1: The Corridor` to `6: The Audit`; the level count and list at line 125 (`Five hand-written levels`) and line 182 (`the five levels`); add a short `6. **The Audit**` entry in section 7 (the monster's attack is `=SUM(B16:B17)`; edit the charge inside the range; a decoy outside it) and a dated note that the sixth level was added after the original plan, pointing to `.kiro/specs/sixth-level/`. The dated schedule at line 171 and anything historical stay
    - `.kiro/steering/product.md`: the level count and title list in the `Levels` paragraph (line 49) say six and add `The Audit`. `structure.md` line 15: `the five level JSON files` becomes six. The levels spec gets one dated note at the end of `requirements.md` that points to `.kiro/specs/sixth-level/` with a relative link
    - Tests: `src/levels/docs.test.ts` (Node, `node:fs`, kept separate from 3.1's file): `docs/BRIEF.md` mentions `The Audit` and `Sheet6: The Audit`; `product.md` mentions `The Audit` and not `Five hand-written`; `structure.md` does not contain `the five level JSON files`; the levels `requirements.md` contains a link to `sixth-level`. The Deny_List scan of `scan.test.ts` must still pass with the new test file
    - Acceptance: `npm run verify` passes
    - _Requirements: 6.1, Decisions D1, D4_

- [ ] 4. Checkpoint and screenshots
  - [x] 4.1 [Batch 4] [IDE] Checkpoint
    - Files: edit `.kiro/specs/sixth-level/tasks.md` to tick the checkboxes; no source edits unless a defect is found
    - Run `npm run verify`, `npm run e2e`, `npm run build` and `npm run check:dist`; all must pass. Re-run the text searches of this plan and show that no stale `five levels` or `Sheet5`-as-last-tab hit remains outside the allowed list: the historical specs, `KIRO_USAGE.md`, the `five error kinds`, `five beeps` and `Five files` of steering counts, `level-05.test.ts`, and the dated schedule in the brief. Confirm with `git status` that only expected files are new or changed (the level files, the solution, the tests, `src/ui` files of 2.1, `tests/e2e`, `README.md`, `docs/BRIEF.md`, the two steering files, the levels-spec note, this spec folder), that no `author-*.scratch.test.ts` file exists, that nothing under `src/engine`, `src/model` or `src/game` changed, and that nothing is committed. Scan the new and changed files for names of AI tools other than Kiro and for Product_Name strings (none allowed). Confirm `.kiro/specs/hosting/.config.kiro` still exists. Report the `npm run test:fast` time against the time before task 1.1. Note, without writing it, the `KIRO_USAGE.md` entry
    - Ensure all tests pass, ask the user if questions arise
    - Tests: no new test file; this task runs the suites and the searches
    - Acceptance: `npm run verify` passes and `npm run e2e` passes
    - _Requirements: 6.1, 6.3, 1.2, 2.2, 5.1_

  - [x] 4.2 [Batch 4] [IDE] Retake the screenshots and run the final gate (last task)
    - Files: replace `docs/screenshots/01-title.png`, `02-level-play.png`, `03-monster-formula.png`, `04-error-monster.png`, `05-death-dialog.png`, `06-win-dialog.png`, `07-small-viewport.png`; edit `docs/screenshots/README.md` only if a caption changes; append to `KIRO_USAGE.md`
    - **Gate first (D6, Requirement 6.2):** check that `.kiro/specs/skin-and-sound/` holds a dated amendment (a dated file or dated section) that mentions the sticky formula row and the cue on unlocked cells, and that its new tasks (today 7.1 to 7.3 of `skin-and-sound/tasks.md`) are all ticked. If not, STOP, do nothing else, and tell the user. Do not write the amendment, do not retake any image
    - If the gate passes, follow task 6.2 of `.kiro/specs/skin-and-sound/tasks.md` and the `Screenshots stay current` rule in `.kiro/steering/sheet-ui.md`: start the dev server in the background with `node node_modules/vite/bin/vite.js`, use a clean profile (`localStorage.clear()` before the first shot), seed progress through `grimsheet.progress`, use the deterministic action lists of that task at 1280x1024 (`07-small-viewport.png` at 1366x768), wait until no finite animation runs (`document.getAnimations()`), and check that six tabs are on one row. Retake all seven PNGs, add no eighth image, look at every image (shapes read as intended, text legible, six tabs on one row, no clipping), and update the captions in `docs/screenshots/README.md` if needed. Afterwards clear `localStorage`, close the browser, stop the dev server and remove temporary files
    - Then run `npm run verify` and `npm run e2e`. Then append a dated entry to `KIRO_USAGE.md` in its existing format: what was asked, what Kiro did, and what changed because of it; it states that `.kiro/specs/hosting/.config.kiro` was kept. No commit and no push
    - Tests: no new test file; the gate and the checks above are the test
    - The `KIRO_USAGE.md` entry says in its final summary that the live playthrough of level 6 and the README sentence update are `pending deployment` (sub-step 4.2b)
    - Acceptance: the gate passes; the seven PNG files exist with the exact names above, `01` to `06` are 1280 by 1024 pixels and `07` is 1366 by 768 pixels (checked from the PNG header); `docs/screenshots/README.md` lists all seven; `npm run verify` and `npm run e2e` pass. 4.2 is ticked after the screenshots, the gate, verify, e2e and the `KIRO_USAGE.md` entry, without waiting for 4.2b
    - _Requirements: 6.2, 6.3, 5.1, 5.3, Decision D6_

  - [ ] 4.2b [Batch 4] [IDE] HELD: live playthrough of level 6 and README sentence update
    - **HELD: this sub-step WAITS FOR THE USER to say the deploy is live. It stays unticked until the user confirms the deployment.** The user does the push; do not push, commit or run any git command
    - Files: edit `README.md`, `src/ui/docs.test.ts`
    - After the user confirms the deploy: play level 6 through on the live site (`https://grimsheet.onrender.com`) with the Playwright MCP and a clean profile, and check it ends on HP 6 and ink 0. Then find the README sentence about the live playthrough by search (`A live playthrough in a real browser`, around line 163; do not rely on the line number) and update it to cover all six levels
    - Test: task 3.1's README test (`src/ui/docs.test.ts`) needs one more assertion after this update: the sentence no longer says that levels 1 to 5 only were played through. Add it here, in 4.2b
    - Acceptance: `npm run verify` passes. If the live playthrough fails or the site does not show six levels, STOP and report; do not edit the README
    - _Requirements: 6.1, 6.3_

## Notes

- There are no optional tasks. Example-based tests, the ten candidate tests and the Playwright checks are part of their tasks. There are no property tests in this spec.
- Batch 3 runs in Kiro Crew: 3.1 and 3.2 edit disjoint files (`src/ui/docs.test.ts` is owned by 3.1 and `src/levels/docs.test.ts` by 3.2). Batches 1, 2 and 4 run in the IDE because their tasks share files or run in sequence.
- Single owners of shared files: the level data and `level-06.test.ts` task 1.1; the shared level code and tests task 1.2; `progress.ts`, `types.ts`, `view-model.ts`, `render.ts` and their tests task 2.1; the e2e specs task 2.2; `README.md` and `src/ui/docs.test.ts` task 3.1; `docs/BRIEF.md`, the steering files, the levels-spec note and `src/levels/docs.test.ts` task 3.2; the screenshots and the `KIRO_USAGE.md` entry task 4.2.
- HOLD: no task starts until the user says the `skin-and-sound` amendment (tasks 7.1 to 7.3) is finished in the other session, which edits `src/ui/render.ts`, `src/ui/render.test.ts` and `tests/e2e/skin.spec.ts` (also edited by 2.1 and 2.2). The uncommitted `README.md` and `skin-and-sound` spec changes belong to that session and the user; tasks build on top of them. No git command of any kind.
- Tasks 1.1 and 1.2 are one unit. Their intermediate state is not green, `npm run verify` runs once after both are done, and both are ticked together.
- Level 6 is the last level and level 5 is not: this works without a code change or a string change (see the end-of-game findings above). Any needed string change must be shown to the user first.
- 4.2b (live playthrough and README sentence) is held and stays unticked until the user confirms the deploy is live; the `KIRO_USAGE.md` entry records it as `pending deployment`.
- The generator scratch file `src/levels/author-06.scratch.test.ts` never ships: task 1.1 deletes it and task 4.1 checks that none is left.
- The `skin-and-sound` amendment is not part of this spec. Only task 4.2 waits for it, and it stops and reports if it is missing.
- If the measured tab spare in 2.2 is under 24 px, the design's fallback (Option B) is a new decision for the user, not an automatic switch.
- No task commits or pushes.
- Each task references granular requirement clauses and the decisions D1 to D7 for traceability.
- This workflow only creates the plan. Start execution by opening this file and choosing "Start task" next to a task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1", "3.2"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["4.2b"] }
  ]
}
```
