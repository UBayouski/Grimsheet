# Requirements Document

## Introduction

The Levels_Module is the content layer of Grimsheet. It lives under `src/levels/` and holds the five hand-written Level_Files of `docs/BRIEF.md` section 7 (The Corridor, The Chaser, The Locked Crypt, The Trap Row, The Lich) the barrel `src/levels/index.ts` that hands them to `src/main.ts`, and the shared test helper `src/levels/helpers.ts`. It is the sixth spec in `docs/BRIEF.md` section 12. It adds data, tests and one non-test helper file only. It changes no rule of the Formula_Engine, the Sheet_Model or the Game_Module, and it does no UI work.

Every level teaches one idea, and every level is proven winnable by replaying a stored Solution_File through the public Game_Module API. Levels 2 to 5 are also proven unwinnable by walking alone, using an exhaustive Edit_Free_Search. Together these two proofs express "tight but fair": the player must edit, and the stored edits are enough.

### What exists in the repository today

Checked before writing this document:

- Finished and importable through barrels: `src/engine/index.ts` (including `formatValue`), `src/model/index.ts` (`loadLevelText`, `serializeLevelText`, `tabLabel`) and `src/game/index.ts` (`startRun`, `applyAction`, `createRandom`, `cellValue`, `cellRawText`, `isCellLocked`, `cellName`, the `Action` type).
- Partly present: `src/ui/` holds pure helpers and tests, but no `app.ts` and no `index.ts`, so `mountApp` does not exist yet.
- Absent: `src/levels/`, `tests/solutions/`, `src/stub-levels.ts`, `.gitattributes`. `src/main.ts` is still the title-only entry and does not call `mountApp`. The grid-ui tasks that create the stub list (4.2) and wire `main.ts` (5.2) are not done.
- `core.autocrlf` is `true` in the local git config and no `.gitattributes` exists, so a Windows checkout can rewrite `\n` to `\r\n` in JSON files.
- `vite.config.ts` collects tests only from `src/**/*.test.ts` in a Node environment. A test file under `tests/solutions/` would never run.

### Property-based testing

Property-based testing is not enabled for any requirement of this spec. The input set is five fixed documents and five fixed action lists, so there is nothing to generate. The proofs are exhaustive instead: a replay of a known solution, and a complete search of the edit-free state space. The round-trip and totality properties of the Loader are already covered by generated documents in `sheet-model`, and determinism and undo properties by generated runs in `game-rules`.

### Decisions

Items 1 to 12 and 14 to 19 are Confirmed by the user. Item 13 is drafted for review. The design builds on every item unless the user changes it.

