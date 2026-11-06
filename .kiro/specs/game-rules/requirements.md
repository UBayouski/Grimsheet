# Requirements Document

## Introduction

The Game_Module is the rules layer between the Sheet_Model and the UI. It lives under `src/game/` and owns the Run_State, the turn sequence, hero movement, formula edits and ink, monster behaviour, damage, traps, haunting, win and loss, one-step undo, and the seeded Random_Generator. It is the third spec in `docs/BRIEF.md` section 12 and sits in the dependency direction `ui -> game -> model -> engine`.

The Game_Module is DOM-free. Rendering, keyboard handling, `localStorage`, progress persistence and audio belong to `grid-ui` and `skin-and-sound`. The Game_Module reaches the model only through `src/model/index.ts` and the engine only through `src/engine/index.ts`.

Every action returns a new Run_State or a refusal with a reason and never throws. The Turn_Sequence uses the step numbers of `docs/BRIEF.md` section 5 and `.kiro/steering/product.md` "Turn order" exactly:

1. The player acts: a move, a wait, or a committed formula edit that costs 1 ink.
2. A move succeeds only onto a Walkable_Cell with no monster on it.
3. The Sheet recalculates.
4. Each monster, in Reading_Order, evaluates `move` with `SELF` bound to it, then `atk`.
5. A hero on `^` loses the Trap_Value.
6. While any `#CYCLE!` exists, the hero loses 1 HP.
7. The Sheet recalculates. A hero on `X` wins; `HP` at 0 or below loses.

A refused Action does not run the Turn_Sequence beyond the point where it is refused: a refused move ends at step 2 and a refused edit ends at step 1.

Cell values matter only when an entity enters a Cell. The hero and the monsters are never evicted: when an edit or a `RAND()` formula turns the Cell under an entity into a non-walkable Cell, the entity stays where it is and can still leave. A move is checked only against its target Cell.

How far a monster can hurt the hero is decided by each monster's `atk` formula (the `levels` spec uses `DIST`). This spec defines no attack range.

Property-based testing with fast-check is enabled on exactly three requirements: Requirement 12 (determinism), Requirement 13 (undo) and Requirement 14 (invariants). All other requirements are covered by example-based unit tests. Generators live in `src/game/testing/arbitraries.ts`, follow the pattern of `src/model/testing/arbitraries.ts` (one owner of every generator, one `assertProperty` helper that honours `FC_SEED`, no `Math.random`), and are not exported from `src/game/index.ts`.

### Decisions

Every decision below is confirmed by the user. The design will build on them.

