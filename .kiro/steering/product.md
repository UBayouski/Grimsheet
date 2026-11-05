---
inclusion: always
---

# Grimsheet: Product

Grimsheet is a roguelike where the whole dungeon is a spreadsheet and you survive by editing formulas.
Tagline: **A roguelike where every monster is a formula.**
Kiroween 2026, category Frankenstein. Deadline Dec 4, 2026, 2:00 PM PT. Source of truth: `docs/BRIEF.md`.

## Core idea
Every rule (monster movement, damage, doors) is an ordinary formula in a readable cell. The player wins by
rewriting rules. Errors are not messages; they are the monsters.

## Model
- Sheet: columns `A` to `L`, rows `1` to `20`. Map area rows 1-12 (cell value = terrain glyph). Rules panel rows
  14-20: named cells holding rules and stats, each with a text label in the cell to its left.
- Cell: address, optional formula, computed value, `locked` (read-only to player), optional unique upper-case `name`
  (`HP`, `KEY`, `MOVE_M1`).
- Value: number, string, boolean, or error (`#REF!`, `#NAME?`, `#DIV/0!`, `#VALUE!`, `#CYCLE!`).
- Terrain: `#` wall, `.` floor, `X` exit, `^` trap. Any other value, including any error, blocks movement.
- Entities are not cell values. Hero `@` (position only, read via `HERO`). Monster `M` (id, position, `move` rule,
  `atk` rule, each naming a rules-panel cell).
- Level: id, title, hint, cells, hero start, monsters, starting `HP`, ink budget, RNG seed. One JSON document per
  level; round-trip must be lossless.
- Run state: level, sheet, entities, HP, ink, turn, one-step undo snapshot. Progress persists in localStorage.

## Turn order
1. Player acts: arrow-key move, Space to wait, or commit a formula edit (1 ink).
2. A move succeeds only onto a walkable cell (`.`, `X`, `^`) with no monster.
3. Recalculate.
4. Each monster in reading order evaluates `move` with `SELF` bound. `"N"|"S"|"E"|"W"` moves one cell if floor and
   empty; anything else (including errors) stays. Then `atk`: a positive number is subtracted from `HP`.
5. Hero on `^` loses the value of the `TRAP` cell.
6. While any `#CYCLE!` exists the sheet is haunted: hero loses 1 HP.
7. Recalculate. Hero on `X` wins; `HP <= 0` loses.

## Editing
- Locked cells show a padlock and cannot be edited.
- Committing a changed formula on an unlocked cell costs 1 ink. No ink, no edits. Refused parse errors cost nothing.
- One-step undo reverts the last turn or edit and refunds ink.

## Errors are monsters
`#REF!` coffin, `#NAME?` tombstone, `#DIV/0!` crack into the void, `#VALUE!` wilted grey cell: all block movement.
`#CYCLE!` is a ghost that haunts for 1 HP per turn. Hovering an error explains its cause in plain English.
Breaking a monster's rule is a legal strategy.

## Levels
Five hand-written JSON levels: The Corridor, The Chaser, The Locked Crypt, The Trap Row, The Lich. Each must be
winnable within its ink and HP, proven by an automated solver test.

## Non-goals
Spreadsheet compatibility or xlsx/csv import, level editor, user levels, multiplayer, accounts, leaderboards,
procedural generation, dedicated mobile play (keyboard and mouse game).