1. **Index and main.ts.** (Confirmed) `src/levels/index.ts` belongs to this spec. It exports `LEVELS: readonly unknown[]` and `src/main.ts` imports it, as the grid-ui spec states (Decision 3 there). The `main.ts` change is Requirement 14 and waits for grid-ui task 5.2.
2. **Stub list.** (Confirmed) `src/stub-levels.ts` is deleted and its assertions are removed from `src/ui/fixture-levels.test.ts`. `tests/fixtures/levels.ts` stays, because the grid-ui Playwright flows and unit tests need a small controlled list that is not shipped.
3. **Test location.** (Confirmed) Vitest collects only `src/**/*.test.ts`. All level tests therefore sit in `src/levels/`, and they read the data files under `tests/solutions/` with `node:fs`. The Solution_Files stay in `tests/solutions/` as the brief and the layout steering name that folder.
4. **Solution format.** (Confirmed) One JSON object per level, `tests/solutions/NN-slug.json`, shaped `{ "levelId", "minimalInk", "actions" }`. The `actions` array holds Actions of the Game_Module (`move`, `wait`, `edit`). It holds no `undo`. A bare array is rejected because `minimalInk` has to live with the actions.
5. **Line endings.** (Confirmed) Add a `.gitattributes` with `src/levels/*.json text eol=lf` and `tests/solutions/*.json text eol=lf`. The normalized-text test stays strict and does not tolerate `\r`. Tolerance would hide the very drift that the test exists to catch.
6. **RAND policy.** (Confirmed) No raw text in any of the five levels uses `RAND`. Solutions are then identical for every seed, and each level still gets a fixed seed equal to its number.
7. **Locking policy.** (Confirmed) All 144 Map_Area cells and all panel labels are locked. Only the Editable_Cells named in Requirements 4 to 8 are unlocked. Without this, a player could type `.` over any wall or over the door of level 3 for one ink and skip the puzzle. The Sheet_Model cap of 240 Cell_Specs is enough (144 map cells plus at most 24 panel cells).
8. **Edit-free search.** (Confirmed) The search is a breadth-first search over `move` and `wait` only. The expected outcome is exhaustion of the frontier, which is a complete proof for edit-free play. A depth limit of 100 turns and a state cap of 1,000 distinct states exist only as safety nets, and hitting either one fails the test as inconclusive (Requirement 11, Decision 14). The statement is deliberately limited to edit-free play. It does not say a level is unwinnable with edits.
9. **Ink assertions.** (Confirmed) `minimalInk` is the stored solution's cost. The Solution_File records it. The level `ink` equals `minimalInk` or `minimalInk` plus 1. The spec does not claim that `minimalInk` is a global minimum. For example, `RUNE_SALT` set to `167.125` makes `KEY` exactly 1337 (8 x 167.125 is exact in binary) with 1 ink, and `RUNE_ASH` set to `=1337/RUNE_SALT` (the stored solution of level 3, revised after the Playtester finding of Requirement 6) does the same. Such routes are accepted as legal clever strategies (Decision 17).
10. **Level 1 ink.** (Confirmed) Level 1 has ink 0. Every cell is locked, so any ink would be dead weight. Level 1 teaches reading, not editing.
11. **Level 5 structure.** (Confirmed, revised) The Lich is a real monster, because its `atk` rule reads `LICH_HP`. Its attack is distance-gated and `DIST` is the Manhattan distance (formula-engine Requirement 9, criterion 13): the absolute row difference plus the absolute column difference. The Lich attacks at `DIST(HERO,SELF)<=2` and chases at `DIST(HERO,SELF)<4`. It starts asleep, at `DIST` 7 from the hero on a straight line of floor, so the first three moves toward it (distance 6, 5, 4) keep it asleep. The exit is a locked map cell gated on `LICH_HP`. The cycle is a separate pair of panel cells. The puzzle is to rewrite `LICH_HP` while the Lich is far, then break the cycle.
    - Haunting arithmetic: the cycle costs 1 HP on every accepted turn that ends with it present, walking turns included (game-rules Requirement 8, criterion 3). The stored solution edits `LICH_HP` on turn 1 (cycle present, 1 HP) and `HEX_B` on turn 2 (cycle removed at step 3, 0 HP), so it has 1 haunting turn. The exit route is at least 6 moves, so a player who never breaks the cycle pays 1 + 6 = 7 HP and cannot arrive alive with `startingHp` 6.
    - `startingHp` is 6: it covers the 1 haunting turn of the stored solution with a margin of 4 more haunted turns. Walking 4 moves toward the Lich costs 4 haunting HP and leaves 2, so the haunting alone does not kill the variant of Requirement 8, criterion 6. The Lich's hit of 4 does.
    - The chase range is `<4`, not `<5`, because with `<5` the Lich wakes after the second move from distance 7.
12. **Numbers.** (Confirmed) HP and ink in Requirements 4 to 8 are starting points. The design may adjust map geometry and the HP of levels 1 to 4, but must keep the Edit_Free_Search proof and the `minimalInk` rules. The level 5 numbers of item 11 are fixed unless the user changes them.
13. **Hints.** (Drafted) Each hint names the cell or idea to look at, in the short dry voice of `docs/BRIEF.md` section 6a, because the UI has no dependency view. The example texts under Requirement 2 are examples, and the design may reword them if the named cells stay and the length limit holds.
14. **Search limits.** (Confirmed) The safety limits of the Edit_Free_Search are 100 turns of depth and 1,000 distinct states. The measured need is at most 14 turns and 172 states. At about 1 ms per Action, the old limits of 400 turns and 20,000 states would take over 80 s to fail.
15. **No wall-clock assertions.** (Confirmed) No test asserts elapsed time. The search tests carry a Vitest timeout of 60_000 ms, and the limits of Decision 14 bound the work. The design-time size guidance becomes a testable rule: a level with a monster has at most 60 Walkable_Cells in its Map_Area at load (Requirement 11, criterion 4).
16. **Helper location.** (Confirmed) The shared test helper is the non-test file `src/levels/helpers.ts`, not a file under `tests/`. Only test files import it, so it cannot reach the production bundle (Requirements 1 and 15).
17. **Level 3 one-edit routes.** (Confirmed, revised) The fractional-rune route (`RUNE_SALT` = 167.125) and the formula routes (`RUNE_ASH` = `=1337/RUNE_SALT`, `RUNE_SALT` = `=1337/RUNE_ASH`) are legal clever strategies. The Playtester finding at commit bea7a52 made `RUNE_ASH` = `=1337/RUNE_SALT` the stored solution, with `minimalInk` 1 (Requirement 6, criterion 3). The two-edit route 7 and 191 still wins and is the slack route.
18. **State_Key.** (Confirmed) The State_Key is the exact joined text of the 240 cell values, not a hash (see the glossary).
19. **main.ts swap.** (Confirmed) The change to `src/main.ts` (Requirement 14) waits for grid-ui tasks 4.2 and 5.2.