1. **Boss rule. Confirmed.** The only way to win is to stand on `X`. Monsters block and hurt; they cannot be killed and the hero has no attack. The Lich's "HP" is an ordinary named cell in the Rules_Panel, and the `levels` spec gates the exit on it. The player wins by breaking rules, not by defeating the Lich.
2. **Blocked moves cost nothing. Confirmed.** A move into a wall, an error cell, the sheet edge or a monster is refused at step 2. No turn passes and monsters do not act.
3. **Loss beats win. Confirmed.** A hero who reaches `X` with HP at 0 or below is dead (Requirement 9).
4. **Entities are never evicted. Confirmed.** Cell values matter only when an entity enters a cell. An edit is never refused or rolled back because of the Cell under the hero or a monster, and a hero on a non-walkable Cell is not lost and can still move out.
5. **An edit is a full turn. Confirmed.** Steps 3 to 7 follow an edit. An edit that changes nothing is refused as `unchanged` and is not a turn. An edit is validated before anything is stored, so a refused edit needs no rollback.
6. **Monsters enter only `.` cells. Confirmed.** The hero counts as an occupant, so monsters never step on `X`, `^` or the hero's Cell.
7. **Undo rebuilds the Sheet. Confirmed, no engine change.** The engine Sheet is opaque and mutable. The Run_State keeps the Level plus the Edit_Record, the game's own list of every accepted raw-text edit. Undo rebuilds the Sheet from the Level and the Edit_Record through the public engine API (`createSheet`, `setRawText`, `setCellName`, `recalculate`, as the model loader does), with the stored Rng_State restored. The rebuilt Sheet must give the same Values as the Sheet had before the undone Turn_Action. Requirements 11 and 13 test this.
8. **HP is not a Cell. Confirmed.** Formulas cannot read the hero's HP, and the Game_Module writes HP into no Cell.
9. **Dead and won are final. Confirmed.** Undo is refused once the Status is `won` or `lost`; the UI restarts a level with `startRun`.
10. **Traps need a `TRAP` of at least 1 after flooring. Confirmed.** A `^` Cell hurts only when the Sheet has a Cell named `TRAP` with a number whose floor is 1 or more (Requirement 8).
11. **Accepted Turn_Actions report their damage. Confirmed.** Every accepted Turn_Action returns a Damage_Log next to the new Run_State, so that Requirement 14, criterion 2 can be checked exactly.
12. **Bad seeds fall back to 0. Confirmed.** `startRun` seeds with 0 when the document `seed` is not an integer from 0 to 4294967295 (Requirement 1).
13. **Undo restores HP and ink exactly. Confirmed.** No cap applies (Requirement 10).
14. **Monster reach belongs to the formulas. Confirmed.** See the Introduction.
15. **Damage is whole numbers. Confirmed.** A number from a monster `atk` rule or from `TRAP` is rounded down with `Math.floor`, and only a floored result of 1 or more deals damage. Every Damage_Log amount is a positive whole number, and `hp` and `ink` stay integers because `startingHp` and `ink` are integers by the Sheet_Model schema and every subtraction is of an integer. The engine turns an overflowing result into `#VALUE!`, so a rule number is always finite, but a floored amount larger than `Number.MAX_SAFE_INTEGER` is not specially handled by this spec; the design decides how `hp` stays a safe integer.
16. **Edit text is capped at 500 characters. Confirmed.** This matches the Sheet_Model loader cap; a longer edit is a `parse-error` and costs no ink (Requirement 6).
17. **The Sheet is private. Confirmed.** The Run_State holds its Sheet privately inside the Game_Module. Callers read through the read functions of Requirement 1, criterion 4.
18. **Blocked comes before occupied. Confirmed.** A move onto a non-walkable Cell is `blocked` even when a monster stands there (Requirement 5).
19. **Every accepted Action builds a fresh Sheet. Confirmed.** Performance caching is deferred and changes no behaviour.

## Glossary

- **Game_Module**: The complete `src/game/` module, exposed through `src/game/index.ts`.
- **Sheet_Model**: The finished module under `src/model/`, used only through `src/model/index.ts`.
- **Formula_Engine**: The finished module under `src/engine/`, used only through `src/engine/index.ts`.
- **Level_Document**, **Level**, **Load_Error**, **Cell_Name**, **Rules_Panel**, **Map_Area**, **Separator_Row**, **Locked_Flag**, **Walkable_Cell**, **Floor_Cell**, **Reading_Order**, **Author_Order**: As defined in the sheet-model spec.
- **Address**: A column letter `A` to `L` followed by a row number `1` to `20`, as defined in the formula-engine spec.
- **Run_State**: The immutable-from-outside record of one play of one level: `level`, `edits` (the Edit_Record), `hero` (an Address), `monsters`, `hp`, `ink`, `turn`, `status`, `rngState`, `valuesHero`, `valuesRngState` and `undoSnapshot`. Its Sheet is not a visible field; the Game_Module holds the Sheet privately, and callers read Cells through the read functions of Requirement 1, criterion 4.
- **valuesHero** and **valuesRngState**: The hero Address and the Rng_State at the start of the recalculation whose Values the Sheet of the Run_State holds. They let an undo rebuild the Values of `RAND()` Cells exactly.
- **Edit_Record**: The ordered list of `{ address, raw }` entries for every accepted edit of the run, kept by the Game_Module so that a Sheet can be rebuilt from the Level.
- **Monster_State**: One entry of `monsters`: the Monster_Spec id, the current Address, and the Rule_Names for `move` and `atk`. The list keeps Author_Order.
- **Status**: One of `playing`, `won` or `lost`.
- **Action**: One of `{ kind: "move", dir }` with `dir` equal to `N`, `S`, `E` or `W`; `{ kind: "wait" }`; `{ kind: "edit", address, raw }`; or `{ kind: "undo" }`.
- **Turn_Action**: A move, a wait or an edit. Undo is not a Turn_Action.
- **Action_Result**: Either `{ ok: true, state, damage }` or `{ ok: false, reason, message }`. For an accepted undo, `damage` is an empty Damage_Log.
- **Refusal**: An Action_Result with `ok` equal to `false`. The `reason` comes from the fixed list in Requirement 3. The `message` is plain English of 1 to 200 characters.
- **Damage_Log**: The list, in the order applied, of every HP subtraction of one accepted Turn_Action. Each entry has a `source` (`monster` with the monster id, `trap`, or `haunt`) and an `amount` that is a positive whole number.
- **Random_Generator**: The deterministic generator in `src/game/` that returns numbers in [0, 1) and whose position is one unsigned 32-bit integer, the Rng_State.
- **Rng_State**: The unsigned 32-bit integer that fixes the next value of the Random_Generator.
- **Turn_Sequence**: The seven steps of `docs/BRIEF.md` section 5, listed in the Introduction, applied in order to every accepted Turn_Action.
- **Undo_Snapshot**: The stored fields of the Run_State as they were immediately before the last accepted Turn_Action (`hero`, `monsters`, `hp`, `ink`, `turn`, `status`, `rngState`, `valuesHero`, `valuesRngState` and the Edit_Record), which holds no Undo_Snapshot of its own. It is `null` when nothing can be undone.
- **Raw_Text**: The text of a Cell as defined in the formula-engine spec. The current Raw_Text of a Cell is the last accepted edit, otherwise the Effective_Raw from the Level.
- **Rule_Value**: The Value that the Formula_Engine function `evaluateCell` returns for a monster's `move` or `atk` Cell, evaluated with `selfAddress` set to the monster's Address.
- **Trap_Value**: The Value of the Cell named `TRAP`.
- **Haunted**: The condition that the Formula_Engine function `listCycleCells` returns a non-empty list for the current Sheet.
- **State_Equality**: Equality of two Run_States in all of: `hero`, `hp`, `ink`, `turn`, `status`, `rngState`, `valuesHero`, `valuesRngState`, the Edit_Record, the `monsters` list (same order, id and Address), the Raw_Text and the Value of every one of the 240 Cells, and, recursively, the Undo_Snapshot. The Level is compared by reference or by structural equality.

