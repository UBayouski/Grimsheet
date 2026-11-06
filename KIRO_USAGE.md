# Kiro Usage Log

A running log of how Kiro was used to build Grimsheet, one entry per session. This becomes the Kiroween write-up.

Judges ask about: surfaces (IDE / CLI / Web / Crew), custom agents, hooks, specs vs vibe coding, steering, MCP, property-based testing, powers. Tag each entry with the relevant ones.

## Entry format

## YYYY-MM-DD — short title

Surface: IDE | CLI | Web | Crew | none

Features: spec | steering | hook | mcp | agent | pbt | power | vibe

What I asked for:

What Kiro did:

What changed because of it (time saved, bug caught, decision made):

---

## 2026-11-05 — Repo created, brief written

Surface: none

Features: none

What I asked for: Nothing. No Kiro session.

What Kiro did: Nothing.

What changed because of it (time saved, bug caught, decision made): The author created the public repo with an MIT license and wrote `docs/BRIEF.md` by hand as the input to Kiro.

## 2026-11-05 — Steering docs generated from the brief

Surface: IDE

Features: steering

What I asked for: Read `docs/BRIEF.md` and generate steering docs for the project: `product.md`, `tech.md` and `structure.md`. Then add `formulas.md` with a fileMatch on `src/engine/**` and `sheet-ui.md` with a fileMatch on `src/ui/**` and `**/*.css`.

What Kiro did: Read the brief and created five files in `.kiro/steering/`.
- Always on: `product.md` (game model, turn order, editing and ink, error monsters, levels, non-goals), `tech.md` (stack, hard rules, testing, scripts) and `structure.md` (folder layout, dependency direction, naming).
- fileMatch: `formulas.md` on `src/engine/**` (the frozen formula subset and error rules) and `sheet-ui.md` on `src/ui/**` and `**/*.css` (chrome, no-trademark rule, motion, screens).

What changed because of it (time saved, bug caught, decision made): The brief did not specify a folder layout, so the layout in `structure.md` (`src/model/`, `src/game/`, `src/levels/`, `tests/` and so on) was Kiro's choice, made to match the spec plan. Kiro also added an accessibility section to `sheet-ui.md` that the brief does not ask for. Both are open to review and change.

## 2026-11-05 — Project scaffold from the brief

Surface: IDE

Features: steering, vibe

What I asked for: Scaffold the project from section 9 of `docs/BRIEF.md` and the layout in `.kiro/steering/structure.md`: Vite, strict TypeScript, Vitest, fast-check, Playwright and ESLint. Required scripts: `dev`, `test` (`vitest --run`), `build`, `e2e`, `typecheck`, `lint` and `check` (typecheck plus lint). Exact dependency versions, a `.gitignore` that never ignores `.kiro/`, a minimal page rendering `GRIMSHEET.XLS`, one trivial unit test and one Playwright smoke test. Then run everything and report.

What Kiro did: Created `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `playwright.config.ts`, `.gitignore`, `index.html`, `src/main.ts`, `src/title.ts`, `src/title.test.ts` and `tests/e2e/smoke.spec.ts`. Looked up current versions and installed them with exact pinning (no `^` or `~`). Installed the Playwright Chromium browser. Ran `npm test`, `npm run check`, `npm run build` and `npm run e2e`; all four passed (1 unit test, 1 e2e test, clean typecheck and lint, production build).

What changed because of it (time saved, bug caught, decision made): Decision: the latest TypeScript (7.0.2) is outside the range `typescript-eslint` 8.72.1 supports (below 6.1.0), so Kiro pinned TypeScript 6.0.3 to keep linting working. Revisit when `typescript-eslint` supports TypeScript 7. The scaffold follows the steering layout; empty folders for later specs (`src/engine/`, `src/model/`, `src/game/`, `src/ui/`, `src/levels/`) were not created yet. Unit tests live next to source as `*.test.ts`, and e2e tests under `tests/e2e/`. `npm install` reported 10 moderate audit findings, not yet reviewed.

## 2026-11-05 — formula-engine spec: requirements, design and tasks

Surface: IDE

Features: spec, pbt

What I asked for: A spec named `formula-engine` from section 4 of `docs/BRIEF.md` and `.kiro/steering/formulas.md`, covering the tokenizer, parser, printer, evaluator, dependency graph with topological recalculation, cycle detection, the five error types and the `Col N: <message>.` parse-error format. I asked for an evaluation context that the game layer supplies later for `HERO`, `SELF`, `DIST` and `TOWARD`, with no game rules in the engine, and for property-based testing on three requirements. I wrote the spec in Spec mode with Autopilot off, requirements first, and reviewed the requirements before any design was written.

What Kiro did:
- Wrote `requirements.md` (14 requirements, with a glossary) and stopped for review. Each review round changed it:
  - The reference-chain limit went from 1,000 cells to 240, the whole sheet.
  - Empty-cell comparisons were pinned down. An empty cell equals `""` against text, `0` against numbers and `FALSE` against booleans.
  - Rule_Cells were added. A formula that contains `SELF` or calls `TOWARD` gets the "rule" value kind instead of an error. It is evaluated per monster on demand, and the result is returned, not stored.
  - `RAND()` calls got a deterministic order: topological order, with ties broken by reading-order Address.
  - `#CYCLE!` got precedence over every other error, on a cycle and downstream of it.
- Wrote `design.md` with an "Open Questions and Chosen Defaults" section of 29 entries. One default, case-sensitive string comparison, was changed to case-insensitive at review (strings compared by upper-cased form, ordinal by UTF-16 code unit), and the requirements and the design were updated to match.
- Wrote `tasks.md`: 22 tasks in 10 batches, with tasks in the same batch editing different files and a single owner for each shared file (`src/engine/index.ts` and `src/engine/testing/arbitraries.ts`), so batches could run in Kiro Crew. A review of the batches moved the printer, graph and sheet tasks later, because their tests depend on the parser and printer.
- Three property tests are planned, each in its own task after the code it tests: parse-print-parse stability, order independence of recalculation, and totality of evaluation.

What changed because of it (time saved, bug caught, decision made):
- Decisions: the rule-cell model, the `#CYCLE!` precedence and the `RAND()` ordering were made in review, before any code existed.
- Bug caught: the first requirements draft had a 1,000-cell chain limit on a 240-cell sheet.
- Gaps found: review found gaps between criteria (a rule cell on a cycle, an error downstream of a cycle, a per-monster call on an empty cell). Each was settled in the spec and none was left for the code.
- Batch dependencies were checked before any task ran, which is what let Batch 1 go to Kiro Crew.

## 2026-11-05 — formula-engine Batch 1 run in Kiro Crew

Surface: Crew

Features: spec

What I asked for: Run Batch 1 of the formula-engine spec (tasks 1.1 `address.ts`, 1.2 `values.ts`, 1.3 `ast.ts`, each with tests) as a Kiro Crew task. The task was composed in the Task Runner with the Kiro Agent harness and a reviewed plan.

What Kiro did:
- The first plan added three per-task "create branch" steps. In one shared worktree those steps would have switched branches under each other, so I rewrote the prompt to keep all tasks on the run's single branch. Kiro re-planned to nine steps.
- The three tasks ran in parallel on branch `kirocrew/task/plan_1793928397032593000` in a separate worktree, with one commit per passed step. My main checkout was untouched while the run was going.
- The plan ordered the final verification before `ast.test.ts` was written, so the plan's own verification did not cover the whole batch. I re-ran the combined suite outside Crew before merging: 4 test files, 29 tests passing, typecheck and lint clean. After the merge into `main` I ran `npm test` and `npm run check` again with the same result.
- I then ticked tasks 1.1, 1.2 and 1.3 in `.kiro/specs/formula-engine/tasks.md`.

