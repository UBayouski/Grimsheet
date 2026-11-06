# Requirements Document

## Introduction

The Grid_UI is the browser layer of Grimsheet. It lives under `src/ui/` and turns a Run_State of the Game_Module into a spreadsheet on the page: a DOM table with column letters, row numbers and 240 grid positions, a name box, a formula bar, a status bar, a sheet tab bar, and plain-text screens for playing, won and lost. It collects keyboard and mouse input, maps it to Actions, applies them with `applyAction`, and renders the result. It marks the cells whose Value changed in the last accepted Action, and it asks for confirmation before any input that throws away a run in progress (restart, or switching level). It is the fourth spec in `docs/BRIEF.md` section 12 and sits at the top of the dependency direction `ui -> game -> model -> engine`.

The Grid_UI owns no game rules. Turns, movement, monsters, damage, traps, haunting, ink, undo and the seeded generator belong to `game-rules`. The Grid_UI reads a Run_State only through the read API of the Game_Module and changes it only through `applyAction` and `startRun`.

### Scope

Rendered here as plain text with minimal functional CSS (table layout, a visible focus ring, a padlock marker, a selected-cell outline): the grid, entity glyphs, cell text, error text, the formula bar, the status bar, the sheet tabs, the confirmation prompt and the three screen states.

Deferred to other specs, with the hooks of Requirement 14 left in place:

- `error-monsters`: error looks, hover explanations and the drifting ghost.
- `levels`: the five level files and the solver.
- `skin-and-sound`: chrome styling, sprites, animations (including the animation for `data-changed` cells), the title screen, the death dialog styling, sound (including any sound for a refused move) and contrast tuning.
- `hosting`: the static build and deploy.

### Property-based testing

Property-based testing is not enabled for any requirement of this spec. Each render function would need a DOM per generated case, the pure view-model and key-mapping logic are small enough for exhaustive example tables, and the state properties (determinism, undo, invariants) are already covered in `game-rules`. Tests are example-based with Vitest in a happy-dom environment, plus Playwright end-to-end tests for two full flows (Requirement 15).

### Decisions

Each item below is Confirmed. The design must follow it.

