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