What changed because of it (time saved, bug caught, decision made):
- Time: three independent tasks ran side by side in a separate worktree while the main checkout stayed free.
- Bug caught: the per-task branch steps would have broken a shared worktree. The ordering gap, with verification before the last test file, was found only because I re-ran the suite myself. A passed plan did not mean the combined result was verified.
- Differences from running tasks in the IDE:
  - The work is planned first and reviewed as a plan, then run unattended, instead of being steered turn by turn.
  - Each step is a separate commit on a separate branch, and I merge it afterwards.
  - Crew's commits carry my git identity, so the history does not show that Crew wrote them. This entry is the record that Crew did the work.
  - The plan's verification step can be ordered wrongly, so I re-check the merged result myself.
  - The task checkboxes in `tasks.md` were not updated by the run. I ticked them by hand after checking the merge.

## 2026-11-05 — formula-engine Batch 2 done in a Kiro Crew chat session

Surface: Crew

Features: spec

What I asked for: Do Batch 2 of the formula-engine spec: tasks 1.4 `names.ts`, 1.5 `errors.ts`, 1.6 `context.ts` and 2.1 `tokenizer.ts`, each with tests. I made a Task Runner plan first. Its planner again placed the final verification before some test-writing steps, even though I had explicitly told it to put verification last, the same fault as in Batch 1. I did not run that plan. I did the work in a Kiro Crew desktop chat session instead.

What Kiro did:
- A single agent did the four tasks one after another, in the main checkout, with no branch and no commits. The Task Runner, by contrast, runs steps in parallel in a separate worktree with one commit per step.
- The agent reported reading `requirements.md`, `design.md` and the steering files before each task.
- Its first test run had two wrong tests: `=<>` reads as one operator, and a string column was miscounted. It fixed both in the tests, not in the code.
- It made these choices: a cause format of origin plus message for errors, a non-empty list for `pickError`, a leading `=` operator token at column 1, and an `eof` token at column length + 1.
- It added `makeParseError` and `describeChar` to `tokenizer.ts` so the parser can reuse them.
- Result in the main checkout: 8 test files, 76 tests passing, typecheck and lint clean. I ran `npm test` and `npm run check` myself to confirm. The files are uncommitted. I ticked tasks 1.4, 1.5, 1.6 and 2.1, and parent task 1, in `tasks.md`.

What changed because of it (time saved, bug caught, decision made):
- Bug caught: the planner's ordering fault repeated even with an explicit instruction, so a Task Runner plan has to be checked for where verification sits before it runs.
- Decision: I used chat mode for this batch because it was quicker to start than reviewing and running a plan.
- Comparison of the two Kiro Crew modes: the Task Runner gives isolation and a per-step history, while chat mode is quicker to start but leaves review and commits to the author.

## 2026-11-05 — formula-engine Batch 3 run in Kiro Crew's Task Runner

Surface: Crew

Features: spec

What I asked for: Run Batch 3 of the formula-engine spec as a Kiro Crew Task Runner task: task 2.2 `parser.ts` and task 3.1 `functions.ts`, each with tests. I told the planner to reuse `makeParseError` and `describeChar` from the tokenizer in the parser.

What Kiro did:
- The run used branch `kirocrew/task/plan_1793930905332355600` in a separate worktree. 7 of 7 steps passed in about 8 minutes, and I merged the branch into `main`.
- The planner put the final verification last this time. In Batches 1 and 2 it had put verification before some test-writing steps.
- The parser reuses `makeParseError` and `describeChar` from the tokenizer, as I had instructed.
- Four files changed: `parser.ts` and `functions.ts`, each with its test file.
- I re-ran the combined suite outside Kiro Crew before merging: 10 test files, 140 tests passing, typecheck and lint clean. After the merge I ran `npm test` and `npm run check` again with the same result.
- Kiro Crew's own per-step verification reported "not configured", because no Task Runner test command was set.
- I ticked tasks 2.2 and 3.1 in `.kiro/specs/formula-engine/tasks.md`.

What changed because of it (time saved, bug caught, decision made):
- Attribution: from this run on, Kiro Crew's step commits carry a separate "Kiro Crew" git author. A repo-local conditional git include sets it, and it applies only inside linked worktrees. The history now shows which commits Kiro Crew made, which was not true for Batch 1, where its commits carried my identity.
- Gap found: with no test command set, Kiro Crew's per-step verification checked nothing. My re-run outside Kiro Crew is still the only real check of the combined result. Setting the Task Runner test command would close this gap.
- Time: two independent tasks ran in a separate worktree in about 8 minutes while the main checkout stayed free.

## 2026-11-05 — formula-engine Batch 4 run in Kiro Crew's Task Runner

Surface: Crew

Features: spec

What I asked for: Run Batch 4 of the formula-engine spec as a Kiro Crew Task Runner task: task 2.3 `printer.ts`, task 3.2 `evaluator.ts` core and task 4.1 `graph.ts`, each with tests. The instructions were that the evaluator's function-call handling be a stub returning `#NAME?` until task 3.3, and that `graph.ts` take plain `GraphCell` input and not import the sheet.

What Kiro did:
- The run used branch `kirocrew/task/plan_1793931651705181600`. 8 of 8 steps passed in about 10 minutes, with seven commits authored by "Kiro Crew". I merged the branch into `main`.
- The evaluator's call stub returns `#NAME?` as instructed. `graph.ts` takes plain `GraphCell` input and imports only `address` and `ast`, with no sheet import.
- The commit history shows the final-verification step (step 8) ran before the printer, evaluator and graph test files were written, although the run summary lists it last. The commit order was: `graph.ts`, `evaluator.ts`, `printer.ts`, final verification, then `printer.test.ts`, `evaluator.test.ts` and `graph.test.ts`.
- That verification step also changed 37 lines of `evaluator.ts` (25 added, 12 removed) instead of only checking. The tests written afterwards pass against that version.
- I re-ran the combined suite outside Kiro Crew before merging: 13 test files, 243 tests passing, typecheck and lint clean. After the merge I ran `npm test` and `npm run check` again with the same result.
- I ticked tasks 2.3, 3.2 and 4.1, and parent task 2, in `.kiro/specs/formula-engine/tasks.md`.

What changed because of it (time saved, bug caught, decision made):
- Lesson: the run summary shows plan order and the commit history shows execution order, so I review the history, not the summary.
- Bug caught: a step labelled "verification" rewrote code before the tests that cover it existed. The evaluator edit was not checked by its own tests at the time it was made. It was checked only by the tests written afterwards and by my re-run.
- Time: three independent tasks ran in a separate worktree in about 10 minutes while the main checkout stayed free.

## 2026-11-05 — formula-engine Batch 5 run in Kiro Crew's Task Runner

Surface: Crew

Features: spec

What I asked for: Run Batch 5 of the formula-engine spec as a Kiro Crew Task Runner task: task 3.3, the evaluator function calls, and task 4.2, `sheet.ts`, each with tests. After the Batch 4 run, I added a rule to the prompt: the final verification step must only run checks and never edit code.

