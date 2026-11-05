---
inclusion: always
---

# Grimsheet: Tech

## Stack
- TypeScript (strict), Vite, no UI framework. The grid is a DOM table; CSS for the chrome.
- Node 22+.
- Formula engine: hand-written tokenizer, recursive-descent parser to an AST, evaluator over a dependency graph.
- Static site hosting. No backend, no API keys, no AI calls at run time.
- Written from scratch; share no code with other projects.

## Hard rules
- Never use `eval` or `new Function`.
- The engine is DOM-free so it runs in tests and in a headless solver.
- Evaluation never throws; every cell ends as a value or an error.
- All randomness comes from the level's seeded generator (`RAND()`). Same seed, same game. No `Math.random` in
  game logic.
- Pin exact dependency versions (no `^` or `~` ranges).
- Fonts must be open-licensed and self-hosted. Sound is generated with Web Audio in code; no sound files.

## Testing
- Vitest for unit tests, fast-check for property-based tests, Playwright for end-to-end.
- Properties to cover: parse-print-parse is stable; recalculation is independent of definition order; evaluation is
  total; same seed gives same game; hero never stands on a blocking cell; level JSON round-trip is identity.
- A solver test proves every level is winnable within its ink and HP.

## Scripts
`npm run dev`, `npm test`, `npm run build`, `npm run e2e`. Use `vitest --run` for single runs, never watch mode,
in automated contexts.