## Requirements

### Requirement 1: Run State and Start

**User Story:** As a UI developer, I want a complete run state that I can read but never corrupt, so that rendering and tests always see a consistent game.

#### Acceptance Criteria

1. THE Game_Module SHALL export a function `startRun` that accepts an unknown Level_Document value and returns either `{ ok: true, state }` or `{ ok: false, errors }`, where `errors` holds the Load_Errors of the Sheet_Model unchanged.
2. WHEN `startRun` receives a Level_Document, THE Game_Module SHALL create a Random_Generator seeded with the `seed` field of the document (or with 0 when `seed` is not an integer from 0 to 4294967295) and SHALL pass that generator to the Sheet_Model function `loadLevel`.
3. WHEN `loadLevel` accepts the Level_Document, THE Game_Module SHALL create a Run_State with `hp` equal to `startingHp`, `ink` equal to the level `ink`, `turn` equal to 0, Status `playing`, `hero` equal to `hero.at`, one Monster_State per Monster_Spec at its `at` Address in Author_Order, an empty Edit_Record, `undoSnapshot` equal to `null`, and `rngState` equal to the position of the generator after loading.
4. THE Game_Module SHALL hold the Sheet of a Run_State privately and SHALL export, as the complete read API, the fields `hero`, `monsters`, `hp`, `ink`, `turn` and `status` of the Run_State, the functions `cellValue`, `cellRawText`, `isCellLocked`, `cellName` and `describeCellError` that each accept a Run_State and an Address and return the current Value, the current Raw_Text, the Locked_Flag, the Cell_Name and the plain-English cause of an error Value of that Cell, and the function `isPlaying` that accepts a Run_State and returns whether the Status is `playing`; the Damage_Log SHALL be returned with each accepted Action_Result; WHEN an Address is outside the Sheet or is not a string, or a Cell has no Cell_Name or holds no error, THE Game_Module SHALL report a missing result and not an exception.
5. WHEN `applyAction` is called with a Run_State, THE Game_Module SHALL leave every value readable through the read API of that Run_State unchanged, whether the Action is accepted or refused, and WHEN the Action is refused, THE Game_Module SHALL return no new Run_State, so that the caller keeps its Undo_Snapshot, ink, turn, Rng_State and Sheet.
6. THE Game_Module SHALL export a function `applyAction` that accepts a Run_State and an Action and returns an Action_Result, and SHALL return a Refusal with reason `invalid-action` for any value that is not a well-formed Action, including `null`, a wrong `kind`, a `dir` other than `N`, `S`, `E` or `W`, and a non-string `address` or `raw`.
7. IF any step of an Action fails inside the Game_Module or the Formula_Engine reports an internal fault, THEN THE Game_Module SHALL return a Refusal with reason `internal-error` and SHALL NOT throw.