### Gaps between the BRIEF and the finished APIs

These are listed, not silently decided.

1. **Rule cells show as rules.** The Formula_Engine gives a cell that contains `SELF` or `TOWARD` the Rule_Value kind, which the UI shows as the formula. Such a cell is never a terrain glyph and no other formula may read it (the read is `#VALUE!`). So `SELF` and `TOWARD` appear only in monster `move` and `atk` cells, and the gate formulas of levels 3, 4 and 5 use only `HERO`, names and plain operators.
2. **The player cannot see a dependency graph.** BRIEF 7 says the player "works out which cells feed KEY". No dependency highlight exists in the UI. The player learns this by reading the door formula, then the `KEY` formula, in the formula bar, and by the hint. This spec adds no UI help.
3. **Gating the exit.** Only a map-cell formula can gate `X`. In level 5 the exit cell has the formula `=IF(LICH_HP<=0,"X","#")`. Its Value is the string `#` (a wall) until `LICH_HP` is 0 or below, then the string `X`. The terrain rule makes this legal: only the Value matters, and the hero never starts on that cell.
4. **Normalization of formula cells.** The Normalized_Document writes `.` into `map` for a formula cell and keeps the formula in `cells`. The exit cell of level 5 and the door of level 3 therefore show `.` in the `map` text. A reader of the JSON must read `cells` to see them.
5. **Haunting cost depends on timing.** Haunting costs 1 HP on every turn that ends with a cycle, walking turns included. An edit that removes the last cycle causes no haunting damage in the same turn (game-rules 8.3). The HP budget of level 5 relies on both facts: its stored solution has exactly 1 haunting turn (Decision 11).
6. **Search cost is unmeasured.** The Game_Module builds a fresh Sheet for every accepted Action (game-rules Decision 19), at about 1 ms per Action. The design measured the five levels: at most 14 turns and 172 distinct states. The search is bounded by its limits and by a size rule, not by a clock (Decision 15, Requirement 11, criterion 4).
7. **Order of test inputs.** `loadLevelText` takes a Random_Source. The Levels_Module tests use `createRandom` from the Game_Module barrel with the level seed, as `startRun` does.
8. **`.gitattributes` is repository-wide config.** Adding the file is outside `src/levels/`. It is listed here because the strict byte test would otherwise fail on some machines.
9. **grid-ui is not finished.** The stub list and `mountApp` do not exist, so Requirement 14 is blocked until grid-ui tasks 4.2 and 5.2 land (Decision 19).

## Glossary

