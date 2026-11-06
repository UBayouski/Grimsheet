# Requirements Document

## Introduction

`error-monsters` is spec 5 of 8 in `docs/BRIEF.md` section 12. It covers how errors look and behave in the browser. The game effects already exist in `game-rules`: every error Value blocks movement, and `#CYCLE!` also haunts for 1 HP per turn. This spec only shows them.

The spec adds, on top of the finished `grid-ui` (all six top-level tasks are done; `src/ui/` holds `app.ts`, `render.ts`, `view-model.ts`, `types.ts`, `strings.ts` and the other modules, and `src/styles/grid-ui.css` exists):

- A look for each of the five error kinds: coffin, blank tombstone, crack into the void, wilted grey cell, ghost.
- The cause of the error in plain English, on hover and on keyboard selection.
- A ghost that drifts along the cells of a circular reference and stops when the cycle is broken.
- Reduced-motion behaviour for all of it.

The cause text is never written by the UI. It comes from `describeCellError` in the game barrel. The engine produces the wording of the BRIEF example for a cell without a name: `makeError` builds `<origin> <text>`, and `evaluator.ts` passes `refers to M30, which does not exist`, so cell `B9` gives `B9 refers to M30, which does not exist`. When the origin cell has a Cell_Name the engine writes `B9 (NAME) refers to ...`. This is not a gap.

### Decisions

Every row is Confirmed. D1 to D13 were approved as drafted, except where D10, D12 and the rules in D14 and D15 say otherwise. The requirements below are written against them.

