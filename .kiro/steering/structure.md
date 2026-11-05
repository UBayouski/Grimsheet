---
inclusion: always
---

# Grimsheet: Structure

## Layout
```
docs/            BRIEF.md and other documents
.kiro/           steering, specs, hooks, settings, agents
src/engine/      formula engine: tokenizer, parser, AST, printer, evaluator, dependency graph (DOM-free)
src/model/       cell and level types, level JSON schema, loader
src/game/        turns, movement, monsters, damage, traps, haunting, ink, undo, seeded RNG (DOM-free)
src/ui/          grid table, formula bar, status bar, screens, audio
src/levels/      the five level JSON files
src/styles/      CSS
tests/           e2e (Playwright) and solver tests
public/          self-hosted fonts and sprites
```
Unit and property tests sit next to the source as `*.test.ts` and `*.prop.test.ts`.

## Dependency direction
`ui` -> `game` -> `model` -> `engine`. Lower layers never import from higher ones. Only `src/ui/` touches the DOM,
`localStorage` or Web Audio.

## Naming
- Files: `kebab-case.ts`. Types and classes: `PascalCase`. Functions and variables: `camelCase`.
- Cell names in levels: `UPPER_SNAKE_CASE`, unique per level.
- Level files: `NN-slug.json`, for example `01-the-corridor.json`.
- Specs are named as in the brief: `formula-engine`, `sheet-model`, `game-rules`, `grid-ui`, `error-monsters`,
  `levels`, `skin-and-sound`, `hosting`.
- Use named exports. Keep the engine's public API in `src/engine/index.ts`.

## Docs
`docs/BRIEF.md` is the input to Kiro. Update it when scope changes. Log Kiro usage in `KIRO_USAGE.md`.