### Requirement 2: Seeded Random Generator

**User Story:** As a game developer, I want one small deterministic generator, so that the same level and the same actions always give the same game.

#### Acceptance Criteria

1. THE Game_Module SHALL export a function `createRandom` that accepts a seed and an optional Rng_State and returns a Random_Generator whose every returned number is in [0, 1), whose Rng_State can be read, and which returns the same sequence of numbers for the same seed.
2. THE Game_Module SHALL pass the Random_Generator rebuilt from the `rngState` of the Run_State to the Formula_Engine in every `recalculate` call and every `evaluateCell` call of an Action, SHALL store the Rng_State after the last use in the new Run_State, and SHALL use no other source of randomness.

### Requirement 3: Refusal Reasons

**User Story:** As a UI developer, I want every refusal to carry a fixed reason code and a readable message, so that the UI can show the right text without parsing prose.

#### Acceptance Criteria

1. THE Game_Module SHALL export the fixed list `REFUSAL_REASONS` with exactly these codes: `not-playing`, `blocked`, `occupied`, `locked`, `bad-address`, `reserved-row`, `unchanged`, `no-ink`, `parse-error`, `nothing-to-undo`, `invalid-action` and `internal-error`, and SHALL give every Refusal one of these codes and a `message` of 1 to 200 characters.

### Requirement 4: Turn Sequence

**User Story:** As a player, I want every move, wait and edit to play out in the same fixed order, so that I can predict what the dungeon does after my action.

#### Acceptance Criteria

1. WHEN a Turn_Action is accepted, THE Game_Module SHALL apply the steps of `docs/BRIEF.md` section 5 in this order and with these numbers: step 1 the player acts (move, wait, or commit an edit that costs 1 ink); step 2 a move succeeds only onto a Walkable_Cell with no monster; step 3 the Sheet recalculates; step 4 each monster in Reading_Order evaluates `move` and then `atk`; step 5 the trap damage; step 6 the haunting damage; step 7 the Sheet recalculates and the outcome is checked.
2. THE Game_Module SHALL pass the current hero Address and the Random_Generator to the Formula_Engine in every `recalculate` call of steps 3 and 7, and SHALL add 1 to `turn` exactly once per accepted Turn_Action.
3. WHEN a Turn_Action is accepted, THE Game_Module SHALL store the Undo_Snapshot of the state from before the Action in the new Run_State and SHALL return a Damage_Log with one entry for every HP subtraction of steps 4, 5 and 6.
4. IF a Turn_Action is refused, THEN THE Game_Module SHALL end the Action at the step where the refusal arises (a move at step 2, an edit at step 1) and SHALL NOT run any later step, change `turn`, or spend ink.

### Requirement 5: Movement and Waiting

**User Story:** As a player, I want to move one cell with the arrow keys or wait in place, so that I can walk to the exit and let the dungeon act.

#### Acceptance Criteria

1. WHEN a move with `dir` `N`, `S`, `E` or `W` is applied (step 1) and the target Cell is a Walkable_Cell inside the Map_Area with no monster on it (step 2), THE Game_Module SHALL set the hero Address to the target Cell (`N` is one row up, `S` one row down, `E` one column right, `W` one column left) and SHALL continue with step 3, whatever Value the Cell under the hero currently holds.
2. IF the target Cell of a move is not a Walkable_Cell, is outside the Map_Area or is outside the Sheet, THEN THE Game_Module SHALL return a Refusal with reason `blocked` at step 2, even when a monster stands on the target Cell.
3. IF the target Cell of a move is a Walkable_Cell inside the Map_Area and a monster stands on it, THEN THE Game_Module SHALL return a Refusal with reason `occupied` at step 2.
4. WHEN a wait is applied, THE Game_Module SHALL keep the hero Address and SHALL continue with step 3.
5. WHILE the Status is `won` or `lost`, THE Game_Module SHALL return a Refusal with reason `not-playing` for a move, a wait, an edit and an undo.

### Requirement 6: Formula Edits and Ink

**User Story:** As a player, I want to rewrite a cell for one unit of ink, so that I can change the rules, and I want a bad edit to cost me nothing.

