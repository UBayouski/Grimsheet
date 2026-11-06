# Implementation Plan: Grid UI

**Note: tasks 1.1, 1.2, 2.1, 2.2, 2.4 and 4.1 can start before game-rules Batch 5, because they import nothing from `src/game/`. Everything else (2.3, 3.1 to 3.3, 4.2 and Batches 5 and 6) waits for the `src/game/index.ts` barrel with the read API. Tasks are tagged `[can start before game-rules Batch 5]` or `[needs game-rules Batch 5]`.**

## Overview

The design uses TypeScript, so no language question is needed. The plan builds `src/ui/` bottom-up: test tooling and the shared types and strings first, then the four pure helper modules (three of them, 2.1, 2.2 and 2.4, in parallel and before the game barrel exists; 2.3 after it), then the view model and the controller (one pure state machine, built in three sequential steps), then the DOM renderer with its CSS (task 4.1, which needs only the `ViewModel` type and `STRINGS` from Batch 1 and so can start before the game barrel, alongside Batch 2) and the fixture levels (task 4.2, which calls `startRun` and `applyAction` and waits for the game barrel), then `app.ts` with the barrel, the entry points and the module scan, and last the two Playwright flows and the final check.

Rules that apply to every task:

- Game imports: `types.ts` (task 1.2) defines `Direction` and `Status` locally as the same literal unions the game uses, so it imports nothing from `src/game/`. Imports from `../game/index` (types or runtime) appear only in `messages.ts`, `view-model.ts`, `controller.ts`, `app.ts`, the `AppState` type added to `types.ts` in 3.2, and tests of those files. `render.ts` works on the `ViewModel` only and needs no game import. `key-map.ts`, `confirmation.ts`, `progress.ts` and `strings.ts` import nothing from the game.
- Each task ends with the same acceptance check: `npm run verify` (`npm test`, then typecheck and lint). It stays green under `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `noUnusedLocals`. The two Playwright tasks (6.1, 6.2) also need `npm run e2e` to pass.
- UI code imports the lower layers only through `../game/index`, `../model/index` and `../engine/index`. No file under `src/ui/` imports `src/levels/`, a deeper path of a lower layer, or a higher layer. No task changes `src/game/`, `src/model/` or `src/engine/`.
- A module added before its consumer is imported by its own `*.test.ts`, so nothing is unused. Tests sit next to the source and import sibling modules directly, never `src/ui/index.ts`, except where a task says so (5.1 and 5.3).
- Example-based unit tests are part of each implementation task. There are no optional tasks, so no `*` markers are used. There are no property tests in this spec (see the Property-based testing note in `requirements.md`).
- Pure UI tests run in the default Node environment. Only `render.test.ts`, `app.test.ts` and `happy-dom-smoke.test.ts` start with the docblock `// @vitest-environment happy-dom`.
- No `eval`, `new Function`, `Math.random`, `Date.now`, `new Date`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, external fonts or network requests anywhere in `src/ui/`. Level text reaches the DOM only through `textContent` and attribute setters.
- Run mode: `[Crew]` tasks edit disjoint files and can run in parallel in Kiro Crew. `[IDE]` tasks share files or must run in sequence and run in the IDE.
- Single owners of shared files: `package.json` and `package-lock.json` (1.1), `eslint.config.js` (1.1), `types.ts` (1.2, extended only by 3.2 with `AppState`) and `strings.ts` (1.2), `controller.ts` and `controller.test.ts` (3.2 then 3.3, in order), `render.ts` (including its export `ERROR_CLASS`) and `src/styles/grid-ui.css` (4.1), `app.ts` and `index.ts` (5.1), `src/main.ts` and `tests/fixtures/index.html` and `tests/fixtures/main.ts` (5.2), `module.test.ts` (5.3), `tests/fixtures/levels.ts` and `src/stub-levels.ts` (4.2).

## Batch Overview

| Batch | Mode | Tasks | Depends on |
|---|---|---|---|
| 1 | IDE, sequential (1.2 uses the tooling of 1.1) | 1.1 test tooling, 1.2 types and strings | None for 1.1 and 1.2 (can start before game-rules Batch 5) |
| 2 | Crew, parallel (disjoint files) | 2.1 key map, 2.2 confirmation, 2.4 progress (early); 2.3 messages (later) | Batch 1 for 2.1, 2.2 and 2.4 (can start before game-rules Batch 5); Batch 1 and game-rules Batch 5 for 2.3 (it imports `REFUSAL_REASONS`, `DamageLog` and `Refusal` from the game barrel) |
| 3 | IDE, strictly sequential (3.2 and 3.3 both edit `controller.ts` and `controller.test.ts`) | 3.1 view model; 3.2 controller part A; 3.3 controller part B | Batches 1, 2 and game-rules Batch 5 |
| 4 | Crew, parallel (disjoint files) | 4.1 renderer and CSS (early); 4.2 fixture and stub levels (later) | Batch 1 for 4.1 (can start before game-rules Batch 5, alongside Batch 2); game-rules Batch 5 for 4.2 (its validity test calls `startRun` and `applyAction`) |
| 5 | IDE, sequential | 5.1 app and barrel; 5.2 entry points; 5.3 module scan | Batch 3, 4.1 and 4.2 |
| 6 | Crew for 6.1 and 6.2 (disjoint files), IDE for 6.3 | 6.1 win-and-persist flow, 6.2 edit-and-fix flow, 6.3 final checkpoint | Batch 5 |

