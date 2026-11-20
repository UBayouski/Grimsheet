# Requirements Document

## Introduction

The sixth level is an epilogue after `05-the-lich`. It teaches the one monster rule the current five levels do not require the player to trace: `ATK_M1` is a formula, and changing an input to that formula can stop its damage. This spec extends the completed [levels spec](../levels/requirements.md); its Solution_File shape, locking policy, normalization, seed policy, replay checks and Edit_Free_Search rules still apply. The five existing level ids, files, solutions, maps and numbers stay unchanged.

This document proposes the content and acceptance criteria. The design will validate a winning route and compare tab layouts before fixing implementation details. No engine, model or game-rule change is required: `SUM`, ranges, positive-number attack damage, and harmless error-valued attack rules already exist. The shipped `skin-and-sound` spec, including its completed task 6.2, is available as the screenshot procedure. The only ordering constraint is that a separate small amendment to `skin-and-sound` (sticky formula row and a cue on unlocked cells) lands before this spec's final screenshot task.

### Proposed level

| Field | Proposal |
| --- | --- |
| Id and files | `06-the-audit`; `src/levels/06-the-audit.json`; `tests/solutions/06-the-audit.json` |
| Title and tab | `The Audit`; `Sheet6: The Audit` |
| Hint | `ATK_M1 bills every turn. Check the SUM range before changing a charge.` |
| Start | Hero at `B8`; `M1` at `J7`; `startingHp` 6; `ink` 1; `seed` 6 |
| Exit | `X` at `J4` |
| Solution cost | `minimalInk` 1: edit `B17` from `2` to `-1`, then move `N` four times and `E` eight times to `J4` |

Proposed 12-row map, columns `A` through `L` (`@` and `M` are entities placed over floor, so they appear as `.` in the file):

```text
############
############
############
#........X##
#.........##
#..####...##
#.........##
#.........##
############
############
############
############
```

| Cell | Label at left | Name | Raw text | Lock |
| --- | --- | --- | --- | --- |
| `B14` | `Audit movement` | `MOVE_M1` | `=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")` | Locked |
| `B15` | `Audit attack` | `ATK_M1` | `=SUM(B16:B17)` | Locked |
| `B16` | `Base charge` | `BASE_CHARGE` | `1` | Locked |
| `B17` | `Live charge` | `LIVE_CHARGE` | `2` | Unlocked; inside the range |
| `B18` | `Unfiled charge` | `UNFILED_CHARGE` | `2` | Unlocked; outside the range, a decoy |

At load `ATK_M1` is 3. It charges damage after every accepted turn, even if the monster stays far away, so walking faster does not avoid the bill. `B17 = -1` makes the sum 0. An error in `B17` may also make the attack harmless under the existing rules; that is an allowed alternate one-edit strategy. `MOVE_M1` and `ATK_M1` are locked, and neither reads an unlocked movement input, so an edit cannot cheaply freeze the monster. This 41-cell room has a narrow middle crossing and a route from `B8` up column B and east along row 4; its shape, hero start, monster start and exit differ from The Lich.

### Terms and proof scope

- **Solution_File** means `{ "levelId", "minimalInk", "actions" }` in two-space JSON with LF line endings and one trailing newline. Actions are `move`, `wait`, and `edit`, with no `undo`, as in the levels spec.
- **Candidate edit check** means the listed, finite experiment in Requirement 4. It says which of those tested single-cell edits can reach a win with no later edits. It is not a search over all possible formula text.
- `minimalInk` remains the stored solution's edit count, **not a proven global minimum**. The edit-free search rules out zero edits; the candidate check examines specified one-edit alternatives.

## Requirements

### Requirement 1: Epilogue content and existing rules

**User Story:** As a player who has finished The Lich, I want one final sheet that asks me to read a monster's attack rule, so that the epilogue introduces a distinct formula lesson.

#### Acceptance Criteria

1. THE level SHALL be sixth in `LEVELS`, with the id, title, hint, start, seed, map, exit, monster and panel cells proposed above. `M1` SHALL use `MOVE_M1` and `ATK_M1` as its rule names.
2. THE level SHALL use only the existing formula subset and turn rules. Its map and panel labels SHALL be locked, and its only unlocked cells SHALL be `LIVE_CHARGE` at `B17` and `UNFILED_CHARGE` at `B18`. No existing level file, solution, id, map or number SHALL change.
3. THE level SHALL load and round-trip as a normalized Level_File under the existing levels-spec rules. The hint SHALL be one line of 1 to 120 characters, panel labels SHALL be 1 to 24 characters, no raw cell text SHALL use `RAND`, and the loaded map SHALL have at most 60 walkable cells.
4. AT LOAD, `ATK_M1` SHALL evaluate to 3; editing `B17` to `-1` SHALL make it 0; editing `B18` alone SHALL leave the attack value 3. `MOVE_M1` SHALL stay locked and independent of both unlocked cells.
5. THE level SHALL have a playable route after the intended edit. The design SHALL validate its exact action list against the existing turn order before the Level_File is implemented; if the proposed geometry blocks that route, the design MAY adjust only the new level's geometry or starting positions while preserving the attack lesson, 60-cell bound and acceptance checks.
6. AFTER the winning edit, THE replay SHALL verify at every step that `M1`, moving under the locked `MOVE_M1` rule, never stands on the hero's next stored-route cell and never blocks a stored move. The design MAY discuss a geometry that makes the monster's position affect the route without an engine change or a second edit, but SHALL NOT adopt it without user approval.

### Requirement 2: Stored solution and ink

**User Story:** As a level author, I want a replayable solution with a tight ink budget, so that the new sheet is finishable under the real game rules.

#### Acceptance Criteria