- **Levels_Module**: The directory `src/levels/` with its Level_Files, `index.ts`, `helpers.ts` and its test files.
- **Level_File**: One of the five JSON files `01-the-corridor.json`, `02-the-chaser.json`, `03-the-locked-crypt.json`, `04-the-trap-row.json`, `05-the-lich.json` in `src/levels/`.
- **Levels_Index**: The file `src/levels/index.ts`.
- **Level_Text**: The exact characters of a Level_File.
- **Level_Document**, **Level**, **Normalized_Document**, **Tab_Label**, **Rules_Panel**, **Map_Area**, **Panel_Label**, **Cell_Name**, **Rule_Name**, **Locked_Flag**, **Walkable_Cell**, **Floor_Cell**: As defined in the sheet-model spec.
- **Loader**: The Sheet_Model functions `loadLevel` and `loadLevelText`.
- **Serializer_Text**: The Sheet_Model function `serializeLevelText`.
- **Game_Module**: The finished module under `src/game/`, used only through `src/game/index.ts`.
- **Run_State**, **Action**, **Action_Result**, **Refusal**, **Status**, **Damage_Log**: As defined in the game-rules spec.
- **Rule_Value**: The Value kind that the Formula_Engine gives to a cell that contains `SELF` or calls `TOWARD`.
- **Editable_Cell**: A Cell without the Locked_Flag whose Address the requirement for its level lists, or whose Cell_Name that requirement lists.
- **Solution_File**: A file `tests/solutions/NN-slug.json` with the fields `levelId`, `minimalInk` and `actions`.
- **Solution_Replay**: The test procedure that calls `startRun` on a Level_Document and then `applyAction` for each Action of its Solution_File, in order.
- **minimalInk**: The number of `edit` Actions in a Solution_File. It is the ink that the stored solution spends, not a proven global minimum.
- **Loss_Variant**: The action list of Requirement 8, criterion 6, defined as data inside the test and not stored as a Solution_File.
- **Levels_Helpers**: The non-test file `src/levels/helpers.ts`. It holds the shared test functions (file reading, replay, snapshot, State_Key, Edit_Free_Search). Only test files import it.
- **Edit_Free_Search**: The breadth-first search of Requirement 11 over `move` and `wait` Actions only.
- **State_Key**: The text that the Edit_Free_Search builds from the public read API of a Run_State to detect repeated states: `hero`, the list of `(id, at)` of the monsters, `hp`, `ink`, `status` and the kind and `formatValue` text of the Value of all 240 Cells joined in reading order. It is the exact text, not a hash, because a hash could collide and make the unwinnable proof unsound. It excludes `turn`.
- **Final_Snapshot**: The tuple of `hero`, `monsters`, `hp`, `ink`, `turn`, `status`, the raw text of all 240 Cells and the Value of all 240 Cells, all read through the public read API.
- **Deny_List**: The list of AI tool names other than Kiro and of real product names or trademarks that the scan test assembles from fragments, so that the test file does not contain them itself.

## Requirements

### Requirement 1: Files and Index

**User Story:** As the developer of the UI entry point, I want one barrel that hands over the five levels in order, so that `main.ts` needs no knowledge of the files.

#### Acceptance Criteria

1. THE Levels_Module SHALL contain, besides files named `*.test.ts`, exactly these files: the five Level_Files, `index.ts` and `helpers.ts`, with no subdirectories.
2. THE Levels_Index SHALL export `LEVELS` with the type `readonly unknown[]` as its only export, as a named export and with no default export, holding the five Level_Documents in the numeric order of the file names.
3. THE Levels_Index SHALL import exactly the five Level_Files and no other module, so that its content is data and not behaviour.
4. WHEN `LEVELS` is compared with `JSON.parse` of each Level_Text, THE Levels_Module test suite SHALL find each element deep-equal to the parsed text of the file at the same position.

### Requirement 2: Loadable and Normalized Levels

**User Story:** As a developer, I want every level file to be valid, normalized and correctly named, so that a hand edit that breaks the format fails a test and not a player.

#### Acceptance Criteria