| # | Decision | Reason | Status |
| --- | --- | --- | --- |
| D1 | **Drawing technique: CSS classes and pseudo-elements, with shapes drawn by CSS (borders, gradients, `clip-path`) and no emoji or pictograph characters.** Recommended over inline SVG and over an in-code pixel bitmap. | `grid-ui` has no inline styles and no `innerHTML`. Inline SVG would add `createElementNS` nodes to 228 cells and attribute churn on every render. A bitmap drawn as `box-shadow` needs a generated `style` value or a very large stylesheet and is hard to tune. Pseudo-elements add no DOM nodes, change only through classes and data attributes, and cost nothing in the accessibility tree. Pictograph characters such as a coffin or tombstone emoji have uneven font coverage on the system monospace stack. | Confirmed |
| D2 | **Hover mechanism: the native `title` attribute on the error cell.** A custom tooltip element was rejected. | `title` needs no script, no timer and no inline style. Browsers expose it as the accessible description of the cell, which screen readers read when `aria-activedescendant` moves to it. A custom tooltip needs hover and focus handlers, positioning, a delay timer and `aria-describedby` plumbing, and the module scan keeps the DOM work in two files. The weakness of `title` (no keyboard access, browser-controlled delay) is covered by D3. | Confirmed |
| D3 | **Keyboard and selection: a visible explanation line `#cell-explanation` next to the Formula_Bar, not a live region.** The Formula_Bar adds the line to its `aria-describedby`. | Ctrl+Arrow moves the Selection often. A live region would announce on every move. The `title` of the active cell already gives screen readers the description when the active descendant changes. The line serves sighted keyboard players. | Confirmed |
| D4 | **Cycle_Cell means a cell whose Value is `#CYCLE!` and whose `origin` equals its own Address.** This narrows the wording of the request ("Value is the `#CYCLE!` error kind"). | The engine propagates `#CYCLE!` downstream (`recalculator.test.ts`, "propagates #CYCLE! downstream": `A1=A1`, `B1=A1+1`, `C1=B1*2` all show `#CYCLE!`, but `listCycleCells` returns only `A1`). A kind-only scan would send the ghost into cells that are not on the cycle and disagree with the haunting rule. Downstream cells still get the `#CYCLE!` look, only the ghost skips them. | Confirmed |
| D5 | **Ghost speed: one step per 800 ms, from a `setInterval` in `app.ts`.** | A CSS animation with `steps()` cannot hop between cells. `setInterval` and `setTimeout` are not on the module-scan deny-list, so no new allowance is needed. | Confirmed |
| D6 | **The ghost is drawn by `td[data-ghost]::after`, not by an overlay element.** | One attribute write per step, no DOM nodes, no layout work. | Confirmed |
| D7 | **Reduced motion is read through an optional `matchMedia` member of `MountOptions`, defaulting to `root.ownerDocument.defaultView?.matchMedia`.** If neither exists the ghost is treated as still. | The module scan forbids the identifier `window` in `render.ts` and `app.ts`, so `window.matchMedia` is not allowed. `defaultView` is allowed. An injected function lets tests control the preference. | Confirmed |
| D8 | **New files: `src/ui/error-look.ts` (pure) and `src/styles/error-monsters.css`.** `ERROR_CLASS` moves into `error-look.ts` and `render.ts` re-exports it under the same name. | Keeps `render.ts` small and keeps the mapping testable in Node. This changes the file list asserted by `src/ui/module.test.ts` (cross-spec change, listed in Requirement 8). | Confirmed |
| D9 | **The e2e fixture is a separate HTML entry `tests/fixtures/errors.html` with `tests/fixtures/errors-main.ts` and `tests/fixtures/errors.ts`.** | `src/ui/fixture-levels.test.ts` asserts that `FIXTURE_LEVELS` has length 2, and the `grid-ui` flows depend on that list. A separate entry leaves both alone. | Confirmed |
| D10 | **Error text stays visible in the cell at a smaller font size so the longest kind, `#DIV/0!`, fits the 2.5rem cell without clipping. The fit is checked in the Playwright flow of Requirement 9.4 on a cell with no entity.** | `grid-ui.css` clips cell text at the cell edge. The text must stay readable for sighted players. | Confirmed |
| D11 | **Property-based testing is not enabled.** | The domain of the ghost step is at most 240 addresses, so one exhaustive example loop gives the same coverage. The class mapping has five inputs and one unknown case. | Confirmed |
| D12 | **No screenshots were taken while writing this spec. Screenshots with the Playwright MCP are taken only after `levels` task 5.1 has put the real levels into the app; until then the e2e fixture `errors.html` is the only way to see error cells.** | No app level produces an error cell yet, so the running app shows nothing to capture. The screenshots under `.playwright-mcp/` belong to `grid-ui`. | Confirmed |
| D13 | **All five error cells keep the blocking look; cells that are on a cycle add the haunted mark and the ghost.** | The terrain rule in `product.md` says any error blocks movement, so a `#CYCLE!` cell on the map blocks as well. The BRIEF table lists `#CYCLE!` only as a haunter. | Confirmed |
| D14 | **An entity on an Error_Cell is drawn on top of the error look; the Cell_Text may be hidden under the Entity_Glyph.** The existing `grid-ui.css` rule that hides `.cell-text` when `[data-entity]` is set stays as it is, and no override is added. The Entity_Glyph on an error cell uses a transparent background with a `text-shadow` halo, and the `.cell-text` carries the cell background, so the error look stays visible around the glyph. | The error background, border and shape stay visible around the glyph, which is enough to show that the cell is an error. The cause stays available through the `title` and `#cell-explanation`, and the `aria-label` of an entity cell is unchanged. | Confirmed |
| D16 | **The Reduced_Motion preference is read with `addEventListener` only, with no legacy `addListener` fallback; when `addEventListener` is missing, the preference is read once at mount and not watched.** | `addListener` is deprecated and unneeded on the supported browsers, and reading once at mount keeps the behaviour defined when no listener API exists. | Confirmed |
| D15 | **Restart detection is resolved in the design.** The Ghost resets only when `run.level` is a different object than the previous render (a reference change, which `startRun`, restart and level-switch produce and which a move, a wait, an edit and undo do not), or when the set of Cycle_Cells differs from the previous render. Requirement 5.4 stays the observable rule. | The code has no restart hook, so the mechanism must come from state the render already sees, and undoing the first turn must not move the Ghost. The design decides it. | Confirmed |