What Kiro did:
- The run used branch `kirocrew/task/plan_1793932730969087400`. 7 of 7 steps passed in about 7 minutes, with four step commits authored by "Kiro Crew". I merged the branch into `main`.
- The verification step made no commit this time. In Batch 4 it had changed 37 lines of `evaluator.ts`.
- Task 3.3 replaced the `#NAME?` stub with the call pipeline. It checks in the designed order: `#CYCLE!` in any argument, unknown function, argument count, leftmost argument error, then type errors. The earlier evaluator tests still pass.
- Task 4.2 exports `getSheetState` and `commitRecalculation` from `sheet.ts` as internal helpers, and uses the printer to produce canonical text for edits.
- I re-ran the combined suite outside Kiro Crew before merging: 14 test files, 295 tests passing, typecheck and lint clean. After the merge I ran `npm test` and `npm run check` again with the same result.
- I ticked tasks 3.3 and 4.2, and parent task 3, in `.kiro/specs/formula-engine/tasks.md`.

What changed because of it (time saved, bug caught, decision made):
- The new rule held in this run: the verification step made no commit and edited no code. Earlier batches differed. In Batch 1 verification ran before the last test file. Batch 2 was a chat session with no Task Runner run. In Batch 3 verification ran last without editing, and in Batch 4 it ran early and edited `evaluator.ts`. One run is not enough to say the rule is reliable.
- Time: two independent tasks ran in a separate worktree in about 7 minutes while the main checkout stayed free.

## 2026-11-05 — formula-engine task 4.3 (recalculator) run in the IDE

Surface: IDE

Features: spec

What I asked for: Run task 4.3 of the formula-engine spec, `recalculator.ts` with tests, from the spec panel with Start task, with Autopilot off.

What Kiro did:
- The first version named the peers of each cycle cell by calling `reachable()` for every pair of cycle cells.
- An outside review measured two cases. A sheet of 240 cells all set to `=SUM(A1:L20)` took about 17 seconds, which breaks the 5-second limit in Requirement 12.3. A 240-cell circular chain took about 0.6 seconds.
- The fix added `circularComponents()` to `graph.ts`, built from the existing Tarjan pass. The recalculator now names peers from each cell's own component, with no extra graph walks. The cause wording and order are unchanged.
- The two cases now take about 15 ms and 5 ms. Two regression tests assert that each finishes in under 1 second. The first also checks that all 240 cells hold `#CYCLE!`.
- Result: 15 test files, 323 tests passing, typecheck and lint clean.

What changed because of it (time saved, bug caught, decision made):
- Bug caught: the quadratic cycle-cause naming passed its first tests and was found only by an outside review that measured a full-sheet cycle. The task's own tests had no case that large, so the regression tests now cover it.
- Differences from the Kiro Crew Task Runner runs:
  - The task ran one at a time in the main checkout, not in a separate worktree.
  - I approved each change in the diff view, instead of reviewing a plan and merging a branch afterwards.
  - Kiro committed nothing, so there are no per-step commits and no separate author in the history. This entry is the record of what Kiro did.

## 2026-11-05 — formula-engine task 4.4 (evaluate-cell, per-monster evaluation) run in the IDE

Surface: IDE

Features: spec

What I asked for: Run task 4.4 of the formula-engine spec, `evaluate-cell.ts` with tests, from the spec panel with Start task, with Autopilot off.

What Kiro did:
- Created `src/engine/evaluate-cell.ts` and `src/engine/evaluate-cell.test.ts`. The exports are `EvaluateCellResult`, `evaluateCell`, `listCycleCells`, `ErrorDescription`, `DescribeErrorResult` and `describeError`.
- `evaluateCell` checks in the designed order. It returns `cell-not-found` first. A Cell that is not a Rule_Cell, or a Rule_Cell on a cycle, returns its stored Value with `source: 'stored'` and never reads the context. Only a Rule_Cell off a cycle validates the context, and a bad one gives `invalid-context` with the field name. It then evaluates with the Self_Address, reads stored Values, and stores nothing.
- `listCycleCells` returns cycle Cell addresses in reading order with no duplicates. `describeError` returns the kind, cause and origin of an error Value, or `null` for a Cell that is not an error.
- The tests cover:
  - `cell-not-found` before the context check, for an address and for a name.
  - A Rule_Cell evaluated with a Self_Address.
  - `#REF!` for an absent or out-of-sheet Self_Address.
  - Stored Values returned without touching the context, using a context that throws if read.
  - An empty Cell returning `""`.
  - Nothing stored.
  - A Rule_Cell that references a Rule_Cell seeing `#VALUE!`.
  - An erroring formula returned as an Error_Value with `ok: true`.
  - `stale` after an unrecalculated edit.
  - Cycle list ordering and the empty list.
  - `describeError` for an error, a non-error and a missing Cell.
- Result: 16 test files, 340 tests passing (17 of them new), typecheck and lint clean.

What changed because of it (time saved, bug caught, decision made):
- Choices beyond the design, open to review:
  - An exception thrown while evaluating a formula becomes a `#VALUE!` Error_Value with the cause "internal error", so `evaluateCell` never throws.
  - A broken lookup, or any exception outside evaluation, is reported as `cell-not-found`.
  - A Cell with no parsed formula is treated like a non-Rule_Cell and returns its stored Value.
  - A reference to a Cell that has no record first fell back to the evaluated Cell's own stored Value. On review this was changed (see below).
  - Cell names are matched case-insensitively, by upper-casing the name.
  - `stale` copies the sheet's dirty flag, so it is true for every Cell after any unrecalculated edit, not only for the Cells that edit affects.
- Orchestration: the task was dispatched to a sub-agent. Its first lookup used the short task id `4.4`, which the task tool did not recognize. The id had to be the full title string.
- Follow-up on the missing-record fallback: every Sheet from `createSheet` has exactly 240 Cell records, and the evaluator only asks for in-sheet points (it returns `#REF!` itself for anything else), so the path cannot run through the public API. It can only run if the sheet state is corrupted. I replaced the fallback with a `#REF!` whose cause names the missing Address (for example `refers to B1, which has no cell record`), marked in the code as defensive. A new test deletes the B1 record from the sheet state and checks that `=B1+ROW(SELF)` gives `#REF!` with `B1` in the cause. The old fallback would have returned a different error there.
- I re-ran `npm test` and `npm run check` myself after that change: 16 test files, 341 tests passing, typecheck and lint clean. The 340 count above is the sub-agent's earlier report.
- As with task 4.3, Kiro committed nothing, so this entry is the record of what Kiro did.

## 2026-11-05 — Agent hooks: tests on save, check before finishing

Surface: IDE

Features: hook

What I asked for: Add two agent hooks from section 13 of `docs/BRIEF.md`. One runs `npm test` whenever a file under `src/` is saved. The other runs `npm run check` before the agent finishes a task. Both use the Windows-safe form: npm scripts only, with no `&&` chains in the hook command.

What Kiro did:
- Created `.kiro/hooks/test-on-save.json`: trigger `PostFileSave`, matcher `(^|[\\/])src[\\/]` (accepts both slash styles in Windows paths), command `npm test`.
- Created `.kiro/hooks/check-before-finish.json`: trigger `Stop`, command `npm run check`.
- Both commands are single npm scripts. `npm test` maps to `vitest --run`, so it is a single run and not watch mode. The typecheck-plus-lint chaining lives in the `check` script in `package.json`, not in the hook.
- Not done: the third hook in section 13, rerunning the level solver when a level file changes. It has to wait until the levels and the solver test exist.