#### Acceptance Criteria

1. WHEN an edit is applied at step 1, THE Game_Module SHALL check the Action in this order and SHALL return the Refusal of the first check that fails: Status (`not-playing`), Address not accepted by the Formula_Engine (`bad-address`), Address in row 13, the Separator_Row (`reserved-row`), Locked_Flag (`locked`), unchanged Raw_Text (`unchanged`), ink (`no-ink`), parse, including the length check (`parse-error`).
2. IF the Locked_Flag of the target Cell is `true`, THEN THE Game_Module SHALL return a Refusal with reason `locked`; a Cell without a Cell_Spec or with the Locked_Flag omitted SHALL be editable.
3. IF the `raw` text equals the current Raw_Text of the target Cell character for character, THEN THE Game_Module SHALL return a Refusal with reason `unchanged`.
4. IF `ink` is 0, THEN THE Game_Module SHALL return a Refusal with reason `no-ink`.
5. IF the Formula_Engine refuses the formula with a Parse_Error, THEN THE Game_Module SHALL return a Refusal with reason `parse-error` whose message contains the engine's `Col N: <message>.` text unchanged, and IF the `raw` text is longer than 500 characters, THEN THE Game_Module SHALL return a Refusal with reason `parse-error` and the message `Text is longer than 500 characters.` at the same parse check, and in both cases the Cell, the Edit_Record, the ink, the turn and the Rng_State SHALL stay unchanged, because the Game_Module validates the edit before it stores anything.
6. WHEN an edit passes all checks of criterion 1, THE Game_Module SHALL store the `raw` text in the target Cell, append the edit to the Edit_Record, subtract 1 from `ink`, and continue with step 3, with no check against the Cell under the hero or under any monster.

### Requirement 7: Monster Behaviour

**User Story:** As a player, I want each monster to follow the rule cells it names, so that I can predict it, and I want a broken rule to make it harmless.

#### Acceptance Criteria

1. WHEN step 4 of the Turn_Sequence begins, THE Game_Module SHALL fix the monster order as the Reading_Order of the current monster Addresses, and SHALL give each monster its turn in that order.
2. WHEN a monster takes its turn, THE Game_Module SHALL obtain the Rule_Value of its `move` Cell with the Formula_Engine function `evaluateCell`, with the hero Address, the monster's current Address as `selfAddress` and the Random_Generator in the context, using the rule as it stands after any edit committed in step 1 of the same turn.
3. WHEN the Rule_Value of `move` is the exact string `"N"`, `"S"`, `"E"` or `"W"` and the target Cell is a Floor_Cell inside the Map_Area with no monster and not the hero on it, THE Game_Module SHALL move the monster one Cell up, down, right or left, whatever Value the Cell under the monster currently holds.
4. WHEN the Rule_Value of `move` is any other Value, including `"-"`, a lower-case direction, a number, a boolean, an empty string or an error, or WHEN the target Cell does not qualify, THE Game_Module SHALL leave the monster in place.
5. WHEN a monster has finished moving, THE Game_Module SHALL obtain the Rule_Value of its `atk` Cell with `selfAddress` set to the monster's Address after the move.
6. WHEN the Rule_Value of `atk` is a number whose value rounded down with `Math.floor` is 1 or more, THE Game_Module SHALL subtract that rounded-down value from `hp` and SHALL add one Damage_Log entry with that value as `amount`; WHEN the rounded-down value is below 1 (including 0.9, 0 and a negative number), or the Rule_Value is a string, a boolean or an error, or WHEN `evaluateCell` returns a result that is not `ok`, THE Game_Module SHALL leave `hp` unchanged for that monster and SHALL add no Damage_Log entry.
7. THE Game_Module test suite SHALL include explicit examples of breaking a rule as a legal strategy: a `move` Cell that evaluates to an error leaves the monster in place; an `atk` Cell that evaluates to an error deals no damage; and an edit that turns a wall Cell into floor opens a move that was refused before.

### Requirement 8: Traps and Haunting

**User Story:** As a player, I want traps to hurt only when the level defines them, and a circular reference to haunt me until I break it, so that damage always has a visible cause.

#### Acceptance Criteria