## Glossary

- **Error_Look**: The set of CSS classes, pseudo-elements, attributes and one explanation line that this spec adds to the Grid_UI.
- **Grid_UI**: The browser layer under `src/ui/`, as defined in the `grid-ui` spec.
- **Grid_Cell**: A `td` with a `data-address` attribute in the Grid_Table.
- **Error_Cell**: A Grid_Cell whose Value is of kind `error`. It carries `data-error` with the ErrorKind.
- **Cell_Text**: The `.cell-text` child of a Grid_Cell, holding the `formatValue` text.
- **Entity_Glyph**: The `.entity-glyph` child of a Grid_Cell, present when the hero or a monster stands on it.
- **Cause_Text**: The string returned by `describeCellError` for an Error_Cell.
- **Cause_Fallback**: The string `STRINGS.errorCauseFallback`, used when `describeCellError` returns `undefined` for an Error_Cell.
- **Explanation_Line**: The element `#cell-explanation` in the formula row that shows the Cause_Text of the selected Grid_Cell.
- **Cycle_Cell**: A Grid_Cell whose Value is `#CYCLE!` and whose `origin` equals the Grid_Cell's own Address (Decision D4).
- **Haunted_Cell**: Any Error_Cell whose ErrorKind is `#CYCLE!`, including cells downstream of a cycle.
- **Ghost**: The moving marker drawn on one Cycle_Cell at a time by `td[data-ghost]::after`.
- **Ghost_Interval**: 800 ms, the time between two Ghost steps.
- **Ghost_Note**: The element `#ghost-note`, a visually hidden static description of the Ghost, with no live-region role.
- **Reduced_Motion**: The state in which the media feature `prefers-reduced-motion: reduce` matches, or in which the preference cannot be read (Decision D7).
- **Error_Look_Module**: `src/ui/error-look.ts`, a pure module with no browser global.
- **Look_Table**: The table in Requirement 1 that names the visual idea of each ErrorKind.
- **Game_Barrel**, **Engine_Barrel**: `src/game/index.ts` and `src/engine/index.ts`.
- **Module_Scan**: The test `src/ui/module.test.ts`.
- **Stable_Hooks**: The class names, attributes and element ids that `skin-and-sound` may style and must not need to rename.

## Requirements

### Requirement 1: A Look for Each Error Kind

**User Story:** As a player, I want each kind of error to look like its own monster, so that I can tell a coffin from a tombstone at a glance and without relying on colour.

The Look_Table (shapes are drawn by CSS, Decision D1):

| ErrorKind | Class | Visual idea |
| --- | --- | --- |
| `#REF!` | `cell-error-ref` | A coffin: a tall six-sided outline, wider at the shoulders. |
| `#NAME?` | `cell-error-name` | A tombstone: a rounded-top slab with an empty engraved plate and no name. |
| `#DIV/0!` | `cell-error-div0` | A crack into the void: a black cell with a jagged vertical fissure. |
| `#VALUE!` | `cell-error-value` | A wilted grey cell: grey fill, dashed border, drooping bottom corners. |
| `#CYCLE!` | `cell-error-cycle` | A haunted cell: dotted wavy border and a wisp mark (the Ghost is added by Requirement 5). |

#### Acceptance Criteria