1. WHEN the Loader reads the Level_Text of each Level_File using a Random_Source from `createRandom` seeded with the `seed` field of that file, THE Loader SHALL return `ok: true`, and WHEN `startRun` receives the parsed document, THE Game_Module SHALL return `ok: true` with Status `playing`, `hp` equal to `startingHp` and `ink` equal to the document `ink`.
2. THE Level_Text of each Level_File SHALL equal the Serializer_Text of its own loaded Level character for character, so that each file is its own Normalized_Document with two-space indentation, `\n` line endings and one trailing newline, and SHALL contain no `\r` and no byte order mark.
3. THE repository SHALL contain a `.gitattributes` file with the lines `src/levels/*.json text eol=lf` and `tests/solutions/*.json text eol=lf`, so that a checkout with `core.autocrlf` set to `true` leaves the bytes of both folders unchanged.
4. THE `id` of each Level_File SHALL equal its file name without `.json`, the two-digit prefix SHALL equal the position of the file in `LEVELS` counted from 1, the five ids SHALL be unique, and the Tab_Labels SHALL be `Sheet1: The Corridor`, `Sheet2: The Chaser`, `Sheet3: The Locked Crypt`, `Sheet4: The Trap Row` and `Sheet5: The Lich`, which are distinct.
5. THE `hint` of each level SHALL be 1 to 120 characters on one line, in the short dry voice of `docs/BRIEF.md` section 6a, and every Panel_Label SHALL be 1 to 24 characters, and the test SHALL check by substring that the `hint` of level 1 contains `DIST_TO_EXIT` and, compared case-insensitively, `rules panel`, of level 2 contains `MOVE_M1`, of level 3 contains `KEY` and at least one of `RUNE_ASH` and `RUNE_SALT`, of level 4 contains `#DIV/0!` and `RATIO`, and of level 5 contains `LICH_HP` and at least one of `HEX_A` and `HEX_B`, so that each hint names the cell or idea to look at, because the UI has no dependency view.

Example hints (example, the design may reword; each is one line of at most 120 characters):

- Level 1: "Walk east. The rules panel counts the steps in DIST_TO_EXIT. Someone has to."
- Level 2: "MOVE_M1 decides who gets chased. It is only text."
- Level 3: "The door asks KEY a question. Read what feeds KEY: RUNE_ASH, RUNE_SALT. Not every rune is on the payroll."
- Level 4: "The #DIV/0! cell is a hole. Follow RATIO back to its cause. Traps bite."
- Level 5: "LICH_HP is just a number. Change it while he is far. HEX_A and HEX_B haunt the sheet."

### Requirement 3: Rules Shared by All Levels

**User Story:** As a level author, I want the same ground rules in every level, so that the player can only change what the level intends.

#### Acceptance Criteria

1. THE Levels_Module test suite SHALL verify for each level that every Map_Area cell and every Panel_Label cell has the Locked_Flag, and that the Cell_Names of the cells without the Locked_Flag are exactly the Editable_Cells listed for that level in Requirements 4 to 8.
2. THE raw text of every cell of every Level_File SHALL contain no `RAND`, compared case-insensitively, and the `seed` of level N SHALL be the integer N, so that every Solution_File gives the same result for any seed.
3. THE five levels SHALL contain this many monsters in this order: level 1 none, level 2 one, level 3 none, level 4 none, level 5 one, where each monster has the id `M1`, the `move` rule `MOVE_M1` and the `atk` rule `ATK_M1`, and each level SHALL hold at least one exit, which is a Map_Area cell with the Value `X` at load for levels 1 to 4 and the gate cell of Requirement 8 for level 5.

### Requirement 4: Level 1, The Corridor

**User Story:** As a new player, I want a first level with nothing to fear, so that I learn to move, to reach the exit and to read a formula.

#### Acceptance Criteria

1. THE level SHALL have `startingHp` 3, `ink` 0, no monsters, no Editable_Cell, a hero start at the west end of a corridor one cell wide and an `X` at the east end, and a hint that follows Requirement 2, criterion 5
2. THE Rules_Panel SHALL hold one locked named cell `DIST_TO_EXIT` with a Panel_Label and the formula `=DIST(HERO,<Address of the X>)`, so that the player reads a live formula whose Value falls by 1 with each step.

### Requirement 5: Level 2, The Chaser

**User Story:** As a player, I want a monster whose rule I can read and change, so that I learn that I can survive by rewriting it.

#### Acceptance Criteria

1. THE level SHALL have `startingHp` 3 and `ink` 2, one monster `M1` on a Floor_Cell, `MOVE_M1` with the raw text `=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")` and `ATK_M1` with a formula that returns 2 when `DIST(HERO,SELF)<2` and 0 otherwise, and the Editable_Cells SHALL be `MOVE_M1` and `ATK_M1`.
2. THE map SHALL be an open room in which the exit lies behind the starting cell of `M1` and in which a route to the exit exists that keeps a distance of at least 2 from that starting cell, and a hit of 2 against 3 HP SHALL allow one hit and not two, so that walking past the awake monster fails the Edit_Free_Search.
3. THE solution idea SHALL be one edit that lowers the range in `MOVE_M1` (for example from `<4` to `<1`) so that the monster stays where it is, followed by a walk that keeps a distance of at least 2 from it, with `minimalInk` 1.