1. WHEN step 5 of the Turn_Sequence runs and the Cell at the hero Address holds the string `^`, THE Game_Module SHALL subtract the Trap_Value rounded down with `Math.floor` from `hp` and add one Damage_Log entry with that value as `amount`, if the Sheet has a Cell named `TRAP` whose Value is a number whose rounded-down value is 1 or more, and SHALL do so again on every accepted Turn_Action while the hero stands on `^`.
2. WHEN step 5 runs and the hero Cell does not hold `^`, or the Sheet has no Cell named `TRAP`, or the Trap_Value is not a number whose rounded-down value is 1 or more, THE Game_Module SHALL leave `hp` unchanged and SHALL add no Damage_Log entry. The design records this decision: a trap does nothing without a `TRAP` number of at least 1 after flooring.
3. WHEN step 6 of the Turn_Sequence runs and the Sheet is Haunted, THE Game_Module SHALL subtract 1 from `hp` once, however many Cells are on circular references; because step 3 precedes step 6, an edit that removes the last circular reference causes no haunting damage in the same turn.

### Requirement 9: Win and Loss

**User Story:** As a player, I want reaching the exit to win and running out of HP to lose, with a clear rule when both happen on one turn.

#### Acceptance Criteria

1. WHEN step 7 of the Turn_Sequence runs, THE Game_Module SHALL recalculate the Sheet and then evaluate the outcome in this order: loss first, then win.
2. IF `hp` is 0 or below at step 7, THEN THE Game_Module SHALL set the Status to `lost`, even when the hero stands on `X`.
3. WHEN `hp` is above 0 and the Cell at the hero Address holds the string `X` after the recalculation of step 7, THE Game_Module SHALL set the Status to `won`.
4. WHEN `hp` is above 0 and the Cell at the hero Address does not hold `X` after the recalculation of step 7, THE Game_Module SHALL keep the Status `playing`, whatever Value that Cell holds, so that a hero on a non-walkable Cell stays alive and can move out.

### Requirement 10: Undo

**User Story:** As a player, I want to take back my last move or edit, so that one mistake does not end the run.

#### Acceptance Criteria

1. WHEN an undo is applied, the Status is `playing` and the Undo_Snapshot is not `null`, THE Game_Module SHALL return a Run_State whose `hero`, `monsters`, `hp`, `ink`, `turn`, `rngState` and Edit_Record equal their values before the last accepted Turn_Action, and whose Sheet the Game_Module has rebuilt from the Level and that Edit_Record through the public Formula_Engine API, so that every Raw_Text and every Cell Value equals its value before that Turn_Action.
2. WHEN an undo is accepted, THE Game_Module SHALL restore `hp` and `ink` exactly to their stored values, with no cap, minimum or maximum applied, SHALL refund the ink of an undone edit, and SHALL return a Run_State whose Undo_Snapshot is `null`.
3. IF the Undo_Snapshot is `null`, including in a Run_State from `startRun` and in a Run_State just restored by an undo, THEN THE Game_Module SHALL return a Refusal with reason `nothing-to-undo`.
4. THE Game_Module SHALL keep exactly one level of undo, and a Run_State SHALL hold no chain of snapshots deeper than one.

### Requirement 11: Isolation of Run States

**User Story:** As a UI developer, I want an old run state to stay valid after later actions, so that I can keep it for undo, replay or comparison.

#### Acceptance Criteria

1. WHEN an Action is accepted, THE Game_Module SHALL return a Run_State whose Sheet is not shared with the Run_State that was passed in, including the freshly rebuilt Sheet of an undo, so that later Actions on the new Run_State leave every Value and Raw_Text of the old Run_State unchanged.
2. WHEN `startRun` is called twice with the same Level_Document, THE Game_Module SHALL return two Run_States that are equal under State_Equality and that share no Sheet.

### Requirement 12: Determinism (Property-Based Test)

**User Story:** As a game developer, I want the same level and the same actions to give the same game, so that replays, tests and the solver agree.

#### Acceptance Criteria

1. FOR ALL valid Level_Documents and all lists of Actions, THE Game_Module SHALL produce, when `startRun` and then `applyAction` for each Action are run twice, two sequences of Action_Results that have the same `ok` values, the same Refusal reasons and messages, the same Damage_Logs, and Run_States that are equal under State_Equality at every step.
2. THE Game_Module test suite SHALL verify criterion 1 with fast-check, running at least 100 generated cases, using generators that produce valid Level_Documents with 0 to 4 monsters, walls, floor, exits, traps, a `TRAP` cell, `RAND()` formulas in rule cells and in map cells (including formulas that make the Cell under an entity non-walkable), circular references, locked and unlocked cells, and Action lists of 0 to 40 entries that mix moves, waits, valid edits, edits of invalid formulas, edits of locked cells, undos and malformed Actions, and SHALL fail the run with the shrunk counterexample and the random seed reported when a property fails.