What changed because of it (time saved, bug caught, decision made):
- Decision: I mapped "before you finish a task" to the `Stop` trigger. The `Stop` hook can only run the check and report. It cannot block the finish.
- Hooks status (updated): both hooks are confirmed running. The IDE shows "Run Command Hook: Full tests, type-check and lint before finishing" when a turn ends, and test-on-save output was attached after a save.
- Failure found: one run reported 22 failed suites, all with "Cannot read properties of undefined (reading 'config')". It came from the Stop hook, not the save hook: 
pm test has 22 files and 	est:fast has 19. The cause was the IDE starting hook commands from a lowercase drive path (d:\Projects\...). On Windows, Vitest run from a cwd whose drive letter case differs from the real path loads two copies of itself. --root did not fix it, and from D:\... the run passes.
- Fix: scripts/canonical-cwd.mjs resets the cwd to its real path, then runs the rest of its arguments. Both hook commands now start with 
ode scripts/canonical-cwd.mjs.
- The save hook's src/ matcher was never at fault.

## 2026-11-05 — formula-engine Batch 9 property tests run in Kiro Crew's Task Runner

Surface: Crew

Features: spec, pbt

What I asked for: Run Batch 9 of the formula-engine spec as a Kiro Crew Task Runner task: tasks 5.2, 5.3 and 5.4, the three property tests (parse-print-parse stability, order-independent recalculation, totality of evaluation), all written against the generators in `testing/arbitraries.ts`. The instruction was to write tests only and make no engine edits.

What Kiro did:
- The run used branch `kirocrew/task/plan_1793935577112043700`. The three tests were written in parallel, with one step commit each. The commit order was 5.4 (`totality.prop.test.ts`), then 5.2 (`print-parse.prop.test.ts`), then 5.3 (`recalc-order.prop.test.ts`).
- The branch diff against `main` touches only those three new files, 343 lines in total. No engine file changed, as instructed.
- Properties 1 and 2 pass.
- Property 3 (totality) fails. fast-check seed `-52737584` shrinks to a sheet where J6 is `=RAND() * G13` and the Random_Source throws. J6 became `#VALUE!` with the cause `J6 internal error: random source failed`. The evaluator called `this.env.random()` in the `RAND` case with no guard, so the exception reached the catch-all in `evaluateAst`. The property forbids any cause containing `internal error`.
- I merged the branch into `main` to fix the engine there.

What changed because of it (time saved, bug caught, decision made):
- Bug caught: design open question 26 says a Random_Source that breaks its contract makes that `RAND()` call `#VALUE!`. The evaluator never implemented it, and no example test used a bad source. The property test's misbehaving-`random` generator found it.
- Decision: the test was right and the engine was wrong, so the fix goes in the engine and the test is not changed. The fix is the next entry.

## 2026-11-05 — RAND() guard fix and property-test timeout, in the IDE

Surface: IDE

Features: pbt

What I asked for: Fix the engine, not the test, for the totality failure from Batch 9: implement design open question 26 in the `RAND` case, add example tests for bad Random_Sources, and rerun the property with seed `-52737584` and with fresh seeds. Then, once the remaining timeout was diagnosed, give the totality test a per-test timeout and split the hook test runs.

What Kiro did:
- `evaluator.ts`: the `RAND` case now calls the Random_Source inside a `try`. If the call throws, or the result is not a finite number in [0, 1), that call gives `#VALUE!` with a plain cause such as `J6 RAND() got an invalid number from the random source`. It never gives the internal-error wording.
- `evaluator.test.ts`: seven new bad-source example tests. The sources throw, return a non-number, NaN, Infinity, a number below 0, exactly 1, or a number above 1. Each test checks for `#VALUE!` and that the cause does not say "internal error".
- With the defect fixed, the property no longer stopped early at a counterexample. Its 300 cases then went past Vitest's 5-second default timeout for a single test.
- The spec's 5,000 ms limit is per case, and the engine meets it. Kiro measured the slowest case at 785 ms. The `long-range-formulas` scenario took almost all the time: 240 cells, each a `SUM` of 1,427 copies of `A1:C4`, at about 660 ms per run, drawn about 20 times in 300 runs.
- The totality `it()` now has a 120,000 ms timeout, with a comment that the per-case 5,000 ms check is still asserted inside the property.
- Hooks split:
  - New npm script `test:fast` runs `vitest --run` excluding `**/*.prop.test.ts`. The `PostFileSave` hook now runs `npm run test:fast`, which takes about 1.4 s for 17 files.
  - New npm script `verify` runs `npm test` then `npm run check`. The `Stop` hook now runs `npm run verify`, with its timeout raised from 120 s to 300 s.
  - `npm test` still runs everything.
- Results:
  - Seed `-52737584` passes (about 15 s), and three fresh-seed runs pass (12 to 16 s each).
  - `npm test`: 20 test files, 359 tests passing.
  - `npm run check` and `npm run verify` are clean.
  - I ticked task 5.4 in `tasks.md`.

What changed because of it (time saved, bug caught, decision made):
- Bug caught: property-based testing found the unguarded `RAND()` call that the 341 example tests had missed. No example test used a misbehaving Random_Source. The property generator includes one by design.
- Second finding: the fix uncovered a test-harness limit that the earlier failure had hidden. It was settled with a per-test timeout, not by weakening the property, because the spec limit is per case.
- Decision: a faster engine was considered and not chosen. Function calls collect every error across every range cell to decide which one wins, and stopping early there would risk changing error precedence. Parsing and graph building alone would still use most of a 5-second budget.
- Decision: saves run the fast suite, so the save hook stays quick. Finishing runs everything, including the property tests.
- Not verified: the changed hooks take effect from the next session start, so neither has been seen firing yet.

## 2026-11-05 — Formula engine Batch 10: public API and constraint scan

Surface: Crew, then IDE

Features: spec

What I asked for: Do tasks 6.1 and 6.2 of the formula-engine spec in a Kiro Crew chat session, with a fixed three-step plan: the `index.ts` barrel and its test, the source-constraint scan test, then a verification step that only runs checks. No branches, no edits to existing files under `src/`, and no edits to `tasks.md` or this log. Then review the result in the Kiro IDE and fix what the review found.

What Kiro did:
- Kiro Crew (chat session, main checkout, no worktree, no commits) created three files:
  - `src/engine/index.ts`: the public API. It has named exports only, no default export, and `export type` for types. It exports the 11 operations plus `tokenize`, `formatValue`, `formatNumber`, `parseAddress`, `formatAddress`, `isRuleAst` and `MAX_DEPTH`, and the result, value, AST, address and context types that the modules define. Kiro Crew reported no disagreement between `design.md` and the real modules.
  - `src/engine/index.test.ts`: checks the exact set of runtime export names and that there is no `default`. It also runs an end-to-end flow: set cells, name one, recalculate, read by address and by name, evaluate a rule cell (`"N"`), list a self-referencing cycle cell and describe its `#CYCLE!`.
  - `src/engine/constraints.test.ts`: reads every non-test `.ts` file under `src/engine/` with `node:fs` and `node:path`, strips comments and string literals, and checks with word-boundary matches for `eval`, `new Function`, `Math.random`, `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch` and `XMLHttpRequest`, and for imports reaching `src/model`, `src/game` or `src/ui`. It checks that the 16 expected modules are found and includes self-checks on sample snippets.