## Tasks

- [x] 1. Tooling, types and strings
  - [x] 1.1 [Batch 1] [IDE] [can start before game-rules Batch 5] Add the DOM test tool and the lint globals
    - Files: edit `package.json`, `package-lock.json`, `eslint.config.js`; create `src/ui/happy-dom-smoke.test.ts`, `src/ui/node-env-smoke.test.ts`
    - Run `npm install --save-exact --save-dev happy-dom@21.0.4`; check `package.json` lists `"happy-dom": "21.0.4"` with no `^` or `~`. Add one eslint block that gives `tests/e2e/**` and `tests/fixtures/**` both Node and browser globals (`src/**` already has browser globals). No change to `vite.config.ts`, `tsconfig.json` or `playwright.config.ts`
    - Tests: `happy-dom-smoke.test.ts` starts with `// @vitest-environment happy-dom` and proves `document` exists and can create an element and set `textContent`; `node-env-smoke.test.ts` has no docblock and asserts `typeof document === 'undefined'`, so the engine, model, game and pure UI tests stay in Node
    - Time the `test:fast` run that the `test-on-save` hook uses before and after, and report both figures; the added time should stay small
    - Acceptance: `npm run verify` passes
    - _Requirements: 15.1, 1.1, 1.4_

  - [x] 1.2 [Batch 1] [IDE] [can start before game-rules Batch 5] Create `types.ts` and `strings.ts` with the strings test
    - Files: create `src/ui/types.ts`, `src/ui/strings.ts`, `src/ui/strings.test.ts`
    - `types.ts` imports nothing from `src/game/`. It holds only types, no logic: `StorageLike`, `MountOptions`, `AppHandle`, `Progress`, `LevelEntry`, `KeyInput`, `FocusKind`, `KeyContext`, `KeyCommand`, `Pending`, `Env`, `UiEvent`, `Effect`, `CellView`, `TabView`, `ViewModel`; all fields `readonly`. It defines locally `Direction = 'N' | 'S' | 'E' | 'W'` and `Status = 'playing' | 'won' | 'lost'`, the same literal unions the game uses, so values are assignable both ways (3.2 adds a compile-time check of this). The only import is the type `ErrorKind` from `../engine/index`. `AppState` is not defined here: it holds a `RunState`, so task 3.2 adds it to this file. None of the other types needs `RunState` (`Env` holds `LevelEntry` only, `Effect` holds `Progress`, `UiEvent` holds `KeyCommand`, `CellView` holds `ErrorKind`, `ViewModel` holds plain fields), so nothing else moves. It is exercised by every later test
    - `strings.ts` exports `STRINGS` with every player-visible text of the design table: `titleBar`, `panelTitle`, `tabBarLabel`, `gridLabel`, `nameBoxLabel`, `formulaBarLabel`, `lockedText`, `padlock` (U+1F512), `buttons`, `status`, `edited`, `undone`, `loadFailed`, `somethingWrong`, `won`, `wonLast`, `lostTitle`, `lostBody`, `confirmRestart`, `confirmSwitch(label)`, `damage`, `entity`, `terrain`, `unreadableLevel`
    - Tests: `STRINGS.titleBar` equals `TITLE` from `src/title.ts`; `confirmRestart` equals "Restart this level? Press R or Enter to confirm, Escape to cancel." and `confirmSwitch('Sheet2: The Chaser')` equals "Switch to Sheet2: The Chaser? Press Enter to confirm, Escape to cancel."; `lockedText` equals "This cell is locked and cannot be edited."; `loadFailed`, `somethingWrong`, `won`, `wonLast`, `lostTitle`, `lostBody`, `edited`, `undone` and `panelTitle` equal their exact texts; `padlock` is the single code point U+1F512; no string is empty
    - Acceptance: `npm run verify` passes
    - _Requirements: 14.2, 6.2, 10.3, 10.4, 2.5, 11.4, 9.3, 7.4, Decisions 5 and 20_

