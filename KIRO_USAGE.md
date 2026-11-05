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