- Kiro Crew's verification step reported 22 test files and 382 tests passing, with typecheck and lint clean, and it edited no code.
- The IDE review found two gaps in the comment and string stripper. Both caused missed hits, never false failures, and neither hid anything in the current engine sources:
  - Template literals were blanked whole, including code inside `${...}`, so `` `${window.x}` `` was not caught. Fix: the stripper now blanks only the literal text and scans the code in each substitution, including nested braces and nested templates.
  - Regex literals were not recognized, so a quote inside one, such as `/"/`, started a "string" that hid the code after it. Fix: a `/` now starts a regex when the previous meaningful token is not an identifier, number, `)` or `]` (keywords such as `return` and `typeof` still allow a regex). Regex bodies, character classes and flags are blanked.
- Two new self-check tests cover the fixes. They check that banned names inside `${...}` are flagged (simple, nested template, nested braces) while template text is not. They check that code after a regex containing a quote is still scanned, that a banned word inside a regex is not flagged, and that division is not mistaken for a regex. The existing self-checks still pass. Only `constraints.test.ts` changed in the IDE session.
- Final result from `npm run verify`: 22 test files, 384 tests passing, typecheck and lint clean.
- I ticked tasks 6.1, 6.2 and parent task 6 in `tasks.md`. All implementation tasks of the formula-engine spec are now complete. Task 7, the final checkpoint, is a verification task and is still unticked. Its checks pass: `npm test` and `npm run check` are green, and the only file under `src/engine/` that imports `index.ts` is `index.test.ts`, the API test from task 6.1.

What changed because of it (time saved, bug caught, decision made):
- Bug caught: the review of Kiro Crew's scanner found two ways a banned construct could slip past it. The scan is what keeps the engine DOM-free (the `tsconfig` `lib` includes DOM types), so a blind spot there would weaken that constraint without any test failing.
- Hooks: this was the first session with the split hooks. The IDE file-edit tools were not available in this session, so the edits were made through the terminal, and no `PostFileSave` hook fired. No hook output appeared during the session. Whether the `Stop` hook (`npm run verify`) ran at the end could not be observed from inside the session.
- Nothing was committed.

## 2026-11-05 — formula-reviewer custom agent and its first review of src/engine

Surface: CLI

Features: agent

What I asked for: First, tick task 7 (final checkpoint) in the formula-engine `tasks.md`. Then create a read-only custom agent, `formula-reviewer`, in `.kiro/agents/`. It may read files and run `npm test`, `npm run check`, `git diff` and `git log`, and must never edit, create or delete files. It checks `src/engine` against `docs/BRIEF.md` section 4 and the formula-engine requirements: the frozen function set, the five error kinds and the `Col N: <message>.` format, error order and totality, deterministic recalculation, layering, and test coverage. It reports findings most severe first, each marked "bug", "spec drift" or "test gap". I asked for one run over all of `src/engine`, and for nothing to be fixed yet.

What Kiro did:
- Task 7: ran `npm run verify` first (22 files, 384 tests passing, typecheck and lint clean) and searched the imports. Only `src/engine/index.test.ts` imports `./index`. Then ticked task 7. Parent task 5 is still unticked although 5.1 to 5.4 are ticked; I left it, as it was not asked for.
- Agent: created `.kiro/agents/formula-reviewer.json` with `fs_read` and `shell` only, no write tools, a shell allowlist of the four commands (plus `git status` and `git show`), and a prompt that sets the checks, the finding format and "Checked" and "Could not verify" sections.
- Format fixes: the first draft used the tool name `execute_bash`, which is not a CLI tool name. I changed it to `shell` after checking a Kiro agent schema reference. The first draft's deny list also blocked `npm test` and `npm run check`, so the first review run could not run either. I removed the deny list and tightened the git allowlist patterns so they exclude `; & | < > $`.
- First review: run with `kiro-cli chat --agent formula-reviewer --no-interactive`, trusting only `fs_read`. The agent was not available through the in-session sub-agent tool, which does not see agents created mid-session. Both runs changed no files (`git status` shows only the `tasks.md` tick and the new agent folder).
- Second review (after the fix): `npm test` ran (22 files, 384 tests passing) and `npm run check` passed. 9 findings: 4 bug, 3 spec drift, 2 test gap.
  - Bugs:
    - `recalculate` has no outer `try/catch`, so a context with a throwing getter can throw.
    - `evaluateCell` reports any exception as `cell-not-found`.
    - A single empty-cell argument is skipped by `SUM`, `MIN` and `MAX`, where the design says `0`.
    - A literal `-0` is stored as `-0`, but evaluated results are normalised to `0`.
  - Spec drift:
    - An empty cell in boolean context gives `#VALUE!`, where the design says `FALSE`.
    - The printer failure shape differs from the design.
    - A call such as `=F2(1)` gives a parse error instead of `#NAME?`.
  - Test gaps:
    - No test for a throwing context, a single empty-cell argument to `MIN` or `MAX`, or an empty cell in a boolean position.
    - No non-cyclic stress case for the 5,000 ms limit.

What changed because of it (time saved, bug caught, decision made):
- Bug caught in my own agent config: the deny list silently made the agent unable to run its two main checks. The first report said so under "Could not verify", which is how I found it.
- Open: the findings are from reading the code and were not reproduced. The agent said so for findings 1, 2, 3, 4 and 7. Nothing is fixed yet.
- Not verified: the agent's read-only guarantee rests on its tool list (no write tools) and its allowlist. A GitHub issue reports that `toolsSettings` may not be enforced at runtime in some CLI versions, so the missing write tools are the stronger guard. I did not test an attempted write.

## 2026-11-05 — Acting on the first formula-reviewer review

Surface: IDE, with the Kiro CLI for the second review

Features: agent, spec, hook, pbt

What I asked for: Act on the 9 findings of the first formula-reviewer review. Fix findings 1, 2, 4, 5 and 6 in code, each with tests that fail on the old code. Resolve findings 3 and 7 by changing `design.md` and pinning each with a test. Add the missing stress test (finding 9). Then run `npm run verify`, tick parent task 5, run the reviewer again and log the result. Use the IDE file-edit tools for every change so the save hook runs, and do not commit.

What Kiro did:
- Fixed in code:
  - Findings 1 and 2: `validateContext` in `context.ts` is now total. Every property read goes through a guarded read, so a throwing getter or a throwing Proxy trap marks that field invalid. `recalculate` returns `invalid-context`, and `evaluateCell` returns `invalid-context` after the `cell-not-found` check, which still comes first.
  - Finding 4: `classifyLiteral` in `recalculator.ts` normalises `-0` to `0`.
  - Finding 5: an empty cell in an `IF` condition, `AND`, `OR` or `NOT` is `FALSE`. Numbers and strings there are still `#VALUE!`.
  - Finding 6: `PrintResult` in `printer.ts` now has the design shape `{ ok: false, error: { kind: 'non-finite-number' | 'invalid-node', detail } }`. `printer.test.ts` and `print-parse.prop.test.ts` were updated to match.