### Requirement 13: Undo Restores the Previous State (Property-Based Test)

**User Story:** As a game developer, I want undo to be an exact inverse of the last action, so that no hidden state survives a take-back.

#### Acceptance Criteria

1. FOR ALL valid Level_Documents and all lists of Actions, WHEN an accepted Turn_Action is followed by an accepted undo, THE Game_Module SHALL return a Run_State that is equal under State_Equality to the Run_State before the Turn_Action, except that the Undo_Snapshot is `null`, which includes that the rebuilt Sheet gives the same Raw_Text and the same Value in all 240 Cells as the Sheet before the Turn_Action.
2. FOR ALL valid Level_Documents and all lists of Actions, WHEN an undo is applied to the Run_State returned by `startRun` or by an accepted undo, THE Game_Module SHALL return a Refusal with reason `nothing-to-undo`, and WHEN any other Action is refused, an undo applied to the caller's Run_State SHALL give the same result as an undo applied before that Refusal.
3. THE Game_Module test suite SHALL verify criteria 1 and 2 with fast-check, running at least 100 generated cases per property, using the generators of Requirement 12, checking that the next `RAND()` value after the undo equals the next `RAND()` value from the Run_State before the undone Turn_Action, and SHALL fail the run with the shrunk counterexample and the random seed reported when a property fails.

### Requirement 14: Run Invariants (Property-Based Test)

**User Story:** As a game developer, I want the run state to obey its basic rules after any sequence of actions, so that the UI and the solver can rely on them.

#### Acceptance Criteria

1. FOR ALL valid Level_Documents and all lists of Actions, THE Game_Module SHALL keep `ink` at 0 or above and at most the level `ink` after every Action, and `ink` SHALL increase only through an accepted undo.
2. FOR ALL valid Level_Documents and all lists of Actions, WHEN a Turn_Action is accepted, THE Game_Module SHALL return a Run_State whose `hp` equals the `hp` before the Action minus each `amount` of its Damage_Log, where every `amount` is a positive whole number and the Damage_Log holds exactly one `monster` entry for each monster whose `atk` Rule_Value at step 4 was a number whose rounded-down value is 1 or more (with that rounded-down value as `amount`), one `trap` entry when step 5 subtracted the rounded-down Trap_Value, and one `haunt` entry of amount 1 when step 6 ran on a Haunted Sheet.
3. FOR ALL valid Level_Documents and all lists of Actions, THE Game_Module SHALL keep the hero and every monster on distinct Addresses, and every monster inside the Map_Area, after every Action.
4. FOR ALL valid Level_Documents and all lists of Actions, THE Game_Module SHALL keep a Status of `won` or `lost` unchanged in every later Run_State, and SHALL set the Status to `won` only when `hp` is above 0 and the hero Cell holds `X`, and to `lost` only when `hp` is 0 or below.
5. THE Game_Module test suite SHALL verify criteria 1 to 4 with fast-check, running at least 100 generated cases per property, using the generators of Requirement 12, and SHALL fail the run with the shrunk counterexample and the random seed reported when a property fails.

### Requirement 15: Module Constraints

**User Story:** As a game developer, I want the game layer to stay pure, so that it runs in tests, in the headless solver and in the browser.

#### Acceptance Criteria

1. THE Game_Module SHALL export its public API from `src/game/index.ts` using named exports and no default export.
2. THE Game_Module SHALL import the Sheet_Model only from `src/model/index.ts` and the Formula_Engine only from `src/engine/index.ts`, SHALL import no module under `src/ui/`, and SHALL implement no rendering, keyboard handling, audio or progress persistence.
3. THE Game_Module SHALL NOT reference `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch`, `XMLHttpRequest`, `AudioContext` or any other browser-only global.
4. THE Game_Module SHALL NOT call `Math.random`, `Date.now` or `new Date`, and SHALL NOT use `eval` or `new Function`.
5. WHEN the Game_Module test suite runs with Vitest under Node 22 or later without a browser, THE Game_Module SHALL complete all game tests with zero failures and zero DOM-related errors.
6. THE Game_Module SHALL contain no name of an AI tool other than Kiro in any file, comment, test name or message.