### Requirement 6: Level 3, The Locked Crypt

**User Story:** As a player, I want a door that depends on a number I can trace, so that I learn that one formula can feed another.

#### Acceptance Criteria

1. THE level SHALL have `startingHp` 3, `ink` 2 and no monsters, a locked door cell on the only route to the exit with the raw text `=IF(KEY=1337,".","#")`, and a locked named cell `KEY` with the raw text `=RUNE_ASH*RUNE_SALT`, so that the door is a wall at load.
2. THE Rules_Panel SHALL hold the named cells `RUNE_ASH` with the raw text `8`, `RUNE_SALT` with the raw text `190` and `RUNE_DUST` with a number that `KEY` does not read, each with a Panel_Label, and the Editable_Cells SHALL be exactly these three.
3. THE solution idea SHALL be one formula edit, `RUNE_ASH` (B14) set to `=1337/RUNE_SALT`, so that `KEY` is exactly 1337 and the door becomes floor, with `minimalInk` 1, and `RUNE_DUST` SHALL be a decoy that changes nothing. The two-edit route, `RUNE_ASH` to `7` and `RUNE_SALT` to `191`, still wins within the level's `ink` of 2 and is the slack route. Reason (revised): the Grimsheet Playtester, a Kiro Crew app that hunts for exploits headlessly, confirmed twice on `main` at commit bea7a52 that the level is won with 1 ink by editing `RUNE_ASH` to `=1337/RUNE_SALT` (or `RUNE_SALT` to `=1337/RUNE_ASH`) and walking east 9 times. A door that checks one equation can always be met with one formula edit, so the spec keeps the trick and makes it the official solution instead of patching it.

### Requirement 7: Level 4, The Trap Row

**User Story:** As a player, I want a blocked path next to a deadly shortcut, so that I learn to read an error back to its cause.

#### Acceptance Criteria

1. THE level SHALL have `startingHp` 5 and `ink` 1, no monsters, a locked named cell `TRAP` with the raw text `3`, and a band two columns wide of `^` cells across the whole map, so that crossing the band over traps costs 6 HP and the hero dies, and one step onto a trap costs 3 HP and the hero lives.
2. THE band SHALL have one gap row whose first cell is a locked formula cell `=IF(RATIO>=0,".","#")` and whose second cell is floor, and the Rules_Panel SHALL hold the locked named cell `RATIO` with the raw text `=LOAD/DIVISOR` and the named cells `LOAD` with the raw text `6` and `DIVISOR` with the raw text `0`, so that the gap cell shows `#DIV/0!` at load, and the Editable_Cells SHALL be exactly `LOAD` and `DIVISOR`.
3. THE solution idea SHALL be one edit of `DIVISOR` to `1`, followed by a straight walk through the gap row, with `minimalInk` 1, and `LOAD` SHALL be a decoy because an edit of `LOAD` leaves `RATIO` at `#DIV/0!`.

### Requirement 8: Level 5, The Lich

**User Story:** As a player, I want a last level that combines rewriting a stat and breaking a curse, so that I use everything I learned in the right order.

#### Acceptance Criteria