1. THE repository SHALL hold `tests/solutions/06-the-audit.json` in the existing Solution_File format with `levelId` `06-the-audit`, `minimalInk` 1, and exactly one `edit` Action, `B17` to `-1`, followed by `move N` four times and `move E` eight times from `B8` to `J4`, subject to validating the route in the design.
2. THE stored replay through the public `startRun` and `applyAction` API SHALL accept every Action, keep HP above 0 and ink at or above 0, end `won` with the hero on `X`, and end with ink 0. Two fresh replays SHALL have equal final snapshots.
3. THE level's `ink` SHALL equal `minimalInk` or `minimalInk + 1`; the proposal uses `ink` 1. On a copy of the level with `ink` set to `minimalInk - 1`, the stored replay SHALL refuse its edit with `no-ink` and spend no turn.
4. THE shared ink table SHALL append level 6 as `startingHp` 6, `ink` 1 and `minimalInk` 1; the five existing rows SHALL remain unchanged.

### Requirement 3: No-edit proof

**User Story:** As a player, I want the attack edit to matter, so that walking alone cannot solve the epilogue.

#### Acceptance Criteria

1. THE existing Edit_Free_Search SHALL run on level 6 over `move N/S/E/W` and `wait` only. It SHALL return `exhausted` with more than one visited state and no win. `limit` SHALL fail as inconclusive under the existing 100-turn and 1,000-state safety bounds.
2. THE design SHALL check the no-edit arithmetic: with attack value 3 and starting HP 6, the hero cannot survive two accepted turns without changing the attack; the proposed exit at `J4` is 12 moves from `B8` along the stored route.

### Requirement 4: Bounded single-edit check

**User Story:** As a level author, I want a stronger check than replaying only the chosen solution, so that a decoy or cheaper route does not silently undercut the lesson.

#### Acceptance Criteria

1. FOR EACH unlocked cell (`B17`, `B18`), a level-specific test SHALL try one edit using each raw value in the explicit candidate set `-1`, `0`, `1`, `=1/0`, and `=MISSING`. For the candidates expected to win (`B17` = `-1`, `=1/0`, `=MISSING`), the test SHALL replay the stored route with the first action's raw text replaced by the candidate and assert that every action is accepted and the run is won. For the other candidates it SHALL search moves and waits exhaustively with no further edits after the edit, using a bounded state search whose `limit` outcome fails as inconclusive.
2. THE test SHALL report, for each cell/value pair, whether the edit was accepted and whether any continuation won. It SHALL assert that the winners in this listed set are exactly `B17` edited to `-1`, `=1/0`, or `=MISSING`; the other `B17` candidates and every `B18` candidate SHALL not win. An error-valued attack rule is harmless under the existing game rules.
3. THE test SHALL also check the post-edit attack value or error for each candidate, so a false result caused by a broken search cannot pass unnoticed. This experiment SHALL not be described as proof against every possible formula edit; `minimalInk` is still the stored solution's cost.

### Requirement 5: Six tabs and visible content

**User Story:** As a player, I want the sixth sheet to remain readable inside the existing window at the supported desktop sizes.

#### Acceptance Criteria

1. THE six sheet tabs SHALL remain on one row at 1280x1024 and 1366x768. The tab bar SHALL not wrap, clip text, protrude past the window, cause horizontal page scrolling or widen the 832-pixel window.
2. THE tab labels MAY change if one consistent naming scheme is applied to all six tabs. The design SHALL compare at least the number-plus-title, `Sheet1` through `Sheet6`, and current-tab-full options at both viewports, with measured widths, spare pixels and an impact list for strings, tests, README lines and screenshots. The chosen scheme is Option A, number plus title (`1: The Corridor` to `6: The Audit`), with the full `SheetN: Title` kept in `tabLabel`, the status bar and the confirmation prompts. The comparison stays required. The chosen option SHALL leave at least 24 px of spare width, measured in the browser.
3. THE new level's map, hint, labels, status and formula text SHALL remain readable at both viewports. Keyboard focus and selected-tab state SHALL remain visible; no state SHALL depend on color alone.

### Requirement 6: Documentation, screenshots and completion gate

**User Story:** As a maintainer, I want the sixth level reflected wherever the project describes or checks the level set, so that the shipped game and its evidence agree.

#### Acceptance Criteria

1. THE implementation plan SHALL enumerate every affected level-count or level-list location in `src/levels/`, `src/play/`, `tests/e2e/`, `README.md` (including line 17's `five hand-built puzzle levels`), `docs/BRIEF.md` (including section 6a, which names the tabs `Sheet1: The Corridor` through `Sheet5: The Lich`), `.kiro/steering/`, and every test that asserts exactly five level files or five tabs. It SHALL find these locations by text search when tasks are drafted, rather than rely on a fixed list of line numbers. It SHALL keep the completed levels spec intact apart from one dated note pointing to `.kiro/specs/sixth-level/`.
2. THE last implementation task SHALL retake all seven existing PNGs in `docs/screenshots/` because the tab bar appears in every in-game shot. It SHALL follow the already completed task 6.2 of `.kiro/specs/skin-and-sound/tasks.md` and the `Screenshots stay current` rule in `.kiro/steering/sheet-ui.md`, inspect every retaken image, and add no eighth screenshot unless requested. That task SHALL first check that the separate dated sticky-formula-row and unlocked-cell-cue amendment exists in `.kiro/specs/skin-and-sound/` with its new tasks all ticked, and SHALL stop and tell the user if it does not. No other task in this spec is blocked by it.
3. THE final implementation gate SHALL pass `npm run verify` and `npm run e2e`, then append a dated entry to `KIRO_USAGE.md` in its existing format. That entry SHALL mention that `.kiro/specs/hosting/.config.kiro` was kept. No commit or push is part of this spec.