- Resolved by a design change:
  - Finding 3: `design.md` now says a single empty-cell argument to `SUM`, `MIN` or `MAX` is skipped, like an empty Range member. I chose this because it is what ordinary spreadsheets do, and because the old rule made `MIN(5, A1)` differ from `MIN(5, A1:A1)`. The code already behaved this way, so no code changed. Three tests pin it: `MIN(A1,5)` is 5, `MAX(A1,-5)` is -5 and `SUM(A1)` is 0. Requirement 9.5 already says to compute over the numeric members, so the requirements needed no change. The edit covers the function table row, the rule paragraph and open question 21.
  - Finding 7: a new open question, 30, in `design.md` says a name shaped like an Address is always a cell reference, so `=F2(1)` is a parse error (Col 4, at the `(`), not `#NAME?`. One parser test pins it. The code already behaved this way.
- Finding 9 (test gap): one recalculation test with 240 formula cells and no cycle. Rows 2 to 20 each read four large Ranges over the rows above them. It asserts no cycle cells and a time under 5,000 ms.
- Old code versus new tests: I swapped the four changed source files (`context.ts`, `evaluator.ts`, `recalculator.ts`, `printer.ts`) back to their last committed versions and ran the four affected test files. 22 tests failed: the hostile-context tests for both functions, the `-0` test, the empty-cell boolean tests, and all the printer refusal tests. The tests that pin the design change, the `F2(1)` test and the stress test passed on the old code, which is expected: the first two document behaviour the code already had, and the stress test closes a gap. I restored the files afterwards and checked that the new source was back in place.
- `npm run verify`: 22 test files, 404 tests passing (384 before, so 20 new), typecheck and lint clean. Parent task 5 is ticked in `tasks.md`.
- Second formula-reviewer run (kiro-cli, `--agent formula-reviewer`, `fs_read` trusted): it ran `npm test` (22 files, 404 tests) and `npm run check`, both green. It reported 5 findings: 1 bug, 3 spec drift and 1 test gap, and none of the original 9. The new findings:
  - Bug: `validateCellName` accepts names like `M1` to `Z9`, but the tokenizer reads them as address tokens, so those names can never be referenced.
  - Spec drift: the extra graph edge for `HERO` in value position (open question 18) means the hero's position can create or clear a cycle, and `ROW(IF(c, HERO, B1))` gets a false edge.
  - Spec drift: `recalculate` and the sheet functions have no outer `try/catch`, and the outer catch in `evaluateCell` still reports `cell-not-found` for an internal fault.
  - Spec drift: error causes name only the origin Address, not the cell name in parentheses.
  - Test gap: the constraint scan flags `new Function` but not a plain `Function(...)` call, and it checks few browser globals.
  - None is fixed yet.