1. THE level SHALL have `startingHp` 6 and `ink` 2, and one monster `M1` that starts asleep, at a `DIST` (Manhattan distance, the absolute row difference plus the absolute column difference) of exactly 7 from the hero start on a straight line of Floor_Cells, with `MOVE_M1` locked with the raw text `=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")` and `ATK_M1` locked with the raw text `=IF(DIST(HERO,SELF)<=2,LICH_HP,0)`, and the shortest walkable route from the hero start to the gate cell SHALL be at least 6 moves, so that the haunting arithmetic of Decision 11 holds: the stored solution has 1 haunting turn and a player who never breaks the cycle loses 7 HP against 6.
2. THE exit SHALL be a locked Map_Area gate cell with the raw text `=IF(LICH_HP<=0,"X","#")`, and the Rules_Panel SHALL hold the unlocked named cell `LICH_HP` with the raw text `=MAX(1,PHYLACTERY)` and the locked named cell `PHYLACTERY` with the raw text `4`, so that `LICH_HP` is 4 and the gate shows `#` at load and `LICH_HP` can never reach 0 until the player rewrites it.
3. THE Rules_Panel SHALL hold the unlocked named cells `HEX_A` with the raw text `=HEX_B+1` and `HEX_B` with the raw text `=HEX_A+1`, so that both show `#CYCLE!` at load and haunt the room, and the Editable_Cells of the level SHALL be exactly `LICH_HP`, `HEX_A` and `HEX_B`.
4. THE solution idea SHALL be an edit of `LICH_HP` to `0` as the first Action, applied while `DIST` between the hero and `M1` is 7, which makes the Lich's hit 0 and opens the gate, then an edit of `HEX_B` to `0` as the second Action, which ends the haunting without damage in that turn, then a walk to the exit, with `minimalInk` 2, exactly 1 haunting turn (turn 1), and a final `hp` of 5 (6 minus 1 haunting turn), and the test SHALL check that the `LICH_HP` edit is accepted while `DIST` between the hero and `M1` is greater than 2.
5. WHEN the first three moves from the start toward `M1` along the line are applied, THE Game_Module SHALL accept each move, keep Status `playing`, leave `M1` on its start Address, give each Damage_Log only `haunt` entries of amount 1, and leave `hp` at 3, which is `startingHp` minus the 3 haunting turns, because `DIST` is 6, 5 and 4 and `M1` stays asleep.
6. WHEN the Loss_Variant runs, which the test SHALL define as data: 4 moves toward `M1` along the line, then the `edit` of `LICH_HP` to `0`, then the `edit` of `HEX_B` to `0`, THE Game_Module SHALL end the 4th move with Status `lost`, with a Damage_Log entry from `M1` of amount 4 on that move, because `M1` wakes at `DIST` 3, moves to `DIST` 2 and hits for 4 against the 3 `hp` left, which proves that approaching with `LICH_HP` un-rewritten is fatal, and that haunting alone (4 HP of 6) is not what kills.

### Requirement 9: Solution Files

**User Story:** As a developer, I want each stored solution to be plain data in one fixed shape, so that a replay needs no level-specific code.

#### Acceptance Criteria

1. THE repository SHALL hold exactly one Solution_File for each level at `tests/solutions/NN-slug.json`, using the Level_File name, with the fields `levelId` (equal to the level `id`), `minimalInk` (a whole number of 0 or more) and `actions` (a non-empty array), written as two-space JSON with `\n` line endings and one trailing newline.
2. THE `actions` array of each Solution_File SHALL hold only Actions of the form `{ "kind": "move", "dir": ... }` with `dir` equal to `N`, `S`, `E` or `W`, `{ "kind": "wait" }` or `{ "kind": "edit", "address": ..., "raw": ... }`, with no `undo` and no other field, and the test SHALL check this shape at run time before it replays anything.
3. THE number of `edit` Actions in each Solution_File SHALL equal its `minimalInk`, and level 1 SHALL have `minimalInk` 0 and no `edit` Action.

### Requirement 10: Solution Replay

**User Story:** As a developer, I want every level proven winnable by the real game rules, so that no level ships that cannot be finished.

#### Acceptance Criteria

1. WHEN the Solution_Replay of each level runs, THE Game_Module SHALL accept every Action, with no Refusal, using only `startRun` and `applyAction` from `src/game/index.ts`.
2. WHILE the Solution_Replay of each level runs, THE Run_State SHALL keep `hp` above 0, `ink` at 0 or above and Status `playing` after every Action except the last.
3. WHEN the last Action of the Solution_Replay is applied, THE Run_State SHALL have Status `won`, `hp` above 0, and the hero SHALL stand on a cell whose Value is `X`.

### Requirement 11: Edit-Free Search

**User Story:** As a developer, I want proof that levels 2 to 5 cannot be won by walking alone, so that editing is not optional.

#### Acceptance Criteria