- [ ] 2. Pure helper modules
  - [x] 2.1 [Batch 2] [Crew] [can start before game-rules Batch 5] Create `key-map.ts` with tests
    - Files: create `src/ui/key-map.ts`, `src/ui/key-map.test.ts`
    - Export `mapKey(input, context)` implementing the 21-row table of the design top to bottom, first match wins, returning `{ command, preventDefault }` or `undefined`; letters compare through `toLowerCase()`; Meta counts as Ctrl; modifier-only keys (`Shift`, `Control`, `Alt`, `Meta`, `CapsLock`) always return `undefined` and never cancel a confirmation; no browser global is referenced
    - Tests: one table-driven case per row, each asserting both the command and the `preventDefault` flag; plain arrows move only with `focus: 'other'` and `screen: 'playing'`; Ctrl+Arrow and Command+Arrow select on every screen; Alt+Arrow and Shift+Arrow are `undefined`; Space is `wait` on `other` and `undefined` on `button`; `u`, `U`, Ctrl+Z and Command+Z undo while playing, Ctrl+Shift+Z is `undefined`; `r` restarts on every screen but Ctrl+R and Command+R are `undefined`; `n` only on `won` with `hasNext`; text focus ignores game keys except Enter and Escape while `editing`; button focus ignores `u`, `r`, `n`, plain arrows, Enter and Space; Enter on `other` starts an edit only while playing and F2 also from a button; the pending rows 6 to 10, including `r` and Enter confirming a restart, Enter confirming a switch, Escape cancelling, another key cancelling, Shift alone not cancelling, Tab cancelling without `preventDefault`; `composing` and `screen: 'none'` give `undefined`; won and lost screens accept only selection moves, restart, next and the pending rows
    - Acceptance: `npm run verify` passes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 5.2, 7.1, 10.3, Decisions 1, 8, 9 and 17_

  - [x] 2.2 [Batch 2] [Crew] [can start before game-rules Batch 5] Create `confirmation.ts` with tests
    - Files: create `src/ui/confirmation.ts`, `src/ui/confirmation.test.ts`
    - Uses only `Status`, `Pending` and `LevelEntry` from `types.ts` and `STRINGS`; no game import
    - Export `decide(status, pending, wanted)` returning `'prompt'`, `'execute'` or `'cancel'` (execute when there is no run or the Status is not `playing`, or when `pending` equals `wanted`; prompt when nothing is pending; cancel otherwise), `isSame(a, b)` and `promptFor(wanted, entries)` using `STRINGS.confirmRestart` and `STRINGS.confirmSwitch(label)`; the `Pending` type comes from `types.ts`
    - Tests: `decide` over every combination of Status (`playing`, `won`, `lost`, no run), pending (none, restart, switch to the same level, switch to another level) and wanted; `isSame` for equal and different kinds and level indexes; both prompts word for word
    - Acceptance: `npm run verify` passes
    - _Requirements: 10.3, 10.4, 2.4, Decision 9_

  - [ ] 2.3 [Batch 2] [Crew] [needs game-rules Batch 5] Create `messages.ts` with tests
    - Files: create `src/ui/messages.ts`, `src/ui/messages.test.ts`
    - Blocked until the game barrel exists because it imports the types `DamageLog` and `Refusal` and the runtime list `REFUSAL_REASONS` from `../game/index` (the `REFUSAL_REASONS` test loops over the real list)
    - Export `damageSummary(log)` ("-<total> HP: <part>; <part>" in log order, empty string for an empty log), `refusalMessage(refusal, action)` (`undefined` for `blocked` and `occupied` when the Action was a move, `STRINGS.lockedText` for `locked`, the game's message otherwise), `endMessage('won', isLast)`, `terrainWord(cellText)` and `cellLabel(entity, address, cellText)`
    - Tests: `damageSummary` for empty, one trap, "-3 HP: M1 hit you; trap", haunt ("haunted"), two monsters ("-2 HP: M1 hit you; M2 hit you") and a large total printed without an exponent; `refusalMessage` for every entry of `REFUSAL_REASONS` (blocked and occupied silent only for a move, locked text for `locked`, the game's text for the rest); `endMessage` for the middle and the last level; `terrainWord` for `.`, `#`, `X`, `^`, the empty string and an error text; `cellLabel` gives "Hero at B3 on floor" and "Monster M1 at C4 on floor"
    - Acceptance: `npm run verify` passes
    - _Requirements: 9.2, 9.3, 9.4, 10.4, 4.3, 8.6, 6.3, 7.5, Decisions 12 and 18_

  - [x] 2.4 [Batch 2] [Crew] [can start before game-rules Batch 5] Create `progress.ts` with tests
    - Files: create `src/ui/progress.ts`, `src/ui/progress.test.ts`
    - Imports `tabLabel` from `../model/index` (finished) and types from `types.ts`; no game import
    - Export `PROGRESS_KEY` (`grimsheet.progress`), `parseProgress(text, knownIds)` (never throws; empty Progress for null, bad JSON, another `version`, wrong field types or non-string items; keeps the first occurrence of each known id; drops unknown ids; `current` kept only when known), `serializeProgress`, `createProgressStore(storage, knownIds)` with `load` and `save` (both guard the storage call and swallow a throw), `describeLevels(docs)` (defensive read of `id` and `title`, `level-<n>` and `Unreadable level` fallbacks, label from `tabLabel` or `Sheet<n>: <title>`), `firstUnclearedIndex`, `isTabEnabled` (cleared, or first uncleared) and `startIndexFor` (saved current when its tab is enabled, else first uncleared, else 0, never a disabled level)
    - Tests: serialize then parse is identity; missing, not JSON, wrong `version`, `cleared` not an array, a non-string item, `current` of the wrong type; unknown ids dropped; duplicates removed; unknown `current` becomes null; `getItem` throws; `setItem` throws and `save` does not throw; `describeLevels` with an object, `null`, a number and a document with a non-string id; `firstUnclearedIndex` with none, some, all cleared and a gap; `isTabEnabled` for cleared, first uncleared, a later uncleared level (disabled) and an earlier cleared level that stays enabled after a later one is cleared; `startIndexFor` with a saved current that is enabled, one that is disabled, no saved current, all cleared (0) and duplicate ids (first match)
    - Acceptance: `npm run verify` passes
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 2.1, 2.2, 2.3, Decisions 10, 21 and 22_

- [ ] 3. View model and controller
  - [ ] 3.1 [Batch 3] [IDE] [needs game-rules Batch 5] Create `view-model.ts` with tests
    - Files: create `src/ui/view-model.ts`, `src/ui/view-model.test.ts`
    - Export `viewOf(state, env)` (total; builds every derived field of the design: `screen`, `tabs` with `enabled` and `current`, `nameBox`, `formula` with `readOnly`, `locked` and `alert`, `status` with the label from `tabLabel(run.level)` and HP clamped at 0, `message`, `banner` on the lost screen, `buttons`, `activeCell`, and the 19 rows of `CellView`), `changedAddresses(prev, next)` (compares `formatValue` text and Value kind for the 228 rendered addresses; empty set when `prev` is undefined), `moveSelection(address, dir)` (clamped to columns A to L and rows 1 to 20, skipping row 13) and nothing else (`ERROR_CLASS` lives in `render.ts`, task 4.1). Imports `cellValue`, `cellRawText`, `isCellLocked`, `cellName`, `isPlaying` and `canUndo` from `../game/index`, `formatValue`, `parseAddress` and `formatAddress` from `../engine/index`, and `tabLabel` from `../model/index`
    - Tests use an inline Level_Document (a small valid level built in the test file): 19 rows in order; hero and monster cells with entity data and labels; name box with and without a Cell_Name; locked cells; `errorKind` set for an error Value; HP clamped at 0; tabs `enabled` by the cleared-or-first-uncleared rule and `current` on one tab only; Undo disabled on `won` and `lost`; `formula.readOnly` when locked or not playing, `formula.locked` only when locked; exactly one selected cell; `viewOf` with `run: undefined` gives empty cells and disabled Undo and Recover; equal states give equal view models; `changedAddresses` for a moved terrain Value, an error kind change, a same-Value Raw_Text change (not marked) and `prev` undefined; `moveSelection` at all four edges and across row 13 both ways
    - Acceptance: `npm run verify` passes
    - _Requirements: 3.1, 3.2, 3.4, 4.2, 4.3, 4.4, 4.5, 5.1, 5.3, 6.1, 6.2, 9.1, 11.1, 11.2, 11.3, 2.2, 2.3, 10.1, 10.2, 10.4, Decisions 10, 11 and 22_

  - [ ] 3.2 [Batch 3] [IDE] [needs game-rules Batch 5] Create `controller.ts` part A: start, turns, tabs and confirmation
    - Files: create `src/ui/controller.ts`, `src/ui/controller.test.ts`; edit `src/ui/types.ts` (the only edit after 1.2)
    - Add `AppState` to `types.ts` (all fields `readonly`; `run` is `RunState | undefined`, with `RunState` as a type import from `../game/index`). Also add a compile-time check in `controller.test.ts` that the local `Direction` and `Status` of `types.ts` and the game's are mutually assignable
    - Export `createInitialState(env, progress)`, `step(state, event, env)` and `keyContext(state, env, focus)`. Implement in this task: `startLevel` (calls `startRun`; on `ok: false` sets `STRINGS.loadFailed` and keeps the previous run, selection and progress; on success resets the selection to the hero, clears edit, alert, pending and changed, sets the Message to the level hint, sets `progress.current`, and emits `save-progress` and `focus grid`), the start index through `startIndexFor` (never a disabled level; an empty list or a failed start gives `run: undefined`), `accept` (run replaced, `changedAddresses`, Message from the Damage_Log summary, `Undone.`, `Edited.`, the level hint for a quiet move or wait, the won message, the damage summary kept on a loss, progress and a `save-progress` effect on a win), `move` and `wait` (silent for `blocked` and `occupied`, the game's message for any other Refusal, state object unchanged on a refusal), `undo`, `select-move`, `cell-click` (ignores row 13 and bad addresses), `restart`, `tab` (disabled tab ignored, current tab as restart) and `next-level` (won screen only), Rule P with `decide` and `promptFor` (confirm by the same command, by `confirm`, by a `tab` for the pending level; cancel and `dismiss-pending` restore the Message; any other event clears the prompt and applies no Action), immediate restart and switch on the won and lost screens, and the `edit` fields left untouched for part B
    - Tests: accepted move and wait; blocked and occupied moves return the same state object; other refusals show the message; quiet-turn hint, damage summary, loss keeps the summary; undo sets `Undone.`; restart and switch: prompt, repeat, `confirm`, Escape, another key, click elsewhere (`dismiss-pending`), a click on Undo while a prompt shows clears the prompt without undoing; won and lost restart at once; next level; a disabled `tab` ignored with no `startRun` call and no state change; `createInitialState` start index (saved current enabled, saved current disabled so first uncleared, all cleared gives 0); a win enables the next tab and emits `save-progress`; `startRun` failure keeps the old run; changed set kept across selection moves and replaced on the next accepted Action and emptied on a level start; `keyContext` fields for each state; no test mutates a received Run_State
    - Acceptance: `npm run verify` passes
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 5.2, 5.4, 8.5, 8.6, 9.2, 9.3, 9.4, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4, 12.2, Decisions 7, 8, 9, 10, 11, 12 and 18_

  - [ ] 3.3 [Batch 3] [IDE] [needs game-rules Batch 5] Add Edit_Mode to `controller.ts` (part B)
    - Files: edit `src/ui/controller.ts`, edit `src/ui/controller.test.ts` (no other files)
    - Implement the edit transitions of the design table: `edit-start` (locked cell gives `STRINGS.lockedText` and no Edit_Mode; unlocked cell sets `edit` with the Raw_Text and emits `focus formula-bar` and `select-formula-text`), `cell-dblclick` (select, then as `edit-start`), `formula-focus` (enters Edit_Mode only when playing and not already editing; idempotent when it is raised again by the focus effect; locked message for a locked cell), `formula-input`, `edit-commit` (calls `applyAction` with an `edit` Action; accepted leaves Edit_Mode, clears `alert`, runs `accept` with `Edited.` and emits `focus grid`; refusals follow the table: `parse-error` goes only to `alert` and leaves the Message byte for byte unchanged; `no-ink`, `bad-address` keep Edit_Mode and the typed text and set the Message; `unchanged`, `reserved-row`, `not-playing`, `invalid-action`, `internal-error` leave Edit_Mode and set the Message; `locked` leaves and sets `STRINGS.lockedText`; the keep list is the constant `KEEP_EDIT`), `edit-cancel` (no Action, no ink, `focus grid`), and `formula-blur` (with an edit it is a click-away cancel with no Action and no ink; with no edit it returns the same state object and does not clear a pending confirmation). Moving the Selection or clicking a cell clears `alert`. The effects list is returned in order and `step` stays pure so that `app.ts` can store and render the new state before it runs the effects (re-entrancy: a `focus` effect can raise `formula-focus` or `formula-blur` synchronously)
    - Tests: edit commit accepted (ink falls by 1, `Edited.` or the damage summary, `focus grid` effect, Edit_Mode left); each edit refusal reason against the table (Edit_Mode kept or left, Message, `alert`), with `parse-error` leaving `message` unchanged and every other reason leaving `alert` empty; locked `edit-start` and locked `formula-focus` show the locked text; `cell-dblclick` on an unlocked and a locked cell; `edit-cancel` costs no ink; `formula-blur` with an edit cancels with no Action; `formula-blur` after a committed edit or after Escape returns the same state object; a stray `formula-blur` does not clear a pending confirmation; the click-away order, `formula-blur` then `cell-click`, gives cancel then selection with no ink spent; `formula-focus` while editing returns the same state; an edit that changes a Value sets the changed set; an `edit` while the Status is not `playing` is refused and leaves Edit_Mode; `select-move` clears `alert`
    - Acceptance: `npm run verify` passes
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 11.4, Decisions 14, 15 and 17_

- [ ] 4. Renderer, CSS and fixture levels
  - [ ] 4.1 [Batch 4] [Crew] [can start before game-rules Batch 5] Create `render.ts` and `grid-ui.css` with tests
    - Files: create `src/ui/render.ts`, `src/styles/grid-ui.css`, `src/ui/render.test.ts` (starts with `// @vitest-environment happy-dom`)
    - Depends on Batch 1 only: it uses the `ViewModel`, `CellView` and `TabView` types from `types.ts` (task 1.2) and `STRINGS`, and imports nothing from `src/game/`. `render.ts` exports `ERROR_CLASS`, the table from the five error kinds to `cell-error-ref`, `cell-error-name`, `cell-error-div0`, `cell-error-value` and `cell-error-cycle`, typed on `ErrorKind` from `../engine/index`; `view-model.ts` does not export it
    - `createView(root)` builds the skeleton once from the design DOM structure: title bar, `#tab-bar` buttons, `#name-box`, `#formula-bar`, `#formula-note`, `#formula-alert` (`role="alert"`), Undo, Recover and Next level buttons, `#grid-table` (`role="grid"`, `aria-label`, `tabindex="0"`, `aria-activedescendant`), the header row `A` to `L`, 19 body rows plus the row 13 separator, `#end-banner` (`role="alert"`, hidden), `#status-bar` with `#message` (`role="status"`, `aria-live="polite"`), and an empty `#screen-overlay`. `update(viewModel)` writes text and attributes in place (only when they differ), sets `data-screen` on the root, never writes the Formula_Bar value when it already equals the view model text, and never uses `innerHTML`. Each Grid_Cell has `id="cell-<address>"`, `role="gridcell"`, `data-address`, `data-row`, `data-col`, `data-region`, and, when they apply, `data-name`, `data-locked`, `aria-readonly`, `data-selected`, `aria-selected`, `data-changed`, `data-entity`, `data-monster-id`, `aria-label`, `data-error` and the classes `cell-error` plus one per kind, taken from `ERROR_CLASS`; the children are `.cell-text`, `.entity-glyph` and `.padlock` (U+1F512) added and removed as needed. `grid-ui.css` is minimal and functional: table layout, square monospace cells with a system monospace stack, selected-cell outline, visible focus rings, padlock position, entity overlay hiding `.cell-text` when `[data-entity]` is set, `[hidden]`, black on white or white on near-black text; no `url(`, no `@import`, no `http`, no animation
    - Tests: 228 `[data-address]` cells, one separator cell spanning 12 columns with `data-separator="true"` and no `data-address`, 12 column headers and 20 row headers; attributes of Requirements 3 to 5 on hand-built view models (name, locked, selected, changed, entity, error classes for all five kinds); `ERROR_CLASS` maps each of the five error kinds to its class and an unknown kind is not mapped (no entry, so the cell gets no `cell-error-*` class beyond what the table gives); glyph, padlock and label added and removed on a second `update`; `.cell-text` content; tab buttons `disabled` and `aria-current`; banner shown only for `lost`; Formula_Bar `readOnly` and the locked note; `aria-activedescendant` equals the id of the selected cell; the Message region attributes; `data-screen` on the root; rendering the same view model twice gives equal `outerHTML`; a cell text such as `<b>x</b>` appears as text and creates no `b` element; the CSS file contains no `url(`, `@import` or `http`; no element carries a `style` attribute
    - Acceptance: `npm run verify` passes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.3, 6.1, 6.2, 6.3, 9.1, 9.5, 10.1, 10.2, 10.4, 11.1, 13.1, 13.2, 13.3, 14.1, 14.3, Decisions 16, 19 and 20_

  - [ ] 4.2 [Batch 4] [Crew] [needs game-rules Batch 5] Create the fixture and stub levels with a validity test
    - Files: create `tests/fixtures/levels.ts`, `src/stub-levels.ts`, `src/ui/fixture-levels.test.ts`
    - `tests/fixtures/levels.ts` exports `FIXTURE_LEVELS: readonly unknown[]` with the two fixture levels of the design: `01-fixture-corridor` (open floor, hero at `B2`, exit `X` at `D2`, no monsters, HP 5, ink 3, hint "Walk to the exit.") and `02-fixture-lab` (hero at `B2`, a far exit, one monster `M1` far from the hero, labelled rule cells `MOVE_M1` at `B15` holding `"-"` and `ATK_M1` at `B16` holding `0`, HP 5, ink 3). `src/stub-levels.ts` exports `STUB_LEVELS: readonly unknown[]`, one tiny valid Level_Document list for `src/main.ts` until the `levels` spec replaces it. Both are plain data with no logic
    - Tests: `fixture-levels.test.ts` sits under `src/ui/` because Vitest collects only `src/**/*.test.ts`; it imports `../../tests/fixtures/levels` and `../stub-levels` (allowed because this is a test file, and the module scan excludes test files) and asserts that every fixture level and the stub list start with `startRun`, that ids are unique, that the first fixture has no monsters and an exit two steps from the hero, that the second fixture has `B15` and `B16` as rule cells with the expected raw texts, and that the first fixture is won by two moves east using `applyAction`
    - Acceptance: `npm run verify` passes
    - _Requirements: 15.2, 2.1, Decision 3_

- [ ] 5. App, entry points and module scan
  - [ ] 5.1 [Batch 5] [IDE] Create `app.ts`, the `index.ts` barrel and the app tests
    - Files: create `src/ui/app.ts`, `src/ui/index.ts`, `src/ui/app.test.ts` (starts with `// @vitest-environment happy-dom`)
    - `app.ts` exports `mountApp(root, options)` and `browserStorage()`. `browserStorage` wraps `localStorage` and falls back to an in-memory `StorageLike` when reading the global throws; it is the only place that names `localStorage`. `mountApp` describes the levels, loads Progress through the store, builds the initial state, calls `createView`, and installs the listeners: `keydown` on the document through `mapKey` and `keyContext` (call `preventDefault` only when `mapKey` says so), `click`, `dblclick`, `input`, `focus` and `blur` as in the design event wiring table, including `dismiss-pending` for a click on anything that is not a button, the Formula_Bar or a Grid_Cell. A `focusKind` helper classifies `input`, `textarea`, `select` and content-editable targets as `text`, `button` as `button`, everything else as `other`. One `dispatch` function wraps `step`, `viewOf` and `render` in `try/catch`; on a throw it keeps the previous state and sets "Something went wrong."; it stores and renders the new state before running effects (`focus` with `preventScroll`, `select-formula-text`, `save-progress` through the store, each guarded). `destroy()` removes every listener and empties the root. `index.ts` has named exports only: `mountApp`, `browserStorage` and the types `MountOptions`, `AppHandle`, `StorageLike`, `Progress`
    - Tests (import fixtures from `../../tests/fixtures/levels` and use a fake storage): initial render; ArrowRight on `document` moves the hero; Ctrl+Arrow moves the Selection; a click selects; Enter enters Edit_Mode with the Formula_Bar as the active element; typing then Enter commits and ink falls; a parse error shows in `#formula-alert` while `#message` keeps its earlier text; a non-parse refusal shows in `#message` and leaves `#formula-alert` empty; Escape cancels and the blur it causes changes nothing; clicking a cell while editing cancels the edit (ink unchanged) and selects that cell; a disabled tab has `disabled` and clicking it does nothing; saved Progress that names a disabled level starts the first uncleared level; keys typed in the Formula_Bar do not move the hero; keys on a focused button are ignored; a click on Undo while a prompt shows clears the prompt without undoing; Recover prompt then confirm; `data-screen` follows the Status through a win; `destroy()` stops key handling; a handler forced to throw shows "Something went wrong." and the page still responds; storage that throws on read and on write does not break the app; `index.ts` exports exactly the expected runtime names
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 8.3, 8.4, 10.1, 10.2, 10.3, 11.1, 11.4, 12.2, 12.4, 13.1, 14.1, 14.3, Decisions 3, 13, 15, 17 and 19_

  - [ ] 5.2 [Batch 5] [IDE] Wire the entry points
    - Files: edit `src/main.ts`; create `tests/fixtures/index.html`, `tests/fixtures/main.ts`
    - `src/main.ts` imports `mountApp` and `browserStorage` from `./ui/index`, `STUB_LEVELS` from `./stub-levels` and `./styles/grid-ui.css`, calls `document.getElementById('app')`, and when the root exists calls `mountApp(root, { levels: STUB_LEVELS, storage: browserStorage() })`; it names no other browser global. `tests/fixtures/main.ts` does the same with `FIXTURE_LEVELS` from `./levels` and the CSS from `../../src/styles/grid-ui.css`. `tests/fixtures/index.html` has a `#app` element and loads `tests/fixtures/main.ts`. No change to `playwright.config.ts`. The existing `src/title.ts` stays
    - Tests: the existing `title.test.ts` and `index.html` smoke flow keep passing; the scan of both entry files is added in 5.3
    - Run `npm run build` and list `dist/` to confirm no fixture file, fixture level id or `tests/fixtures` path reached the production bundle (search the built files for `01-fixture-corridor`), and report the result
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 14.1, 15.2, 15.3, Decisions 3 and 13_

  - [ ] 5.3 [Batch 5] [IDE] Create the `src/ui` module scan
    - Files: create `src/ui/module.test.ts` (Node environment, no docblock)
    - Modelled on `src/model/module.test.ts` and `src/game/module.test.ts`. Reads the non-test `.ts` files in `src/ui/` plus `src/main.ts` and `tests/fixtures/main.ts`, strips comments and string literals, and checks: the file list equals the design table (`types`, `strings`, `key-map`, `confirmation`, `messages`, `progress`, `view-model`, `controller`, `render`, `app`, `index`) with no subdirectories; `index.ts` has named exports only and exports exactly `mountApp`, `browserStorage` and the types `MountOptions`, `AppHandle`, `StorageLike`, `Progress`, with no default export anywhere; pure files (all except `app.ts` and `render.ts`) mention none of `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `location`, `AudioContext`, `HTMLElement`, `HTMLInputElement`, `Element`, `Event`, `KeyboardEvent`, `MouseEvent`; `render.ts` and `app.ts` may use `document`, only `app.ts` may name `localStorage`, and neither names `window`, `sessionStorage`, `fetch` or `XMLHttpRequest`; `src/main.ts` and `tests/fixtures/main.ts` use `document` only as `document.getElementById`, name none of `window`, `localStorage`, `sessionStorage`, `AudioContext`, `navigator`, `location`, `fetch`, import `mountApp` and `browserStorage` from `./ui/index` or `../../src/ui/index` and never a deeper `src/ui` path, and call `browserStorage()`; all files avoid `eval`, `new Function`, `Math.random`, `Date.now`, `new Date`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` and `http://` or `https://` in string literals; imports resolve only inside `src/ui/` or to `../game/index`, `../model/index` and `../engine/index`, and none points to `src/levels/`; no AI tool name other than Kiro in any `src/ui` file, `src/styles/grid-ui.css`, `src/main.ts`, `src/stub-levels.ts`, `tests/fixtures` or the grid-ui spec files, using a deny-list assembled from string fragments so the test file does not spell the names; the CSS file has no `url(`, `@import` or `http`; a self-check proves the scanner flags a sample bad snippet; no file under `src/game/`, `src/model/` or `src/engine/` imports from `src/ui/`
    - Acceptance: `npm run verify` passes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 14.1, 15.3, Decisions 6 and 13_

- [ ] 6. End-to-end flows and final check
  - [ ] 6.1 [Batch 6] [Crew] Write the win-and-persist flow
    - Files: create `tests/e2e/win-and-persist.spec.ts`
    - Flow 1 of the design against `/tests/fixtures/index.html`: the first tab is current and the second is disabled; press ArrowRight twice; `#app` has `data-screen="won"`, `#message` reads "Changes saved.", and `localStorage` holds `grimsheet.progress` with `01-fixture-corridor` in `cleared`; press `N`; the second tab has `aria-current="page"` and is enabled; reload and the second tab is still current and the first tab is enabled. Use `page.evaluate` for the storage read; no fixed sleeps
    - Tests: the spec is the test; if `npx playwright install chromium` is needed, run it and report; if the environment cannot run Playwright, say so and do not mark the task done
    - Acceptance: `npm run verify` passes and `npm run e2e` passes
    - _Requirements: 15.2, 2.1, 2.2, 2.3, 8.1, 8.2, 10.4, 12.1, 12.2_

  - [ ] 6.2 [Batch 6] [Crew] Write the edit-and-fix flow
    - Files: create `tests/e2e/edit-and-fix.spec.ts`
    - Flow 2 of the design: `page.addInitScript` writes `{"version":1,"cleared":["01-fixture-corridor"],"current":"02-fixture-lab"}` under `grimsheet.progress` and the test never reloads; the page starts the second level; click `[data-address="B15"]`, press Enter and check the Formula_Bar is focused; type `=1+` and press Enter; `#formula-alert` starts with `Col `, the status bar still shows `Ink 3/3` and the Formula_Bar is still focused; replace the text with `"S"` and press Enter; the status bar shows `Ink 2/3` and the grid has focus. Use web-first assertions; no fixed sleeps
    - Tests: the spec is the test; same Playwright setup note as 6.1
    - Acceptance: `npm run verify` passes and `npm run e2e` passes
    - _Requirements: 15.2, 6.3, 7.1, 7.3, 7.4, 7.5, 13.1_

  - [ ] 6.3 [Batch 6] [IDE] Final checkpoint
    - Files: edit `.kiro/specs/grid-ui/tasks.md` to tick the checkboxes; no source edits unless a defect is found
    - Run `npm run verify` and `npm run e2e`; confirm both report zero failures
    - Confirm with `git status` and `git diff` that only `src/ui/`, `src/styles/`, `src/main.ts`, `src/stub-levels.ts`, `tests/fixtures/`, `tests/e2e/`, `package.json`, `package-lock.json`, `eslint.config.js` and the grid-ui spec files changed, with no change under `src/game/`, `src/model/` or `src/engine/`, and that nothing is committed
    - Confirm by search that no name of an AI tool other than Kiro appears in `src/ui/` or in the grid-ui spec files
    - Ensure all tests pass, ask the user if questions arise.
    - Reminder only, not part of this task: add the grid-ui entry to `KIRO_USAGE.md` when the spec is done; do not write it here
    - Acceptance: `npm run verify` passes and `npm run e2e` passes
    - _Requirements: 15.1, 15.2, 15.3, 1.3_

## Notes

- There are no optional tasks. Example-based tests are part of each implementation task. No property tests are planned for this spec.
- Batches 2 and 4, and tasks 6.1 and 6.2, can run in Kiro Crew: their tasks edit disjoint files. Batches 1, 3 and 5 and task 6.3 run in the IDE because their tasks build on each other or share files.
- Tasks 3.2 and 3.3 edit `controller.ts` and `controller.test.ts` and are strictly sequential.
- Early start: exactly these tasks can run before the game barrel exists: 1.1, 1.2, 2.1, 2.2, 2.4 and 4.1 (waves 0, 1 and 2). Everything else needs game-rules Batch 5: 2.3, 3.1, 3.2, 3.3, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2 and 6.3.
- Merge a whole batch before starting the next. Fix defects found in a later batch in the IDE in the file's single owner task, never in parallel.
- The game, model and engine layers are not changed by this spec. The `levels` spec later deletes `src/stub-levels.ts` and passes the five real levels to `mountApp` from `src/main.ts`.
- Each task references granular requirement clauses and the numbered decisions of `requirements.md` for traceability.
- This workflow only creates the plan. Start execution after game-rules Batch 5 is done, by opening this file and choosing "Start task" next to a task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.4", "4.1"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["3.3"] },
    { "id": 7, "tasks": ["4.2"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["5.3"] },
    { "id": 11, "tasks": ["6.1", "6.2"] },
    { "id": 12, "tasks": ["6.3"] }
  ]
}
```