What changed because of it (time saved, bug caught, decision made):
- Decision: findings 3 and 7 were settled in the design, because the code already did the sensible thing and the design was the part that was wrong or silent. Each is pinned by a test, so the design and the code cannot drift apart again without a failure.
- Bug caught by the second review: my own new design note for finding 7 said `validateCellName` refuses every address-shaped name. It does not. It refuses only columns A to L, and `M1` slips through (the reviewer's finding 1). I corrected the note to say so and to point at the open finding. The note was wrong when I wrote it, and the second review is what showed it.
- The second review stays a read-only check. It said it did not read all of `design.md`, did not read every test file, and did not measure the worst-case 5,000 ms timing. Its mapping from requirements to tests is by behaviour, because the tests do not cite requirement numbers.
- Save hook: every edit in this session went through the IDE tools (`str_replace`, `fs_write`, `fs_append`). No hook output appeared in the result of any of those edits, so I did not see the `PostFileSave` hook fire. That does not show that it did not run, because I cannot see it from inside the session, and a result without output is also what a hook that ran and printed nothing would give. The old-code check was the one place I used the terminal to change source files, and I restored them straight after. The full `npm run verify` I ran myself passed.
- Nothing was committed.

## 2026-11-05 — Acting on the second formula-reviewer review

Surface: IDE, with the Kiro CLI for the third review

Features: agent, spec, hook

What I asked for: Act on the five findings of the second formula-reviewer review. Tests first, each code fix with a test that fails on the current code. Findings 1, 3, 4 and 5 in code, finding 2 in the spec only. Then run `npm run verify`, run the reviewer a third time, and check the Kiro output log for `[hooks]` lines after an edit.

What Kiro did:
- Finding 1 (bug): `validateCellName` now rejects any letter plus digits (`^[A-Za-z][0-9]+$`), so `M1` and `Z9` are refused with `address-like`, the same words the tokenizer reads as address tokens. The old `M1`-is-accepted test was replaced. A new test takes a sample list of names, and for each one the validator accepts it sets the name on a cell, uses it in `=NAME+1`, recalculates, and checks the result is 42. Requirement 1.5 and the design's name check were amended to match.
- Finding 2 (spec drift, resolved in the spec, no code change): the `HERO` dependency edge is now written into Requirement 11, criterion 1, with its reason. A formula that reads `HERO` depends on the hero's cell, so recalculation order needs the edge, and a cycle through the hero's position is a real cycle. Open question 18 in `design.md` is closed with that decision, and `ROW(IF(c, HERO, B1))` getting an edge is recorded there as a known limitation.
- Finding 3 (spec drift): the bodies of `recalculate`, `setRawText`, `setCellName`, `getValueByAddress` and `getValueByName` are wrapped in an outer `try/catch` that returns a refused result with the new error kind `internal-error`. The outer catch in `evaluateCell` and `describeError` now returns `internal-error` too, not `cell-not-found`. The result types and `design.md` were updated. The export surface did not change, so `index.test.ts` needed no edit. The tests force a fault with `vi.spyOn`, restore it afterwards, and check that real misses still give `cell-not-found`. The faults: `buildGraph` for `recalculate`, `parseFormula` for `setRawText`, `validateCellName` for `setCellName`, `parseAddress` for `getValueByAddress` and `describeError`, `validateContext` for `evaluateCell`, and `Map.prototype.get` (for one call only) for `getValueByName`.
- Finding 4 (spec drift): error causes now start with the address plus the name in parentheses when the cell has one, for example `B9 (MOVE_M1) divides by zero`. `makeError` takes an optional origin name, keeps the 200-character cap, and leaves the Value's `origin` field as the bare Address, because `pickError` reads it. The evaluator, the `#CYCLE!` cause and the internal-error value all use it. Tests cover a named and an unnamed origin for `#DIV/0!`, `#VALUE!` and `#REF!`, a named `#CYCLE!`, and the cap with a 250-character name.
- Finding 5 (test gap): the constraint scan now also flags a plain `Function(` call and adds `AudioContext`, `location`, `indexedDB`, `requestAnimationFrame` and `HTMLElement`. New self-check tests cover `Function(` (and that lower-case `function` is not flagged) and each new global, including that a string, a comment and the word `relocation` are not flagged. The real engine sources stay clean.
- Counts: `npm run verify` gives 22 test files and 425 tests passing (404 before, so 21 new), with typecheck and lint clean.
- Tests first, checked afterwards: I wrote the new code and tests together, so I proved the order after the fact. I made a scratch copy of the project outside the repo and reverted this round's fixes there. 16 tests failed on that copy: the name and resolve tests, the four `internal-error` fault tests for the sheet functions, the recalculate and evaluateCell/describeError tests, the named-origin cause tests (including `#CYCLE!` and the cap) and the two constraint self-checks. The unnamed-origin tests and the "real miss is still `cell-not-found`" tests passed there, as expected. The scratch copy was deleted and no repo file was swapped this time.
- Third formula-reviewer run (kiro-cli, `fs_read` trusted): `npm test` (22 files, 425 tests) and `npm run check` green. None of the five earlier findings came back. It reported 6 new findings: 2 bug, 1 spec drift and 3 test gap.
  - Bug: `ROW(HERO, 1)` or `DIST(HERO)` (wrong argument count) drops the `HERO` edge but the evaluator then reads the hero cell, which may not be computed yet, so a `#CYCLE!` hero cell can give `#VALUE!`. Found by reading, not reproduced.
  - Bug (low): the exported `tokenize`, `formatAddress` and `isRuleAst` have no guard and throw on malformed input from plain JavaScript.
  - Spec drift (low): `design.md` shows a `buildGraph` signature that the code does not have, and does not mention `circularComponents`.
  - Test gaps: row-major order among several range errors, Rule_Cell references through a name or range member and the "is a rule" wording, and `HERO` as an argument of a function with the wrong argument count.
  - It said it could not confirm the property-test run counts or read the generators, and read some test files only by search. It also reported `docs/BRIEF.md` as modified, with a new section 6a. I did not change that file, and I did not touch it.
  - None is fixed yet.

What changed because of it (time saved, bug caught, decision made):
- Decision: finding 2 was settled in the spec, because the edge is needed for correct ordering and the cost is only the known limitation. The finding was a real gap between the requirements and the behaviour, and the requirements were the part that was missing.
- Finding 1 shows the value of the earlier review: my own design note from the last round had claimed names like `M1` were refused, and the reviewer then showed they were not. The fix and the requirement now agree.
- The third review found a new bug in how the `HERO` edge is combined with the arity check. That edge is part of the decision in finding 2, so the new finding 1 is a follow-up to it.
- Save hook, from the Kiro output log (`Kiro Logs.log` of this window) after my edits: there are no lines with a `[hooks]` tag at all (0 matches across all Kiro logs). The hook lines that exist are `hooks.reload.loaded` entries. They show `read:0, registered:0` until 19:34:16, then `read:2, registered:2` at 19:34:16 and again at 21:28:59, so both hooks were loaded. There is also an early line, `hooks.v2.executionDisabledUntrustedWorkspace` at 14:01:18, from before the hooks were loaded. After the 21:28 reload the log has no entry that says a hook ran, for any of my `str_replace`, `fs_write` or `fs_append` edits. The log only shows `acp.policy-eval.complete` lines for those edits. So the log shows the hooks were registered, and it does not show the `PostFileSave` hook firing. I cannot tell from the log whether it ran silently or did not run.
- Nothing was committed.

## 2026-11-05 — Final engine round (third formula-reviewer review)

Surface: IDE

Features: agent, spec, pbt

What I asked for: Act on the six findings of the third formula-reviewer review, each code fix with a test that fails on the current code, and then freeze the engine for the jam with no fourth review. All edits through the IDE file-edit tools, nothing committed.

What Kiro did:
- Findings 1 and 6 (bug and test gap): in `graph.ts` the `HERO` position-only exemption now applies only when `ROW`, `COL` or `DIST` is called with its valid argument count. With a wrong count the evaluator reads every argument's Value, so `HERO` keeps its normal edge. Tests: the graph edges for `=ROW(HERO, 1)`, `=DIST(HERO)` and similar, the valid-count calls that stay exempt, and two recalculation tests where the hero's cell is on a cycle and `=ROW(HERO, 1)` and `=DIST(HERO)` give `#CYCLE!`. The formula sits at A1, before the hero's cell C3 in reading order, so it only gets the right answer if the edge orders it. Requirement 11.1 and the design text now say "valid argument count".
- Finding 2 (low bug): `tokenize` refuses a non-string or a hostile object with `Col 1: formula could not be read.`, the same text as `parseFormula`. `formatAddress` returns `""` for malformed input, including a non-integer row. `isRuleAst` returns `false` for a malformed tree. None of them throws any more. No return type changed, so `index.test.ts` needed no edit. Tests use `undefined`, `null`, a number, an empty object, a malformed object and an object whose getter throws.
- Finding 3 (spec drift): the dependency graph section of `design.md` has the real `buildGraph(cells, resolveName, heroIndex)` signature and the `GraphCell` type, and describes `circularComponents` (the circular components from the same Tarjan pass, used for the `#CYCLE!` cause text). The module list names the functions too.
- Finding 4 (test gap): two different non-cycle errors placed so that row-major and column-major order disagree (`#REF!` at B1 and `#DIV/0!` at A2 in `A1:B2`, and the reverse): the row-major first wins. A `#CYCLE!` member behind an earlier ordinary error gives `#CYCLE!`, for `SUM` and `MIN`.
- Finding 5 (test gap): a Rule_Cell read through a Range member (`=SUM(B14:B15)`) and through its Cell_Name (`=MOVE_M1`, `=MOVE_M1+1`) gives `#VALUE!`, and the cause contains `which is a rule`. The code already did this, so these two groups of tests (findings 4 and 5) pin existing behaviour and pass on the old code.
- Counts: `npm run verify` gives 22 test files and 444 tests passing (425 before, so 19 new), with typecheck and lint clean.
- Old-code check: I built a scratch copy of the project outside the repo, with the four changed source files (`graph.ts`, `tokenizer.ts`, `address.ts`, `ast.ts`) taken from the last commit. 10 tests failed there: the graph and recalculation tests for the wrong argument count, and the `tokenize`, `formatAddress` and `isRuleAst` tests. I deleted the copy. No repo file was swapped.

What changed because of it (time saved, bug caught, decision made):
- The formula-engine spec is closed after three review rounds. The rounds found 9, then 5, then 6 findings, and each round was smaller in scope. The first round found real defects in totality and in the spec. The second found a name-validation bug and spec gaps, and the third found one ordering bug in the `HERO` edge, a few unguarded helpers, and test gaps. The engine is frozen for the jam, and I did not run a fourth review.
- The third round's bug came out of the second round's decision. The `HERO` edge was added to the spec in round two, and round three found the case where its exemption and the argument-count check disagree. Known limitation kept in the design: `ROW(IF(c, HERO, B1))` still gets the edge.
- My tooling was flaky in this round: several scratch-copy attempts printed nothing, and one left a temporary folder that had to be removed. No repo file was lost. I checked the sources, `git status` and the test run afterwards.
- Nothing was committed.

## 2026-11-05 — BRIEF section 6a "Story and names" added outside Kiro

Surface: none

Features: none

What I asked for: Nothing. No Kiro session.

What Kiro did: Nothing. I drafted `docs/BRIEF.md` section 6a, "Story and names", by hand outside Kiro. It covers the Necronomicell rules panel, the sheet-tab level names, the death and win screen text, and one strings file. Kiro only noted in this log that the section exists.

What changed because of it (time saved, bug caught, decision made): The later specs (grid-ui, levels, skin-and-sound) take their text from section 6a, so it is the single source for names and screen text. It did not change the formula engine.

## 2026-11-05 — sheet-model Batches 2 and 3a: two parallel Crew runs

Surface: Crew

Features: spec

What I asked for: Run two Kiro Crew Task Runner tasks of the sheet-model spec at the same time, each on its own worktree. Run one was Batch 2: task 2.1 (`serializer.ts`) and task 2.2 (`testing/arbitraries.ts`), each with tests. Run two was tasks 3.1 to 3.3: the loader. 3.1 is the guard, error collector, shape, metadata, map and text loader, 3.2 adds the cell-spec checks and 3.3 adds the hero and monster checks. The loader tasks all edit `loader.ts` and `loader.test.ts`, so I kept them in one run in order, and kept them apart from the serializer and generator files that run one owns.

What Kiro did:
- Run one (Batch 2) was 2 steps, one per task, and built:
  - `serializer.ts` with `normalize`, `serializeLevel`, `serializeLevelText` and `tabLabel`, and its test file.
  - `testing/arbitraries.ts`, the seeded random source, the valid, invalid and mutated document generators, the JSON, string and deep-nesting generators, an independent `normalizeOracle` and `assertProperty`, with a smoke test.
- Run two (tasks 3.1 to 3.3) was 9 smaller steps, and built `loader.ts` and `loader.test.ts` in pieces: the guard, collector and error helpers (3.1a), `loadLevel` with the shape, metadata and map checks (3.1b), `loadLevelText` (3.1c), the 3.1 tests (3.1d), the cell-spec checks (3.2a), their tests (3.2b), `checkEntities` (3.3a) and its tests (3.3b). Step 6's code was committed together with step 7, so the history shows step commits 2, 3, 4, 5, 7, 8 and 9, and no separate one for step 6. There is also no commit for step 1 of this run.
- Both ran at the same time on separate worktrees. The step commits are interleaved in time: 2.2's commit came at 23:10:22, the loader's first piece at 23:11:48, and 2.1's commit at 23:13:28, and the loader steps went on until 23:26:28. The two sets of files were disjoint, so I merged them as two merges into `main`: the Batch 2 branch, then the loader branch (`d88c6b8` and `a7f9d1b`). No merge conflicts.
- Combined result in `main`: `npm run verify` gives 26 test files and 577 tests passing, with typecheck and lint clean. I ran it myself after both merges. I did not take a separate count for each run, so I cannot split the 577 between them.
- I ticked tasks 2.1, 2.2 and parent 2, and 3.1, 3.2 and 3.3, in `tasks.md`, and changed the labels on 3.1 to 3.3 from `[IDE]` to `[Crew]` to say where they ran. The Batch 3 row of the batch table says the same. Task 3.4 stays `[IDE]` and is next.

What changed because of it (time saved, bug caught, decision made):
- Time: two runs went side by side and finished in the span of about twenty minutes of step commits, and the main checkout stayed free until I merged.
- Decision: the plan had Batch 3 as IDE-only because the four loader tasks share two files. Running 3.1 to 3.3 as one ordered Crew run kept that rule, since the sequence was inside one run, and still used Crew. The cost is that the loader grew in nine commits in a branch that I only saw once it was done. 3.4 stays in the IDE.
- Attribution: the step commits of both runs carry my git identity, not a separate "Kiro Crew" author, unlike the formula-engine Batch 3 to 5 runs. This entry is the record that Crew made them. I have not found out why the author setting did not apply here.
- Crew's own per-step verification is not what I rely on. I re-ran the combined suite myself.

## 2026-11-05 — sheet-model task 3.4 (sheet construction, placement, final result) run in the IDE

Surface: IDE

Features: spec

What I asked for: Run task 3.4 of the sheet-model spec after the two Crew runs were merged: build the engine Sheet, run the placement checks on computed Values, and return the final Level.

What Kiro did:
- `loader.ts`: added `buildSheet` (`createSheet`, the 144 map cells, every Cell_Spec, the names, then one `recalculate` with the hero start and the caller's `RandomSource`; any refusal becomes `engine-refused` with the engine's reason and no Sheet), `checkPlacement` (hero must hold `.`, `X` or `^`, monsters must hold `.`, then each named Rules_Panel cell's label must be a non-empty string), and the finish (`normalize`, a deep freeze, then `{ ok: true, level, sheet }`). Both new functions run only when no earlier error exists, with no note about the skipped checks. The stub that returned `internal-error` for every valid document is gone.
- Messages follow the spec: `hero start A1 is a wall (#)`, `hero start B2 is #DIV/0!`, `monster M1 at C4 is "X", but monsters start on floor (.)`.
- `loader.test.ts`: 32 new tests. They cover valid loads, hero on wall, error, number, floor, exit and trap, monster on exit, trap, wall and error cell, order (hero, then monsters, then labels), the skip rules, two loads giving independent Sheets with equal Values, the supplied Random_Source, a frozen and normalized Level that shares nothing with the input and holds no Sheet, `ink: 0`, and `engine-refused` through `vi.spyOn` on `setRawText`, `setCellName` and `recalculate` (restored after each test), plus an engine exception giving one `internal-error`. One 3.1-era test, "accepts all four glyphs", relied on every document failing because the build stage was missing. It now accepts a successful load.
- Result: `npm run verify` gives 26 test files and 609 tests passing (577 before, so 32 new), with typecheck and lint clean. I ticked 3.4 in `tasks.md`.
- Not done: I did not run the new tests against the previous loader in a scratch copy this time. The previous loader returned `internal-error` for every valid document, so every "loads" test would fail on it by reading the code, but I did not run that.

What changed because of it (time saved, bug caught, decision made):
- Spec conflict found, not settled: the task text and the design's test list expect labels with raw `=2+3`, `=1=1`, `=1/0` and `=""` to give `bad-label-value`. Requirement 5.11 and the 3.2 code refuse any label that starts with `=` as `missing-label` first, and placement checks are skipped after that. So through the public loader `bad-label-value` can only be reached with a numeric literal label such as `5`. I followed the requirements: the loader tests assert `missing-label` for the four formula labels, and `checkPlacement` is tested directly, with a hand-built Sheet, for the number, boolean, error and empty-string Values. Whether Requirement 5.14 should say "numeric literal" or 5.11 should allow formula labels is for the spec owner to decide; the generator's `label-number-formula` fault still produces an invalid document either way, so the property tests are not affected.
- `buildSheet` and `checkPlacement` are exported from `loader.ts` for testing. They are not part of the public barrel, which task 5.1 will define.
- Nothing was committed.

## 2026-11-06 — sheet-model label rule settled (Web surface)

Surface: Web

Features: spec

What I asked for: Settle the conflict that the task 3.4 entry above left open: the task text and the design's test list expected formula labels (`=2+3`, `=1=1`, `=1/0`, `=""`) to give `bad-label-value`, while Requirement 5.11 refuses any label starting with `=` as `missing-label` first. The rule is that labels are plain text. A docs-only change, with nothing under `src/` touched.

What Kiro did:
- `requirements.md`: Requirement 5.11 stays as it was. Requirement 5.14 now applies only when the label literal reads as a number (for example `5` or `1e3`), checked on the computed Value after recalculation.
- `design.md`: the error-code table row, the post-recalculation step, the generator's label fault and the test list now say the same, and the formula-label examples are gone from the `bad-label-value` cases.
- `tasks.md`: the task 3.4 text is updated the same way. No checkbox changed.
- The change was made with Kiro Web and opened as a pull request.

What changed because of it (time saved, bug caught, decision made):
- Decision: labels are plain text. 5.11 stays, and 5.14 now covers numeric literals only, so the two criteria no longer overlap.
- No code changed. The loader tests from the 3.4 run already followed this reading (`missing-label` for the four formula labels, `bad-label-value` for numeric literals such as `5` and `-2.5`), so the specs now match the tests.