1. WHEN the Edit_Free_Search runs on a level, THE search SHALL start from the Run_State of `startRun`, expand each state with the five Actions `move N`, `move S`, `move E`, `move W` and `wait`, skip Refusals, not expand a state whose Status is `won` or `lost`, and identify repeated states by their State_Key.
2. THE Edit_Free_Search SHALL be exhaustive: the test SHALL pass for levels 2 to 5 only when the search ends because no unexpanded state is left and no state with Status `won` was seen, and SHALL fail as inconclusive when it stops at its safety limits of 100 turns of depth or 1,000 distinct states.
3. WHEN the Edit_Free_Search runs on level 1, THE search SHALL find a state with Status `won`, and WHEN it runs on levels 2 to 5, THE search SHALL examine more than one state, so that a broken search cannot report success by doing nothing.
4. THE search tests SHALL carry a Vitest timeout of 60_000 ms and assert no elapsed time, because the limits of criterion 2 bound the work and timing assertions are flaky on busy machines, and WHEN a level has a monster, THE Map_Area of that level at load SHALL hold at most 60 Walkable_Cells, counted through the public read API of the loaded Level as the cells whose Value is `.`, `X` or `^` (levels 2 and 5 have 50 and 49, because the level 5 gate cell counts as not walkable at load: it shows `#`; the rule stays at most 60).

### Requirement 12: Determinism

**User Story:** As a developer, I want a solution to play out identically every time, so that the proof does not depend on run order or hidden state.

#### Acceptance Criteria

1. WHEN the Solution_Replay of each level runs twice from two separate `startRun` calls, THE Game_Module SHALL give two equal Final_Snapshots, compared through the public read API only and not through any internal helper of the Game_Module tests.

### Requirement 13: Tight but Fair

**User Story:** As a player, I want an ink budget that matches the work needed, so that a level is neither impossible nor trivially loose.

#### Acceptance Criteria

1. THE `ink` of each level SHALL equal its `minimalInk` or its `minimalInk` plus 1, and the values SHALL be: level 1 `ink` 0 and `minimalInk` 0, level 2 `ink` 2 and `minimalInk` 1, level 3 `ink` 2 and `minimalInk` 1, level 4 `ink` 1 and `minimalInk` 1, level 5 `ink` 2, `minimalInk` 2 and `startingHp` 6, so that levels 4 and 5 spend all of their ink and level 3 keeps one ink of slack.
2. WHEN the Solution_Replay of a level with `minimalInk` of 1 or more runs on a copy of the Level_Document whose `ink` is `minimalInk` minus 1, THE Game_Module SHALL refuse the last `edit` Action with the reason `no-ink`, so that the stored `minimalInk` equals the ink that the solution really needs.

### Requirement 14: Entry Point and Stub Removal

**User Story:** As a player, I want the page to open the real five levels, so that the game is playable.

#### Acceptance Criteria

1. WHEN the grid-ui entry point calls `mountApp`, THE file `src/main.ts` SHALL import `LEVELS` from `./levels/index` and pass it as the level list, replacing the import of `STUB_LEVELS` from `./stub-levels`, and SHALL otherwise stay unchanged.
2. WHEN `src/main.ts` imports `LEVELS`, THE repository SHALL delete `src/stub-levels.ts` and the assertions about it in `src/ui/fixture-levels.test.ts`, SHALL keep `tests/fixtures/levels.ts`, and a production build SHALL contain the five level ids and none of the fixture level ids.

### Requirement 15: Module Constraints

**User Story:** As a developer, I want the content layer to stay plain data with plain tests, so that it runs headless and leaks nothing it should not.

#### Acceptance Criteria

1. THE Levels_Module test files SHALL run under Vitest in the Node environment with no DOM, SHALL import only the Levels_Helpers, their own siblings and the barrels `src/game/index.ts`, `src/model/index.ts` and `src/engine/index.ts` from the lower layers, SHALL read the Solution_Files and Level_Files with `node:fs`, and SHALL use no `Math.random`, `Date.now`, `new Date`, `eval` or `new Function`.
2. THE scan test SHALL check that every file under `src/levels/` and `tests/solutions/` contains no entry of the Deny_List, compared case-insensitively, and the Deny_List SHALL be assembled from fragments so that no test file contains an entry as a whole word.
3. THE file `src/levels/index.ts` SHALL import only the five Level_Files, reference no browser global and make no function call, and THE Levels_Helpers SHALL import only the three barrels and `node:fs`, use no `Math.random`, `Date.now`, `new Date`, `performance.now`, `eval` or `new Function`, and be imported by no file other than test files, so that neither `index.ts` nor `src/main.ts` reaches it and it cannot enter the production bundle.