1. **Keyboard scheme.** Confirmed. Arrow keys move the hero whenever focus is not inside a text field or on a button. The selection moves with the mouse, with Ctrl+Arrow (Command+Arrow on macOS), and with Enter or F2 to start an edit. This keeps the BRIEF rule "arrows and Space play the game" and needs no mode switch. Tab and Shift+Tab are left to normal browser focus movement so that keyboard users can reach every control. `U` and Ctrl/Command+Z undo. `R` restarts the level: while playing it asks for confirmation first (Decision 9), on the won and lost screens it restarts at once. Rejected: a mode switch (extra state to learn) and Tab for selection (traps keyboard focus).
2. **DOM test tool.** Confirmed. Vitest with the `happy-dom` environment, added as one exact-pinned dev dependency (no `^` or `~`, as `tech.md` requires). It is faster than the alternatives, which matters for the save hook, and Playwright covers the real browser. The design pins the version (the current release is 21.0.4; the design verifies it before pinning).
3. **Level list seam.** Confirmed. `mountApp(root, options)` takes the level list as an injected array of Level_Documents plus an injected storage object. `src/main.ts` is the composition root: it imports the level JSON files through `src/levels/index.ts` (supplied by the `levels` spec) and passes them in. `src/ui/` never imports `src/levels/`. Until the `levels` spec lands, `main.ts` passes a small stub list. The Playwright flows do not use `src/levels/`; they run against a fixture level list under `tests/fixtures/` (Requirement 15), so this spec does not wait for the `levels` spec.
4. **Screen states.** Confirmed. The Grid_UI provides exactly three: `playing`, `won` and `lost`, exposed as a `data-screen` attribute on the App_Root plus a plain-text banner with buttons. No title screen is provided here; `skin-and-sound` adds it and styles the other three.
5. **NECRONOMICELL title.** Confirmed. Per the sheet-model decision, it is UI-only text. It lives in row 13, in one table cell spanning columns A to L, and in the UI strings file.
6. **Import reach.** Confirmed. `src/ui/` imports only the public barrels `src/game/index.ts`, `src/model/index.ts` (for `tabLabel`) and `src/engine/index.ts` (for `formatValue`, `parseAddress`, `formatAddress`). It never imports a deeper path. This is the rule in `.kiro/steering/structure.md`: a layer may import any lower layer's barrel (`index.ts`), never a deeper path. The layering rule forbids upward imports, not skipping a layer.
7. **Restart source.** Confirmed. The UI keeps the Level_Document it passed to `startRun` and restarts with that same value.
8. **Next level key.** Confirmed. `N` goes to the next level, and only on the won screen when a next level exists. During play and on the lost screen `N` does nothing. This key is an addition to the keys listed in the BRIEF.
9. **Restart confirmation.** Confirmed. Restart and level switching cannot be undone, so while the Status is `playing` they start a Pending_Confirmation instead of acting: the `R` key, the Recover button, and a click on the Tab_Bar button of another level. On the won and lost screens each of these acts at once. The simplest consistent rule: any input that would replace a run in progress asks first, and a second matching input confirms.
10. **Tab bar.** Confirmed. A tab is enabled when its level is cleared or when it is the First_Uncleared_Level. All other tabs are shown but disabled. Replaying an earlier level never disables a cleared one. Clicking an enabled tab starts that level fresh. Clicking the tab of the current level while playing is the same as Recover. On mount the Grid_UI starts the saved current level when its tab is enabled, otherwise the First_Uncleared_Level (or the first level when all are cleared), and never a disabled level.
11. **Changed cells.** Confirmed. No game API change. The UI compares the Value of every cell (the `formatValue` text of `cellValue`, and its kind) before and after an accepted Action and marks the changed Grid_Cells with `data-changed="true"`. Only Values are compared; a changed Raw_Text with the same Value is not marked. The animation belongs to `skin-and-sound`.
12. **Refused moves.** Confirmed. A `blocked` or `occupied` move shows no message and keeps the previous Run_State rendered. Every other Refusal shows a message. `skin-and-sound` may add a sound for a refused move.
13. **DOM reach.** Confirmed. Only `src/ui/` and the browser entry `src/main.ts` touch the DOM. `src/main.ts` only calls `document.getElementById` to find the root and passes it to `mountApp`; the test-only fixture entry under `tests/fixtures/` does the same and is test code. `localStorage` is reached only inside `src/ui/`, through `browserStorage`. `window`, `sessionStorage` and `AudioContext` are used only inside `src/ui/`.
14. **Parse errors.** Confirmed. A `parse-error` Refusal message appears only in `#formula-alert` beside the Formula_Bar and leaves the Message unchanged, so a screen reader does not read it twice. Every other edit Refusal shows its message in the Message and sets no alert.
15. **Click-away.** Confirmed. When the Formula_Bar loses focus during Edit_Mode, the edit is cancelled with no Action, so no ink is spent.
16. **Cell markup.** Confirmed. The Cell_Text lives in a `.cell-text` child of the Grid_Cell. The entity glyph and the padlock are further child elements. Tests and later specs read `.cell-text`.
17. **Enter and F2.** Confirmed. Enter starts an edit only when focus is neither in a text field nor on a button, because a focused button keeps its native Enter activation. F2, double-click and Formula_Bar focus also start an edit, and F2 works from a button too.
18. **Quiet turn message.** Confirmed. An accepted move or wait with an empty Damage_Log sets the Message to the level hint, so a stale damage line does not stay. On a loss the damage summary stays.
19. **Focus model.** Confirmed. The Grid_Table is the single tab stop and exposes the Selection through `aria-activedescendant`. Grid_Cells are not tab stops.
20. **Padlock marker.** Confirmed. The padlock is the character U+1F512, a placeholder that `skin-and-sound` may replace.
21. **Duplicate level ids.** Confirmed as a documented limitation. Levels in the list that share an id share Progress.
22. **Level labels.** Confirmed. Tab labels are read defensively from the raw Level_Documents before `startRun`; after a successful start, the Level in the Run_State is the source of truth.