1. WHEN a Grid_Cell holds an error Value in any row, THE Error_Look SHALL style it with the class from the Look_Table for its ErrorKind in addition to the existing classes `cell` and `cell-error`, and SHALL draw the visual idea of the Look_Table with CSS pseudo-elements.
2. WHILE a Grid_Cell is an Error_Cell and no Entity_Glyph covers it, THE Error_Look SHALL keep the Cell_Text visible with the `formatValue` text of the error, and the Cell_Text SHALL fit inside the cell without clipping (its `scrollWidth` is at most its `clientWidth`) for the longest text `#DIV/0!`.
3. THE Error_Look SHALL give each of the five ErrorKinds a silhouette that differs from the other four, so that the kind is identifiable without colour.
4. IF an Error_Cell carries an ErrorKind that has no entry in `ERROR_CLASS`, THEN THE Error_Look SHALL show the class `cell-error` with a generic grave look and the Cell_Text.
5. WHILE an Error_Cell holds the hero or a monster, THE Error_Look SHALL draw the Entity_Glyph on top of the error look (background, border and shape unchanged), SHALL leave the `aria-label` of the Grid_Cell unchanged, and SHALL carry the Cause_Text in the `title` (Decision D14), where the Cell_Text may be hidden under the Entity_Glyph.

### Requirement 2: Drawing Constraints and Contrast

**User Story:** As a maintainer, I want the looks to be built only from code and CSS, so that the game needs no assets, no network and no new dependency.

#### Acceptance Criteria

1. THE Error_Look SHALL be drawn only by rules in `src/styles/error-monsters.css`, using classes, data attributes and pseudo-elements, with no `url(`, no `@import`, no `http` text, no image file, no font file, no `style` attribute, no new entry in `package.json` and no real product name, logo or trademark.
2. THE stylesheet SHALL define each error text colour and its background colour as a pair of custom properties, and every pair SHALL have a contrast ratio of at least 4.5 to 1 in the light and in the dark colour scheme.

### Requirement 3: Cause Text on Hover

**User Story:** As a player, I want to hover an error cell and read its cause in plain English, so that I know what to fix.

#### Acceptance Criteria

1. WHEN the Grid_UI renders an Error_Cell, THE Grid_UI SHALL set its `title` attribute, with an attribute setter and not `innerHTML`, to the Cause_Text read from `describeCellError` on that render, without rewording or caching it.
2. WHEN a Grid_Cell is not an Error_Cell, THE Grid_UI SHALL remove its `title` attribute, and IF `describeCellError` returns `undefined` for an Error_Cell, THEN THE Grid_UI SHALL set the `title` to the Cause_Fallback.
3. WHEN cell `B9` holds `=M30`, THE Grid_UI SHALL show `B9 refers to M30, which does not exist` as its `title`.

### Requirement 4: Explanation on Selection and Keyboard Focus

**User Story:** As a keyboard or screen reader player, I want the same explanation when I select an error cell, so that hovering is not required.

#### Acceptance Criteria

1. THE Grid_UI SHALL contain one Explanation_Line with the id `cell-explanation` and the class `cell-explanation` inside the formula row.
2. WHEN the Selection changes by a click, by Ctrl+Arrow or by Command+Arrow, or the selected cell changes Value, and the selected Grid_Cell is an Error_Cell, THE Grid_UI SHALL set in the same render the text of the Explanation_Line to the Cause_Text with `textContent` and `data-error` to the ErrorKind.
3. WHEN the selected Grid_Cell is not an Error_Cell, THE Grid_UI SHALL empty the Explanation_Line, remove its `data-error` and set its `hidden` property.
4. THE Explanation_Line SHALL carry no `role` and no `aria-live` attribute, and the Formula_Bar `aria-describedby` SHALL list `cell-explanation` after the existing ids.

### Requirement 5: Cycle Cells and Ghost Placement

**User Story:** As a player, I want a ghost on the haunted cells, so that I see which cells haunt me.

#### Acceptance Criteria

1. THE Grid_UI SHALL list the Cycle_Cells in reading order (row first, then column) in the view model on every render.
2. WHILE at least one Cycle_Cell exists, THE Grid_UI SHALL set `data-ghost="true"` on exactly one Cycle_Cell and on no other Grid_Cell, which for a single Cycle_Cell is that cell.
3. WHEN no Cycle_Cell exists after a render, THE Grid_UI SHALL remove `data-ghost` from every Grid_Cell.
4. WHEN `run.level` is a different object than the previous render (a reference change, which `startRun`, restart and level-switch produce and which a move, a wait, an edit and undo do not), or the set of Cycle_Cells differs from the previous render, THE Grid_UI SHALL place the Ghost on the first Cycle_Cell in reading order, using the detection mechanism chosen in the design (Decision D15) and no new hook.
5. THE Grid_UI SHALL give every Haunted_Cell the class `cell-error-cycle` and the haunted mark of the Look_Table, including cells downstream of a cycle that are not Cycle_Cells.