### Gaps between the BRIEF and the game-rules API

These are listed, not silently decided.

1. The Damage_Log exists only on the returned Action_Result. The UI must build its message at once and keep it; nothing in the Run_State can rebuild it later.
2. The game-rules read API has no "which cells changed" information. Confirmed (Decision 11): the UI compares the Value of each cell in the previous and next Run_State and marks changed cells with `data-changed`. The Grid_UI draws no flash; the animation belongs to `skin-and-sound`.
3. The BRIEF defines no message for a refused move. Confirmed (Decision 12): `blocked` and `occupied` moves are silent; every other Refusal shows the game's message text, except `locked`, which shows the UI_Strings locked text.
4. The BRIEF names a Recover button but no restart key. Confirmed: this spec adds `R`, with the confirmation of Decision 9.
5. The Game_Module re-exports the types `Value` and `Level` but not `formatValue` or `tabLabel`. The UI imports those two functions from the engine and model barrels (Decision 6).
6. `hp` can be 0 or negative after a loss. Confirmed: the status bar shows it clamped at 0; the Run_State is not changed.
7. The BRIEF says a parse error shows in the formula bar as `Col N: <message>.`. Confirmed: the game returns that text inside a Refusal with reason `parse-error`; the UI shows the Refusal message there and no other place.
8. The BRIEF has no text for a locked cell. This spec adds the UI string "This cell is locked and cannot be edited."
9. Progress (BRIEF section 3) has no defined shape. Confirmed: Requirement 12 defines it, and its reader is tolerant of bad stored data.

## Glossary

- **Grid_UI**: The complete `src/ui/` module and the `mountApp` entry point it exports.
- **Game_Module**: The finished module under `src/game/`, used only through `src/game/index.ts`.
- **Run_State**, **Action**, **Action_Result**, **Refusal**, **Damage_Log**, **Status**, **Address**, **Cell_Name**, **Locked_Flag**, **Level**, **Level_Document**, **Map_Area**, **Separator_Row**, **Rules_Panel**, **Tab_Label**: As defined in the sheet-model and game-rules specs.
- **App_Root**: The one DOM element the Grid_UI mounts into, passed to `mountApp`.
- **Grid_Table**: The DOM `<table>` that shows the Sheet.
- **Grid_Cell**: A `<td>` of the Grid_Table that stands for one Address in rows 1 to 12 or 14 to 20. There are 228 Grid_Cells.
- **Separator_Cell**: The single `<td>` of row 13 that spans columns A to L and holds the Panel_Title.
- **Panel_Title**: The UI-only text NECRONOMICELL.
- **Entity_Glyph**: `@` for the hero and `M` for a monster, drawn on top of the Cell text of the Cell the entity stands on. Entities are not Cell values.
- **Cell_Text**: The display text of a Cell: `formatValue` of the Value that `cellValue` returns.
- **Selection**: The one Address that the name box and the formula bar describe. The initial Selection is the hero Address.
- **Name_Box**: The element left of the formula bar that shows the Selection Address and its Cell_Name.
- **Formula_Bar**: The text input that shows the Raw_Text of the Selection and serves as the edit field.
- **Edit_Mode**: The state in which the Formula_Bar has focus and holds a pending text for an unlocked Selection.
- **Status_Bar**: The element that shows level title, HP, ink, turn, and the Message.
- **Message**: The one line of plain text in the Status_Bar that reports the last Refusal, the last Damage_Log summary, a confirmation prompt, or a hint.
- **Screen_State**: One of `playing`, `won` or `lost`, taken from the Status of the Run_State and published as `data-screen` on the App_Root.
- **Tab_Bar**: The row of buttons, one per level, labelled with the Tab_Label. A button is enabled when its level is cleared or is the First_Uncleared_Level.
- **First_Uncleared_Level**: The first level in list order whose id is not in `Progress.cleared`. It does not exist when all levels are cleared.
- **Progress**: The persisted record `{ version, cleared, current }` described in Requirement 12.
- **Key_Map**: The pure function that turns a keyboard event description and the current Screen_State into a UI command or an Action. It does not read the DOM.
- **Pending_Confirmation**: The short-lived UI state, held in memory only, that records which destructive command (restart of the current level, or switch to a named level) is waiting for a second matching input. It is shown as a prompt in the Message and is cleared when confirmed or cancelled.
- **Changed_Marker**: The attribute `data-changed="true"` on a Grid_Cell whose Value (the Cell_Text and the Value kind) differs between the Run_State before and the Run_State after the last accepted Action. It lasts until the next render caused by an accepted Action or a level start.
- **View_Model**: The plain data built from a Run_State that the renderer turns into DOM nodes.
- **UI_Strings**: The single file `src/ui/strings.ts` that holds every player-visible text of the Grid_UI, including the locked text and the confirmation prompts of Requirement 10.

## Requirements

### Requirement 1: Layering and Module Constraints

**User Story:** As a developer, I want the UI to touch only the DOM and the public game API, so that the rules stay testable without a browser.

#### Acceptance Criteria

1. THE Grid_UI SHALL export `mountApp` from `src/ui/index.ts` using named exports and no default export, and only `src/ui/` and the browser entry `src/main.ts` SHALL touch the DOM, where `src/main.ts` only calls `document.getElementById` to find the root and passes it to `mountApp`, and `localStorage` (through `browserStorage`), `window`, `sessionStorage` and `AudioContext` SHALL be used only inside `src/ui/`.
2. THE Grid_UI SHALL read a Run_State only through its fields and the functions `cellValue`, `cellRawText`, `isCellLocked`, `cellName`, `describeCellError`, `isPlaying` and `canUndo`, and SHALL change game state only through `applyAction` and `startRun`.
3. THE Grid_UI SHALL import from the lower layers only the barrels `src/game/index.ts`, `src/model/index.ts` and `src/engine/index.ts`, as the steering file `.kiro/steering/structure.md` requires (a layer may import any lower layer's barrel, never a deeper path), and no module under `src/game/`, `src/model/` or `src/engine/` SHALL import from `src/ui/`.
4. THE Grid_UI SHALL keep the Key_Map, the View_Model builders, the message formatters and the Progress parser in modules that reference no browser global, so that Vitest runs them without a DOM.

### Requirement 2: Mounting, Levels and Tabs

**User Story:** As a player, I want to open the page and play the levels in order, so that I can learn one idea at a time.

#### Acceptance Criteria

1. WHEN `mountApp` is called with an App_Root, a list of Level_Documents and a storage object, THE Grid_UI SHALL start the saved current level when its Tab_Bar button is enabled, otherwise the First_Uncleared_Level, or the first level when all levels are cleared, never a disabled level, and SHALL render the Tab_Bar, the Name_Box, the Formula_Bar, the Grid_Table and the Status_Bar inside the App_Root.
2. THE Grid_UI SHALL show one Tab_Bar button per level, labelled with the Tab_Label from `tabLabel`, and SHALL mark the button of the current level with `aria-current="page"`.
3. WHILE a level is neither cleared in Progress nor the First_Uncleared_Level, THE Grid_UI SHALL mark its Tab_Bar button as disabled, and SHALL leave the buttons of cleared levels and of the First_Uncleared_Level enabled, so that replaying an earlier level never disables a cleared one.
4. WHEN the player activates an enabled Tab_Bar button of a level other than the current level, THE Grid_UI SHALL start that level fresh from its Level_Document, subject to the Pending_Confirmation of Requirement 10.
5. IF `startRun` returns `ok: false` for a level, THEN THE Grid_UI SHALL show the plain text "This level could not be loaded." in the Message and SHALL NOT throw.

### Requirement 3: Grid Structure

**User Story:** As a player, I want the dungeon to look like a spreadsheet, so that reading a rule feels like reading a cell.

#### Acceptance Criteria

1. THE Grid_UI SHALL render the Sheet as a `<table>` with a header row holding an empty corner cell and the column letters `A` to `L`, and with one body row for each row number 1 to 20, each starting with a row-number header cell.
2. THE Grid_UI SHALL render each Address in rows 1 to 12 and 14 to 20 as a Grid_Cell with the attributes `data-address` (the canonical Address), `data-row`, `data-col` and `data-region` equal to `map` for rows 1 to 12 and `rules` for rows 14 to 20.
3. THE Grid_UI SHALL render row 13 as one Separator_Cell spanning columns A to L that holds the Panel_Title as text, carries `data-separator="true"` and has no `data-address`.
4. WHERE the Cell has a Cell_Name, THE Grid_UI SHALL set `data-name` on its Grid_Cell to that name.

### Requirement 4: Cell Content and Entities

**User Story:** As a player, I want to see terrain, myself and the monsters on the map, so that I can plan my route.

#### Acceptance Criteria

1. THE Grid_UI SHALL hold the Cell_Text of each Address in a child element of its Grid_Cell with the class `cell-text`, set with `textContent`, with the entity glyph (criterion 2) and the padlock (criterion 4) as further child elements, so that tests and later specs read `.cell-text`, and SHALL NOT insert Level text through `innerHTML`.
2. WHILE the hero Address equals the Address of a Grid_Cell, THE Grid_UI SHALL draw the Entity_Glyph `@` in that Grid_Cell with `data-entity="hero"`, and WHILE a monster stands on a Grid_Cell, THE Grid_UI SHALL draw `M` there with `data-entity="monster"` and `data-monster-id` set to the monster id.
3. WHEN a Grid_Cell shows an Entity_Glyph, THE Grid_UI SHALL set its `aria-label` to a sentence that names the entity, the Address and the Cell_Text underneath, for example "Hero at B3 on floor".
4. WHEN a Cell has the Locked_Flag, THE Grid_UI SHALL add a padlock marker element inside its Grid_Cell and SHALL set `data-locked="true"` on the Grid_Cell.
5. WHEN a Cell Value is an error, THE Grid_UI SHALL show the error text from `formatValue`, set `data-error` to the error kind (for example `#REF!`), and add the class `cell-error` and one class per kind: `cell-error-ref`, `cell-error-name`, `cell-error-div0`, `cell-error-value` or `cell-error-cycle`.

### Requirement 5: Selection and Name Box

**User Story:** As a player, I want to select any cell, so that I can read its formula before I change it.

#### Acceptance Criteria

1. WHEN the player clicks a Grid_Cell, THE Grid_UI SHALL make its Address the Selection and SHALL mark that Grid_Cell with `data-selected="true"` and `aria-selected="true"`, and no other Grid_Cell SHALL carry the mark.
2. WHEN the player presses Ctrl+Arrow or Command+Arrow with focus outside a text field, THE Grid_UI SHALL move the Selection one position in that direction, skip the Separator_Cell, and stay at the edge of the Sheet.
3. WHEN the Selection changes, THE Grid_UI SHALL show its Address and Cell_Name in the Name_Box, for example `B15 MOVE_M1`, and only the Address when the Cell has no Cell_Name.
4. WHEN a new Run_State is rendered, THE Grid_UI SHALL keep the Selection Address, and WHEN a level starts or restarts, THE Grid_UI SHALL reset the Selection to the hero Address.

### Requirement 6: Formula Bar

**User Story:** As a player, I want the formula bar to show the rule behind the selected cell, so that I can read it and decide what to rewrite.

#### Acceptance Criteria

1. WHILE the Grid_UI is not in Edit_Mode, THE Grid_UI SHALL show the `cellRawText` of the Selection in the Formula_Bar.
2. WHILE the Selection has the Locked_Flag, THE Grid_UI SHALL mark the Formula_Bar read-only and SHALL show the text "This cell is locked and cannot be edited." from UI_Strings next to it.
3. WHEN a Refusal with reason `parse-error` is returned, THE Grid_UI SHALL show the Refusal message, which starts with `Col N:`, in a message element beside the Formula_Bar with `role="alert"`.

### Requirement 7: Editing

**User Story:** As a player, I want to rewrite a rule and commit it, so that I can change how the dungeon behaves for one ink.

#### Acceptance Criteria

1. WHEN the player presses Enter with an unlocked Selection and focus neither in a text field nor on a button (a focused button keeps its native Enter activation, Requirement 8.3), or presses F2 with an unlocked Selection and focus outside a text field (including on a button), or double-clicks an unlocked Grid_Cell, or focuses the Formula_Bar of an unlocked Selection, THE Grid_UI SHALL enter Edit_Mode with focus in the Formula_Bar and the current Raw_Text selected.
2. IF the player tries to start an edit on a Selection with the Locked_Flag, THEN THE Grid_UI SHALL stay out of Edit_Mode and SHALL show the locked text from UI_Strings in the Message.
3. WHEN the player presses Enter in Edit_Mode, THE Grid_UI SHALL call `applyAction` with an `edit` Action for the Selection Address and the Formula_Bar text.
4. WHEN the edit Action_Result is `ok: true`, THE Grid_UI SHALL leave Edit_Mode, render the new Run_State, return focus to the Grid_Table, and show the Damage_Log summary of Requirement 9 or the text "Edited." when the log is empty.
5. IF the edit Action_Result is a Refusal, THEN THE Grid_UI SHALL show a Refusal message with reason `parse-error` only in the alert element of Requirement 6.3 and leave the Message unchanged, SHALL show the message of every other Refusal in the Message (the locked text from UI_Strings for reason `locked`) with no alert, SHALL stay in Edit_Mode with the typed text unchanged for the reasons `parse-error`, `no-ink` and `bad-address`, and SHALL leave Edit_Mode and restore the Raw_Text for the reasons `unchanged`, `locked`, `reserved-row`, `not-playing`, `invalid-action` and `internal-error`.
6. WHEN the player presses Escape in Edit_Mode, THE Grid_UI SHALL restore the Raw_Text of the Selection, leave Edit_Mode, return focus to the Grid_Table and call no Action, so that cancelling costs no ink.
7. WHEN the Formula_Bar loses focus while in Edit_Mode, THE Grid_UI SHALL leave Edit_Mode, restore the Raw_Text of the Selection and call no Action, so that no ink is spent.

### Requirement 8: Keyboard Play

**User Story:** As a player, I want to play with the keyboard alone, so that the game feels like a roguelike.

#### Acceptance Criteria

1. THE Grid_UI SHALL map ArrowUp, ArrowDown, ArrowLeft and ArrowRight without modifier keys to the move Actions `N`, `S`, `W` and `E`, and Space to the wait Action.
2. THE Grid_UI SHALL map `u`, `U`, Ctrl+Z and Command+Z to the undo Action, `r` and `R` to restart the current level (a Pending_Confirmation while the Status is `playing`, an immediate restart otherwise), and `n` and `N` to the next level, the last only on the won screen when a next level exists, and all only when focus is not in a text field.
3. WHILE focus is in an input, a textarea or a select, or on a button, THE Grid_UI SHALL ignore the game keys of criteria 1 and 2 so that typing and button activation keep their normal behaviour.
4. THE Grid_UI SHALL call `preventDefault` only for a key that the Key_Map handled, so that Tab, browser shortcuts, page scrolling from unhandled keys and text-field editing keep their default behaviour.
5. WHILE the Status is `won` or `lost`, THE Grid_UI SHALL apply no move, wait, edit or undo Action from the keyboard and SHALL accept `r` (restart at once), `n` on the won screen when a next level exists, and selection movement.
6. WHEN a move Action returns a Refusal with reason `blocked` or `occupied`, THE Grid_UI SHALL show no message and keep the previous Run_State rendered, and WHEN a move or wait Action returns any other Refusal, THE Grid_UI SHALL show its message in the Message and keep the previous Run_State rendered.

### Requirement 9: Status Bar and Messages

**User Story:** As a player, I want to see HP, ink and what just happened, so that I can judge each next step.

#### Acceptance Criteria

1. THE Grid_UI SHALL show in the Status_Bar the Tab_Label, `HP` as `hp` clamped at 0 over `level.startingHp`, `Ink` as `ink` over `level.ink`, and `Turn` as `turn`.
2. WHEN a Turn_Action is accepted and its Damage_Log is not empty, THE Grid_UI SHALL set the Message to the total and the sources in log order, for example "-3 HP: M1 hit you; trap" where a `monster` entry reads "<id> hit you", a `trap` entry reads "trap", and a `haunt` entry reads "haunted".
3. WHEN an undo is accepted, THE Grid_UI SHALL set the Message to "Undone.".
4. WHEN a level starts or restarts, or a move or wait is accepted and its Damage_Log is empty, THE Grid_UI SHALL set the Message to the level `hint`, so that a stale damage line does not stay; WHEN the accepted Action leaves the Status `lost`, the damage summary of criterion 2 stays.
5. THE Grid_UI SHALL render the Message in an element with `role="status"` and `aria-live="polite"`.

### Requirement 10: Buttons, Confirmation and Screen States

**User Story:** As a player, I want clear controls, protection from losing a run by accident, and a clear end state, so that I always know what I can do next.

#### Acceptance Criteria

1. THE Grid_UI SHALL render an Undo button that is disabled unless `canUndo` is true, and a Recover button that restarts the current level, and both SHALL be reachable and operable by keyboard.
2. THE Grid_UI SHALL set `data-screen` on the App_Root to `playing`, `won` or `lost` from the Status of the current Run_State.
3. WHILE the Status is `playing`, WHEN the player activates Recover, presses `r` or `R`, or activates an enabled Tab_Bar button of another level, THE Grid_UI SHALL start a Pending_Confirmation and set the Message to the prompt from UI_Strings ("Restart this level? Press R or Enter to confirm, Escape to cancel." for a restart, and the equivalent "Switch to <Tab_Label>? Press Enter to confirm, Escape to cancel." for a level switch); WHEN the player then repeats the same command (the same button activation, `r` or `R` for a restart, or Enter), THE Grid_UI SHALL carry it out; and WHEN the player presses Escape or any other key, or clicks anywhere other than the control that started it, THE Grid_UI SHALL clear the Pending_Confirmation, restore the Message that was shown before the prompt, and apply no Action.
4. WHILE the Screen_State is `won`, THE Grid_UI SHALL show the plain text "Changes saved." in the Message area, or "Workbook saved. Your soul was not." on the last level, with a Next level button when a next level exists, and WHILE it is `lost`, THE Grid_UI SHALL show the plain text "#REF! of the Dead" and "GRIMSHEET.XLS has stopped responding"; and WHILE the Screen_State is `won` or `lost`, THE Grid_UI SHALL carry out Recover, `r` and a Tab_Bar switch at once with no Pending_Confirmation.

### Requirement 11: Rendering Rules

**User Story:** As a developer, I want rendering to be a pure function of the Run_State, so that the screen never disagrees with the game.

#### Acceptance Criteria

1. WHEN an Action is accepted, THE Grid_UI SHALL replace its held Run_State with the returned one and re-render every Grid_Cell, the Status_Bar, the Name_Box, the Formula_Bar and the buttons from that Run_State.
2. WHEN an Action is accepted, THE Grid_UI SHALL compare the Cell_Text and the Value kind of every Cell between the previous and the returned Run_State, SHALL set the Changed_Marker on each Grid_Cell that differs, and SHALL remove every earlier Changed_Marker, so that no marker survives the next render caused by an accepted Action or a level start.
3. THE Grid_UI SHALL NOT write to any Run_State, Level or array that it receives from the Game_Module.
4. THE Grid_UI SHALL catch any exception thrown by its own event handlers, show "Something went wrong." in the Message and keep the previous Run_State rendered, so that no input sequence leaves the page unresponsive.

### Requirement 12: Progress Persistence

**User Story:** As a player, I want my cleared levels remembered, so that I can come back later.

#### Acceptance Criteria

1. THE Grid_UI SHALL persist Progress under the storage key `grimsheet.progress` as JSON `{ "version": 1, "cleared": [<level id>...], "current": <level id> }`, and SHALL persist no mid-run state.
2. WHEN a Run_State reaches Status `won`, THE Grid_UI SHALL add the level id to `cleared` without duplicates and write Progress, and WHEN a level starts, THE Grid_UI SHALL write its id as `current`.
3. IF the stored text is missing, is not valid JSON, has another `version`, or has fields of the wrong type, THEN THE Grid_UI SHALL start with empty Progress, and SHALL drop level ids that match no level in the supplied list.
4. IF the storage object throws on read or write, THEN THE Grid_UI SHALL continue with Progress kept in memory and SHALL NOT throw.

### Requirement 13: Accessibility

**User Story:** As a player who uses a keyboard or a screen reader, I want to operate and understand the game, so that nothing depends on a mouse or on colour.

#### Acceptance Criteria

1. THE Grid_UI SHALL give the Grid_Table `role="grid"` with an `aria-label`, give each Grid_Cell `role="gridcell"`, and show a visible focus indicator on every focusable control and on the selected Grid_Cell.
2. THE Grid_UI SHALL convey locked, error and entity state by text or marker as well as by class, so that no state depends on colour alone.
3. THE Grid_UI SHALL hard-code no text colour pair below WCAG AA contrast (4.5:1), and full WCAG validation with assistive technologies and expert review remains a manual task outside this spec.

### Requirement 14: Hooks for Later Specs

**User Story:** As the author of `error-monsters` and `skin-and-sound`, I want stable markup, so that I can style and extend it without changing the UI logic.

#### Acceptance Criteria

1. THE Grid_UI SHALL keep the attribute and class names of Requirements 3, 4 and 5, the attribute `data-changed` of Requirement 11, and the ids `status-bar`, `name-box`, `formula-bar`, `message`, `tab-bar` and `grid-table` stable, and SHALL attach every player-visible style to classes and data attributes and not to inline styles.
2. THE Grid_UI SHALL read all player-visible text, including the locked text and the confirmation prompts, from UI_Strings in `src/ui/strings.ts`, so that tone is tuned in one place.
3. THE Grid_UI SHALL provide an empty element with `id="screen-overlay"` inside the App_Root for later screens, and SHALL use no animation, so that `prefers-reduced-motion` needs no handling yet.

### Requirement 15: Testing and Source Constraints

**User Story:** As a developer, I want the UI tested without guesswork, so that regressions show up on save.

#### Acceptance Criteria

1. THE Grid_UI test suite SHALL use Vitest with the `happy-dom` environment, added as an exact-pinned dev dependency with no `^` or `~` range, for unit tests that mount the UI, and SHALL run the Key_Map, View_Model, formatter and Progress parser tests without a DOM environment.
2. THE Grid_UI test suite SHALL include Playwright end-to-end tests for two flows, run against a fixture level list under `tests/fixtures/` loaded through a test-only entry and not against `src/levels/`: walk to the exit and win with a saved Progress entry after a reload, and edit a rule cell, hit a Refusal, fix it and see ink decrease by 1.
3. THE Grid_UI source SHALL use kebab-case file names, named exports, no `eval`, no `new Function`, no `Math.random`, no `Date.now`, no external fonts or network requests, no real product names or trademarks, and no AI tool name other than Kiro.