### Requirement 6: Ghost Drift

**User Story:** As a player, I want the ghost to drift along the cycle, so that the haunting feels alive without distracting me.

#### Acceptance Criteria

1. WHILE two or more Cycle_Cells exist and Reduced_Motion is off, THE Grid_UI SHALL move the Ghost to the next Cycle_Cell in reading order once every Ghost_Interval, returning to the first Cycle_Cell after the last.
2. WHEN a render leaves no Cycle_Cell, THE Grid_UI SHALL stop the Ghost timer and remove the Ghost in that render.
3. WHEN `destroy()` is called, THE Grid_UI SHALL clear the Ghost timer and remove the listener for the Reduced_Motion preference, and no Ghost step SHALL run afterwards; WHEN the run's level changes, THE Grid_UI SHALL clear the Ghost timer and SHALL start it again only if the new level has two or more Cycle_Cells and Reduced_Motion is off.
4. WHEN the Ghost moves, THE Grid_UI SHALL change only the `data-ghost` attribute, so that the position and size of every Grid_Cell and of the Grid_Table stay the same.
5. THE Grid_UI SHALL draw the moving Ghost glyph only in a pseudo-element, and the Ghost_Note, with the id `ghost-note`, no `role` and no `aria-live` attribute, named by the Grid_Table `aria-describedby`, SHALL hold one static sentence that gives the number of Cycle_Cells, set only when the set of Cycle_Cells changes and emptied when it becomes empty.

### Requirement 7: Reduced Motion

**User Story:** As a player who prefers less motion, I want a still ghost and no animation, so that the game is comfortable to play.

#### Acceptance Criteria

1. WHILE Reduced_Motion is on, THE Grid_UI SHALL keep the Ghost on the first Cycle_Cell and SHALL run no Ghost timer, and WHEN the preference changes while the app is mounted, THE Grid_UI SHALL start or stop the timer in the same task without a remount.
2. THE Grid_UI SHALL read the preference through the `matchMedia` member of `MountOptions` when given, otherwise through `root.ownerDocument.defaultView`, and SHALL treat an unreadable preference as Reduced_Motion.
3. THE stylesheet SHALL disable every animation and transition of the Error_Look under `@media (prefers-reduced-motion: reduce)`, with the static looks of Requirement 1 unchanged.

### Requirement 8: Files, Hooks and Layering

**User Story:** As a maintainer, I want a clear place for each part, so that the layering rules hold and `skin-and-sound` can build on stable names.

#### Acceptance Criteria

1. THE Error_Look_Module SHALL be `src/ui/error-look.ts` with named exports only and no browser global, importing only sibling pure files, `./types` and the three barrels, and exporting exactly `ERROR_CLASS`, `GHOST_INTERVAL_MS`, `isCycleCell`, `cycleCellsOf`, `sameCells`, `nextGhostCell` and `placeGhost`, where `isCycleCell` tests whether a Grid_Cell is a Cycle_Cell (Decision D4), `cycleCellsOf` returns the Cycle_Cells in reading order with downstream cells excluded, `sameCells` tests two Cycle_Cell lists for equality, `nextGhostCell` returns the Cycle_Cell after the current one in reading order, the first when the current one is `undefined` or not listed, the first after the last, and `undefined` for an empty list, and `placeGhost` returns where the Ghost sits after a render per the state machine of Decision D15.
2. THE `render.ts` module SHALL re-export `ERROR_CLASS` from the Error_Look_Module under the same name, and SHALL keep every existing class, attribute and id of `grid-ui` unchanged.
3. THE Grid_UI SHALL add exactly these Stable_Hooks: `title` on Error_Cells, `data-ghost` on one Cycle_Cell, the element `#cell-explanation` with class `cell-explanation` and `data-error`, the element `#ghost-note` with class `visually-hidden`, and the stylesheet `src/styles/error-monsters.css`.
4. THE Grid_UI SHALL add `cause` to `CellView`, `explanation` and `ghostCells` to `ViewModel`, an optional `matchMedia` to `MountOptions`, and a `setGhost` method to `View`, and all player-visible strings (Cause_Fallback and the Ghost_Note sentence) SHALL live in `src/ui/strings.ts`.
5. WHEN this spec is implemented, THE Grid_UI SHALL update the cross-spec items: the expected file list in the Module_Scan gains `error-look`, the Module_Scan stylesheet checks cover `error-monsters.css`, `src/main.ts` and the fixture entries import `error-monsters.css`, and the Module_Scan entry list gains `tests/fixtures/errors-main.ts`.
6. THE new and changed `src/ui/` files SHALL contain no `eval`, `new Function`, `Math.random`, `Date.now`, `new Date`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `style` attribute write, `window` identifier or AI tool name other than Kiro.

### Requirement 9: Tests

**User Story:** As a maintainer, I want the looks, text and ghost covered by fast tests and one browser test, so that regressions show up on save.

#### Acceptance Criteria

1. THE Error_Look_Module tests SHALL run in the Node environment and SHALL cover every ErrorKind in `ERROR_CLASS`, an unknown kind, `cycleCellsOf` with a downstream cell excluded, and `nextGhostCell` for order, wraparound, one cell, an unlisted current cell and an empty list, including a loop over every list length from 0 to 240.
2. THE render tests SHALL run in the happy-dom environment and SHALL check the classes, `data-error`, `title`, the Explanation_Line, the Ghost_Note, an error cell with an entity, and that no `style` attribute appears and markup in a cause shows as text.
3. THE timer tests SHALL use Vitest fake timers and an injected `matchMedia` stub and SHALL check that the Ghost moves each Ghost_Interval, stops when the cycle is broken, stops on `destroy()`, and stays on the first Cycle_Cell under Reduced_Motion, including a preference change at run time.
4. THE Playwright test SHALL be one flow on `/tests/fixtures/errors.html`, whose level `03-fixture-errors` has `B9` as `=M30`, `D9` as `=FOO(1)`, `F9` as `=1/0`, `H9` as `="a"+1`, and `J9` and `K9` as `=K9` and `=J9`, a hero on a floor cell and no monster, so that the level passes `startRun`, and SHALL check the classes and `data-error` of the five cells, the `title` of `B9`, the Explanation_Line after selecting each error cell with Ctrl+Arrow, the Ghost on `J9` then `K9`, the removal of `data-ghost` after an edit of `K9` to `0`, the fit of the longest text (`scrollWidth` at most `clientWidth`, measured with `page.evaluate` on the `.cell-text` element of the `=1/0` cell `F9`, which holds no entity), and, under `page.emulateMedia({ reducedMotion: 'reduce' })`, the Ghost staying on `J9`.


### Requirement 10: Scope Boundary with skin-and-sound

**User Story:** As the author of `skin-and-sound`, I want to know what this spec leaves to me, so that the two specs do not overlap.

#### Acceptance Criteria

1. THE Error_Look SHALL provide the five error looks, the Cause_Text on hover and selection, the Ghost and its reduced-motion behaviour, and the `skin-and-sound` spec SHALL own any error or Ghost sound, the window frame, bevels, fonts and page colours, the title and death screens, the flash of changed cells, the final palette and contrast tuning, and any replacement of the CSS shapes by real sprites.

Full WCAG validation needs manual testing with assistive technologies and expert review; the automated checks here cover the contrast floor of Requirement 2 and the text equivalents only.
