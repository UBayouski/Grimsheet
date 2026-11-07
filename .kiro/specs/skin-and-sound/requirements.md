# Requirements Document

## Introduction

`skin-and-sound` is spec 7 of 8 in `docs/BRIEF.md` section 12, the last feature spec before `hosting` is finished. It changes how Grimsheet looks and sounds and nothing else. No game rule, engine function, model type or level file changes.

The finished specs it builds on: `grid-ui` (all tasks done), `levels` (all tasks done, the real five levels are in `src/main.ts`), `error-monsters` (all tasks done). `hosting` is partly done (`render.yaml` exists, the live site is `https://grimsheet.onrender.com`; tasks 1.2 and later are open). What exists today under `src/ui/`: `app.ts`, `render.ts`, `controller.ts`, `view-model.ts`, `key-map.ts`, `messages.ts`, `progress.ts`, `confirmation.ts`, `error-look.ts`, `strings.ts`, `types.ts`, `index.ts`, with `src/styles/grid-ui.css` and `src/styles/error-monsters.css`. There is no `public/` folder, no font file, no icon, no sound code and no title screen.

This spec adds:

- Late-1990s window chrome (BRIEF section 8) in plain CSS.
- One self-hosted open-licensed pixel font.
- Padlocks only where they carry meaning.
- Three small animations: changed-cell flash, hero slide, damage shake.
- A title splash and styled death and win dialogs.
- Five short square-wave beeps from Web Audio and a persistent mute toggle.
- A favicon that fixes the current 404.
- A set of README screenshots, taken last.

### Background: what the browser shows today

Captured with the Playwright MCP on a Vite dev server, viewport 1280 by 800, on the real entry (`/`) and on the fixture page `/tests/fixtures/errors.html`. The saved progress of the MCP browser profile put the app on Sheet4: The Trap Row. The temporary screenshots and the dev server are gone.

- **Page.** White page, no frame. The title "GRIMSHEET.XLS" is plain monospace text at the top left. The body font computes to the browser default serif (`Times New Roman`); only `.grimsheet-app` has the system monospace stack.
- **Tabs.** The five sheet tabs are default grey browser buttons in a row directly under the title, above the formula bar. DOM order is title, tabs, formula row, toolbar, grid, ghost note, end banner, status bar, overlay.
- **Formula row.** The name box ("B6") is plain text. The formula bar is a plain white input. The locked note ("This cell is locked and cannot be edited.") sits to its right in bold.
- **Toolbar.** Undo (greyed) and Recover are default browser buttons on their own row.
- **Grid.** A white table with thin grey gridlines, a 3 px blue focus ring around the whole table, bold selection outline on B6. Every one of the 144 map cells and the 6 locked rules cells (150 locked cells in all) carries a small colour padlock emoji at the top right. On a map of terrain that never changes, the padlocks are noise.
- **Rules panel.** The labels in column A are clipped to four characters ("Trap", "Rati", "Load", "Divi"), because a cell is 2.5rem (40 px) wide. The `#DIV/0!` cell shows the CSS crack shape with 0.5rem text.
- **Status bar.** It is below the fold at 800 px height. On the errors fixture its top edge is at y 946 and the page is 1013 px tall. Its text content runs together ("Sheet4: The Trap RowHP 5/5Ink 1/1Turn 0..."); only flex gap separates the spans.
- **Screens.** `#end-banner` is hidden while playing and, by its CSS, would be a plain 2 px bordered box. `#screen-overlay` is empty. There is no title screen.
- **Console and network.** One error: `GET /favicon.ico` returns 404. The page has no `<link rel="icon">`.
- **Motion.** The `data-changed` marker exists but no CSS uses it. Only the error-monsters ghost animates.
- **Not captured.** The death and win screens were not reached in this session; their description comes from the code (`render.ts`, `controller.ts`). The fixture page `/tests/fixtures/index.html` uses the same markup and CSS as `/`.

### Decisions

Decisions D1 to D21, all marked **Confirmed**. The requirements below are written against them. Change a decision and the affected criteria change with it.

| # | Decision | Reason | Status |
| --- | --- | --- | --- |
| D1 | **Window buttons are decorative.** Three spans drawn by CSS, `aria-hidden="true"`, no handlers, not focusable. | A real close button would have to do something. Inert shapes add no keyboard stop and no false control. | Confirmed |
| D2 | **Sheet tabs move to the bottom by moving the `<nav id="tab-bar">` in `render.ts`**, to sit after the table and before the status bar. No CSS `order`. | Visual order, DOM order and Tab order stay equal. Cost: Tab order becomes toolbar, grid, tabs. The ids, `data-control`, `aria-current` and `disabled` rules are unchanged. | Confirmed |
| D3 | **Font: VT323** by Peter Hull, SIL OFL 1.1, from `google/fonts` `ofl/vt323`. One weight, monospace, subsets latin, latin-ext, vietnamese. See Requirement 2. | The only candidate checked that is monospace, pixel-style, open-licensed and covers all game glyphs. | Confirmed |
| D4 | **`@font-face` lives in a new `src/styles/fonts.css`.** It is the only stylesheet allowed to contain `url(`, and only as `url('/fonts/<name>.ttf')`. | Keeps the two existing stylesheet scans intact and makes the font exception one precise rule. | Confirmed |
| D5 | **Padlocks are not rendered for `data-region="map"`.** The span is built in `render.ts` only for locked cells of the rules region, and it is drawn by CSS (no emoji character). `data-locked` and `aria-readonly` stay on every locked cell. | The formula bar and the styling still need the lock state. Only the marker is noise. The BRIEF-era placeholder (grid-ui Decision 20) is replaced. | Confirmed |
| D6 | **Motion durations:** flash 400 ms, hero slide 120 ms, shake 300 ms. All are CSS animations. They replay by alternating two keyframe names selected by a one-bit `Beat` attribute on the App_Root, not by timers and not by forced reflow. | `data-changed` stays set on a cell across accepted Actions, so an attribute that does not change cannot restart an animation. Flipping the animation name does. | Confirmed |
| D7 | **The motion and sound signal is a new field `fx` on `AppState`**, set by the controller on every accepted Action: `{ beat, slide, damaged, cues }`. | The Damage_Log exists only on the Action_Result inside `accept` (grid-ui gap 1). `fx` keeps `step` pure and gives `app.ts` one place to read. | Confirmed |
| D8 | **Only the hero slides.** Monsters jump as they do today. | BRIEF section 8 says "the hero slides one cell". | Confirmed |
| D9 | **The title splash is a dialog in `#screen-overlay`, shown only when `MountOptions.showTitle` is true.** `src/main.ts` passes `true`. The fixture entries do not. It is shown on every page load, is not stored in Progress, and is held as a closure flag in `app.ts` (like the ghost), so `step`, `AppState` and the Key_Map are unchanged. | Playwright flows and `scripts/play.mjs` keep working unchanged. The Start click is also the first gesture that unlocks audio. | Confirmed |
| D10 | **Death dialog = the existing `#end-banner`, restyled.** It gains `role="alertdialog"`, its own Recover button and focus. It is non-modal so the sheet stays readable. The **win dialog** is built in `#screen-overlay`. | `#end-banner` is an existing hook. Players want to look at the sheet after dying. | Confirmed |
| D11 | **Sound defaults to on, and stays silent until the first user gesture.** The mute preference is in `localStorage` key `grimsheet.muted`, separate from Progress, through the same `StorageLike` seam. There is **no keyboard shortcut** for mute (the Key_Map is unchanged) and **no sound for refused moves or edits**. `wait` and `undo` are silent. | Lean. A blocked step into a wall is common, and a buzz on each would grate. The toggle is a Tab stop. | Confirmed |
| D12 | **One grey chrome theme, no dark variant.** The `prefers-color-scheme: dark` block of `grid-ui.css` is removed. The error-monsters colour pairs keep both light and dark values, because each is a self-contained foreground and background pair. | A late-1990s window is grey in every setting. | Confirmed |
| D13 | **Favicon is a hand-drawn file `public/favicon.svg`**, linked from `index.html` and the three fixture pages. | A file is simplest and works in dev and in the build. It is authored in the repo, not taken from outside. | Confirmed |
| D14 | **No sprites.** Glyphs (`@`, `M`) and the error-monsters CSS shapes stay. | BRIEF section 8 calls sprites optional. No image files keeps the build static and small. error-monsters Requirement 10 handed this decision to this spec. | Confirmed |
| D15 | **Property-based testing is not enabled.** | The Sound_Mapper is a small total function with five outputs; an example table covers it. The mute value is one character. The rest is CSS and DOM wiring. | Confirmed |
| D16 | **Screenshots use a 1280 by 1024 viewport** (plus one small-viewport shot at 1366 by 768); layout checks run at 1280 by 1024 and also at 1366 by 768. | The window is about 940 px tall plus the status bar. At 800 px the status bar and the rules panel are cut off, so the full-window shots need 1024 px, and the 1366 by 768 check proves the sticky Status_Bar (D20) on a common laptop screen. | Confirmed |
| D17 | **Column A gets its own width of 7.5rem** (the exact value is decided in the design from measurements with VT323), so rules-panel labels such as "Trap damage", "Move rule of M1", "Attack rule of M1" and "Divisor" are fully readable. Columns B to L stay 2.5rem square. It is a CSS rule on the column A cells (body cells with `data-col="A"` and the column A header cell, selected through the existing header structure), with no inline style. | Labels are clipped to four characters today at 2.5rem. Column A rows 1 to 12 are mostly the outer wall in all five levels, so widening it does not enlarge the playable map. | Confirmed |
| D18 | **Font measurement comes first.** The design phase downloads VT323 from the source recorded in Requirement 2, renders the real grid with the Playwright MCP at 1280 by 1024, and measures the `#DIV/0!` text and the labels in VT323 before it fixes any size. If 0.5rem VT323 is not legible, the design picks the smallest legible size and adjusts the error text strip (the error-monsters CSS `font-size` and its Playwright fit check). The design reports what it measured. | The advance width and legibility of VT323 are unverified, and sizes chosen without measurement would be guesses. | Confirmed |
| D19 | **Font format: ship the TTF unchanged.** `public/fonts/vt323-regular.ttf` and `public/fonts/OFL.txt`; `fonts.css` declares `src: url('/fonts/vt323-regular.ttf') format('truetype')`. No conversion, no new tool installed. | An unmodified file is not a Modified Version under OFL 1.1, so no Reserved Font Name question arises. | Confirmed |
| D20 | **The Status_Bar is sticky at the bottom of the viewport** (`position: sticky; bottom: 0`), so HP, ink, turn and the Message are always visible. Playwright layout checks run at 1280 by 1024 and at 1366 by 768. | The window is taller than a 768 px laptop viewport, and the status values must not need a scroll. | Confirmed |
| D21 | **On the lost screen, `R` restarts even when focus is on the Death_Dialog Recover button.** It is the same widening that exists in `key-map.ts` for a pending restart confirmation (grid-ui Key_Map row 13). The exact condition is left to the design. | Moving focus to the dialog button must not cost the `R` shortcut. | Confirmed |

## Glossary

- **Skin**: The set of stylesheets and render changes of this spec. Its stylesheets are `fonts.css`, `chrome.css` and `motion.css` under `src/styles/`.
- **Chrome**: The window frame: Title_Bar, bevels, formula row, toolbar, Tab_Bar and Status_Bar styling.
- **Title_Bar**: The `header.title-bar` element that shows `STRINGS.titleBar`.
- **Window_Buttons**: The three decorative spans (minimise, maximise, close) in the Title_Bar.
- **Tab_Bar**: The `nav#tab-bar` of level tabs.
- **Status_Bar**: The `footer#status-bar` with level label, HP, ink, turn and Message.
- **Stable_Hooks**: The ids, classes and data attributes of `grid-ui` and `error-monsters`.
- **Font_Stack**: The CSS `font-family` list used for all text.
- **Font_Stylesheet**: `src/styles/fonts.css`.
- **Padlock_Marker**: The `.padlock` span inside a locked Grid_Cell.
- **Beat**: The attribute `data-beat` on the App_Root with value `0` or `1`, flipped on every accepted Action.
- **Turn_Effects** (`fx`): The `AppState` field `{ beat, slide, damaged, cues }` set on every accepted Action.
- **Motion**: The three animations of Requirement 4, written in `motion.css`.
- **Title_Dialog**: The splash dialog in `#screen-overlay`.
- **Death_Dialog**: `#end-banner` shown on the lost screen.
- **Win_Dialog**: The dialog in `#screen-overlay` shown on the won screen.
- **Cue**: One of `move`, `edit`, `damage`, `win`, `death`.
- **Sound_Mapper**: The pure function `cuesFor` in `src/ui/sound-events.ts`.
- **Sound_Player**: The module `src/ui/audio.ts`, the only file that names `AudioContext`.
- **Mute_Toggle**: The button `data-control="sound"` in the toolbar.
- **Mute_Store**: The reader and writer of `grimsheet.muted` in `sound-events.ts`.
- **Favicon**: `public/favicon.svg`.
- **Screenshot_Set**: The PNG files in `docs/screenshots/`.
- **Module_Scan**: The test `src/ui/module.test.ts`.
- **Reduced_Motion**: The media feature `prefers-reduced-motion: reduce` matches.
- **Product_Name**: Any real product, company or brand name or logo of office software or an operating system.

## Requirements

### Requirement 1: Window Chrome

**User Story:** As a player, I want the game to look like a late-1990s office window, so that the spreadsheet joke lands.

#### Acceptance Criteria

1. THE Chrome SHALL draw the window frame, bevels and sunken fields with CSS borders and `box-shadow` only, with no image file and no `url(` in `chrome.css`.
2. THE Title_Bar SHALL show `STRINGS.titleBar` and, at its right edge, the three Window_Buttons drawn by CSS, each with `aria-hidden="true"`, no event handler and no focus stop.
3. THE Chrome SHALL style the Name_Box and Formula_Bar as sunken fields in one row, and the toolbar buttons as raised bevelled buttons with a pressed look when activated.
4. THE `render.ts` skeleton SHALL place the Tab_Bar after the Grid_Table and before the Status_Bar, so that visual order, DOM order and Tab order are the same.
5. THE Status_Bar SHALL separate the level label, HP, ink, turn and Message with CSS-drawn dividers between the existing spans.
6. WHILE the viewport is narrower than the window, THE Chrome SHALL let the page scroll horizontally so that no control is clipped.
7. THE Status_Bar SHALL be sticky at the bottom of the viewport (`position: sticky; bottom: 0`), so that at 1366 by 768 and at 1280 by 1024 its bounding box lies within the viewport after every scroll position, which a Playwright scroll test verifies at both sizes.

### Requirement 2: Font

**User Story:** As a player, I want a pixel font that fits the grid, so that the game feels like an old terminal and stays readable.

The chosen font:

| Item | Value |
| --- | --- |
| Name | VT323 (regular, weight 400, one style) |
| Designer | Peter Hull; copyright line "Copyright 2011, The VT323 Project Authors (peter.hull@oikoi.com)" |
| License | SIL Open Font License 1.1 (text in `google/fonts` `ofl/vt323/OFL.txt`) |
| Source | `https://github.com/google/fonts/tree/main/ofl/vt323` (file `VT323-Regular.ttf`); upstream `https://github.com/phoikoi/VT323`, the commit recorded by Google Fonts is `9bd4b3f69887fd960d51d07602db60a28a789145` |
| Version | The name-table version string of the downloaded file is recorded in the design; this session did not download the file |
| Files to ship | `public/fonts/vt323-regular.ttf` (the upstream `VT323-Regular.ttf` byte for byte, renamed to kebab-case) and `public/fonts/OFL.txt` (unchanged) |
| Fallback stack | `'VT323', ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace` |

The OFL permits use, bundling and redistribution with software, requires each copy to carry the copyright notice and the license, and forbids selling the font by itself. The `OFL.txt` published in `google/fonts` declares no Reserved Font Name; older copies of the license for this family declare "VT323" as reserved, so the design confirms the finding against the downloaded file. The TTF is shipped unchanged (D19): no conversion and no new tool, so the file is not a Modified Version and no Reserved Font Name question arises. Candidates not chosen: Press Start 2P (8 px advance, too wide for a 40 px cell), Silkscreen and Pixelify Sans (not monospace).

#### Acceptance Criteria

1. THE Font_Stylesheet SHALL declare one `@font-face` for `VT323` with `src: url('/fonts/vt323-regular.ttf') format('truetype')`, `font-weight: 400`, `font-style: normal` and `font-display: swap`, and THE Skin SHALL use the Font_Stack for all app text including inputs and buttons.
2. THE repository SHALL contain `public/fonts/vt323-regular.ttf` (unchanged from upstream) and `public/fonts/OFL.txt`, and the README SHALL carry the sentence "Font: VT323 by Peter Hull, SIL Open Font License 1.1, https://github.com/google/fonts/tree/main/ofl/vt323 (file shipped unchanged)."
3. THE Module_Scan SHALL allow `url(` only in `fonts.css` and only in the form `url('/fonts/<kebab-name>.ttf')`, SHALL keep `@import` and `http` forbidden in every stylesheet, and SHALL keep `url(` forbidden in `grid-ui.css`, `error-monsters.css`, `chrome.css` and `motion.css`.
4. WHEN the page loads, THE Skin SHALL cause no network request to any origin other than the page's own origin.

### Requirement 3: Padlocks

**User Story:** As a player, I want padlocks only on rules I cannot edit, so that the map is not covered in lock icons.

#### Acceptance Criteria

1. THE Grid_UI SHALL render no Padlock_Marker in a Grid_Cell whose `data-region` is `map`.
2. WHEN a Grid_Cell with `data-region="rules"` is locked, THE Grid_UI SHALL render a Padlock_Marker drawn by CSS shapes with no emoji or text character, with `aria-hidden="true"`.
3. THE Grid_UI SHALL keep `data-locked="true"` and `aria-readonly="true"` on every locked Grid_Cell in both regions, and THE formula bar SHALL keep showing the locked note for a locked Selection.

### Requirement 4: Motion

**User Story:** As a player, I want small animations that show what just changed, so that I can follow a turn, without being distracted.

#### Acceptance Criteria

1. WHEN an accepted Action sets `data-changed` on a Grid_Cell, THE Motion SHALL flash that cell's background for 400 ms.
2. WHEN an accepted move changes the hero position by one cell, THE Motion SHALL slide the hero's `.entity-glyph` from the previous cell's side to its resting place in 120 ms, driven by a `data-slide` attribute (`N`, `S`, `E` or `W`) on that glyph.
3. WHEN the Damage_Log of an accepted Action is not empty, THE Motion SHALL shake `#grid-table` for 300 ms.
4. WHEN the controller accepts an Action, THE controller SHALL set `fx` with the next Beat, the slide direction, the damaged flag and the Cues, and THE Motion SHALL replay an animation on consecutive turns by selecting a different keyframe name for each Beat value, with no timer, no forced reflow and no `style` attribute.
5. WHILE Reduced_Motion is on, THE Motion SHALL run no flash, slide or shake, and the error-monsters ghost behaviour SHALL stay as it is.

### Requirement 5: Title Screen

**User Story:** As a player, I want a spreadsheet splash before the first level, so that the game opens with its joke and its controls.

#### Acceptance Criteria

1. WHERE `MountOptions.showTitle` is true, WHEN `mountApp` finishes mounting, THE Title_Dialog SHALL appear in `#screen-overlay` with the heading `STRINGS.titleBar`, the tagline "A roguelike where every monster is a formula.", the premise "A workbook found on a dead accountant's floppy disk. Its formulas are alive.", one line naming the controls, and a Start button, all texts in `strings.ts`.
2. WHILE the Title_Dialog is shown, THE Grid_UI SHALL put keyboard focus on the Start button, mark the rest of the window `inert`, expose the dialog with `role="dialog"`, `aria-modal="true"` and `aria-labelledby`, and ignore game keys.
3. WHEN the player activates Start by click, Enter or Space, THE Grid_UI SHALL hide the Title_Dialog, remove `inert`, move focus to the Grid_Table, and apply no Action and spend no ink.
4. WHERE `showTitle` is absent or false, THE Grid_UI SHALL render no Title_Dialog, so the fixture entries and their Playwright flows behave as before.

### Requirement 6: Death and Win Dialogs

**User Story:** As a player, I want dying and winning to feel like old office dialogs, so that the tone holds to the end.

#### Acceptance Criteria

1. WHEN `data-screen` becomes `lost`, THE Death_Dialog SHALL show a bevelled dialog with a title bar reading `STRINGS.lostTitle`, the body `STRINGS.lostBody` and a default Recover button, SHALL have `role="alertdialog"` with `aria-labelledby` and `aria-describedby`, and SHALL move focus to its Recover button.
2. WHEN the player activates the Recover button of the Death_Dialog, THE Grid_UI SHALL restart the level at once, as grid-ui Requirement 10 defines for the lost screen.
3. WHEN `data-screen` becomes `won`, THE Win_Dialog SHALL show a dialog with the title bar `STRINGS.titleBar`, the body `STRINGS.won` (or `STRINGS.wonLast` on the last level) and a default button (Next level when a next level exists, otherwise OK), and SHALL move focus to that button.
4. WHEN the player activates OK or presses Escape in the Win_Dialog, THE Grid_UI SHALL hide it and move focus to the Grid_Table, and WHILE either end dialog is shown, THE Grid_UI SHALL keep the sheet readable and Ctrl+Arrow selection working.

5. WHILE `data-screen` is `lost`, WHEN the player presses `R` with keyboard focus on a button, THE Grid_UI SHALL restart the level at once, so that `R` works with focus on the Recover button of the Death_Dialog.

The exact Key_Map condition is left to the design. The rule widens the grid-ui Key_Map table (row 13), so the tests are: a `key-map.test.ts` unit case (`R` with a focused button on the lost screen gives a restart, and on the playing screen still gives none) and a step in `tests/e2e/recover-restart.spec.ts` that dies, leaves focus on the Recover button, presses `R` and sees the level restart.

### Requirement 7: Sound

**User Story:** As a player, I want a few short beeps for key events and a mute switch, so that the game has a voice without becoming noise.

The Cue table (all `OscillatorNode` type `square`):

| Cue | Notes (frequency Hz, duration ms, in sequence) |
| --- | --- |
| `move` | 440 for 30 |
| `edit` | 660 for 50, then 880 for 70 |
| `damage` | 150 for 70, then 110 for 90 |
| `win` | 523, 659, 784, 1047, each for 90 |
| `death` | 392, 330, 262, 196, each for 140 |

Each note has peak gain 0.05, a linear attack of 4 ms from 0 and a linear release of 12 ms to 0, so no click is heard.

#### Acceptance Criteria

1. THE Sound_Mapper SHALL map an accepted Action to a list of Cues by this precedence: status `lost` gives `death`; status `won` gives `win`; a non-empty Damage_Log gives `damage`; an accepted edit gives `edit`; an accepted move gives `move`; a wait, an undo and every refused Action give an empty list.
2. THE Sound_Player SHALL play each Cue as the notes of the table through square-wave oscillators and a gain envelope as specified above.
3. WHEN the first `keydown`, `pointerdown` or `click` of the page arrives, THE Sound_Player SHALL create its `AudioContext` and resume it if suspended, and BEFORE that gesture THE Sound_Player SHALL create no context and drop every Cue.
4. IF Web Audio is missing or any Web Audio call throws, THEN THE Sound_Player SHALL do nothing and THE Grid_UI SHALL keep working.
5. WHEN `destroy()` is called, THE Sound_Player SHALL close its `AudioContext`.
6. THE toolbar SHALL contain the Mute_Toggle, a `button` labelled "Sound" with `aria-pressed` that is `true` while sound is on, operable by Enter and Space, whose state is shown by a pressed bevel and a CSS-drawn slash and not by colour alone.
7. WHEN the player activates the Mute_Toggle, THE Mute_Store SHALL write `grimsheet.muted` as `1` (muted) or `0` through the `StorageLike` of `MountOptions`, and WHILE muted THE Sound_Player SHALL play no Cue.
8. IF the stored value is missing, not `1`, or reading or writing storage throws, THEN THE Mute_Store SHALL treat the sound as on and the app SHALL continue, and Reduced_Motion SHALL have no effect on sound.

### Requirement 8: Favicon

**User Story:** As a maintainer, I want a favicon, so that the browser stops requesting a missing file.

#### Acceptance Criteria

1. THE Favicon SHALL be a hand-drawn SVG in `public/favicon.svg` linked by `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` in `index.html` and in the three fixture pages.
2. WHEN the page loads in the dev server or the production build, THE browser SHALL receive no 404 for any request, and the build output SHALL contain `favicon.svg`.

### Requirement 9: Accessibility and Contrast

**User Story:** As a player with low vision or who relies on the keyboard, I want the new look to stay readable and operable, so that the skin does not cost access.

Full WCAG validation needs manual testing with assistive technologies and expert review. The automated checks here cover the contrast floor, the focus ring and the keyboard flows only.

#### Acceptance Criteria

1. THE Skin SHALL give every text and background colour pair of the Chrome and the dialogs a contrast ratio of at least 4.5 to 1, and every focus ring, bevel edge that signals a state and toggle state mark a ratio of at least 3 to 1 against its neighbour, with the ratios computed and listed in the design.
2. THE Skin SHALL keep a visible focus ring on every focusable element, including the new dialog buttons and the Mute_Toggle, and SHALL convey no state by colour alone.
3. WHEN the font has loaded, THE Skin SHALL keep the `#DIV/0!` cell text inside its cell (`scrollWidth` at most `clientWidth`), at the font size the design fixes from its VT323 measurements (D18).
4. WHEN the font has loaded, THE Skin SHALL give column A of the Grid_Table a width of 7.5rem through a CSS rule on the column A cells (D17), with no inline style, so that the longest rules-panel label of the five levels (at most 24 characters) has `scrollWidth` at most `clientWidth`, and columns B to L SHALL stay 2.5rem square.

The design sizes column A for the longest actual label in the five level files and decides whether labels longer than the column wrap or whether the column grows, only if needed.

### Requirement 10: Screenshots

**User Story:** As the author preparing the submission, I want a fixed set of screenshots, so that the README and the Devpost gallery show the finished game.

#### Acceptance Criteria

1. WHEN all other tasks of this spec are done, THE Screenshot_Set SHALL be captured with the Playwright MCP at a 1280 by 1024 viewport from a clean browser profile (no saved progress, no personal data) into `docs/screenshots/` as `01-title.png`, `02-level-play.png` (a level with the NECRONOMICELL panel visible), `03-monster-formula.png` (level 2 with `MOVE_M1` selected, its formula in the formula bar), `04-error-monster.png` (level 4 with an error cell and its cause line), `05-death-dialog.png` and `06-win-dialog.png`, plus `07-small-viewport.png` captured at 1366 by 768 (level 1 in play, the Status_Bar visible at the bottom of the viewport), together with a `docs/screenshots/README.md` that describes each of the seven files in one line.

### Requirement 11: Layering and Scope Boundary

**User Story:** As a maintainer, I want the changes to stay in the UI layer and the tests to follow them, so that the rules of the project still hold.

#### Acceptance Criteria

1. THE Skin SHALL change no file under `src/engine/`, `src/model/`, `src/game/` or `src/levels/`, SHALL keep every Stable_Hook name and meaning, and SHALL contain no Product_Name in text, class names, assets or comments: no "Microsoft", "Windows", "Excel" or "Lotus", and no logo or lookalike mark.
2. THE new and changed files SHALL contain no `eval`, `new Function`, `Math.random`, `Date.now`, `new Date`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `style` attribute write, `window` identifier or AI tool name other than Kiro, SHALL add no runtime dependency, and SHALL use named exports and kebab-case file names, with all player-visible strings in `strings.ts`.
3. THE Module_Scan SHALL list `audio.ts` and `sound-events.ts` among the expected `src/ui/` files, SHALL treat `sound-events.ts` as pure, SHALL allow `AudioContext` and `globalThis` only in `audio.ts` (where `document`, `window`, `localStorage` stay forbidden), SHALL include `fonts.css`, `chrome.css` and `motion.css` in its stylesheet and AI-name checks, and SHALL require the entry files to import the three new stylesheets.

## Scope Boundary and Cross-Spec Edits

What this spec changes in existing files:

| File | Change |
| --- | --- |
| `src/ui/render.ts` | Skeleton order (tabs after the table), Window_Buttons, Mute_Toggle, dialog markup in `#end-banner` and `#screen-overlay`, padlock only in the rules region, `data-beat`, `data-slide`, shake attribute. |
| `src/ui/app.ts` | Sound_Player wiring, first-gesture unlock, Mute_Toggle click, title and win dialog flags and focus, `inert`. |
| `src/ui/controller.ts`, `src/ui/types.ts` | `fx` on `AppState` set in `accept`; `showTitle` and an optional audio factory on `MountOptions`. |
| `src/ui/view-model.ts` | Pass `fx` and the lock/region data to the renderer. |
| `src/ui/strings.ts` | Add title texts, `buttons.ok`, `buttons.sound`, dialog labels. Remove `padlock`. |
| `src/ui/module.test.ts` | New files, audio allowance, font `url(` rule, new stylesheets. |
| `src/ui/key-map.ts`, `src/ui/key-map.test.ts` | Grid-ui Key_Map row 13 gains an exception: on the lost screen `R` restarts when focus is on a button (D21). Unit test added. |
| `tests/e2e/recover-restart.spec.ts`, `tests/e2e` grid-layout | A step presses `R` with focus on the Recover button; layout checks also run at 1366 by 768 with a scroll test for the sticky Status_Bar. |
| `src/styles/grid-ui.css` | Remove the dark block; the fixed table width changes because column A is wider (D17). |
| `src/styles/error-monsters.css` | The `#DIV/0!` text strip `font-size` may change after the VT323 measurement (D18). |
| `index.html`, `tests/fixtures/*.html`, `src/main.ts`, `tests/fixtures/*main.ts` | Favicon link, font and new stylesheet imports; `main.ts` passes `showTitle: true`. |

New files: `src/ui/sound-events.ts` (pure), `src/ui/audio.ts` (DOM side), `src/styles/fonts.css`, `src/styles/chrome.css`, `src/styles/motion.css`, `public/fonts/vt323-regular.ttf`, `public/fonts/OFL.txt`, `public/favicon.svg`, `docs/screenshots/`.

Existing tests that must change: `render.test.ts` (padlock cases around lines 211 to 222), `strings.test.ts` (padlock string, lines 42 to 44), `module.test.ts`, the view-model and controller tests that compare whole `AppState` values, and `tests/e2e/smoke.spec.ts` (title dialog on `/`). The Playwright specs `grid-layout`, `edit-and-fix`, `recover-restart` and `win-and-persist` read `#status-bar` and `#tab-bar button` by id and are expected to pass unchanged, except that the layout spec (`tests/e2e` grid-layout) is re-checked against the wider column A. The design also checks all five level maps with the wider column A: the hero starts on B6, and no level has an entity or a formula cell in column A of rows 1 to 12. If one exists, the design flags it. The error-monsters Playwright fit check is re-run if the error text size changes.

What this spec does not touch: the engine, the model, the game, the level files, the error-monsters behaviour (looks, causes, ghost timer), the hosting setup beyond the favicon and font files in `public/` (the hosting `check:dist` script keeps skipping font binaries and `OFL.txt` in its scans, and its presence check is for `dist/fonts/vt323-regular.ttf` and `dist/favicon.svg`).

## Gaps and Open Questions

The BRIEF does not decide these. Each has a working assumption above or a note here.

1. **Title screen wording.** The BRIEF gives the tagline (in `product.md`) and the premise (6a) but no splash layout or controls line. The texts in Requirement 5 are proposals.
2. **Mute default, a mute key and a refusal sound.** Not in the BRIEF. D11 picks on, no key, no refusal sound. A key would change the grid-ui Key_Map table and its tests.
3. **Resolved (D21, Requirement 6.5).** `R` restarts on the lost screen even with focus on the Recover button. The design chooses the exact Key_Map condition.
4. **VT323 metrics are unverified, and the design measures them first.** No font file was downloaded in this session. D18 requires the design to measure the `#DIV/0!` text and the labels in VT323 before it fixes sizes, and D17 widens column A for the labels. Cells in columns B to L stay 2.5rem square.
5. **Status bar below the fold at 800 px.** Resolved by D20 (sticky Status_Bar) and the 1366 by 768 checks. The design may still tighten the row height.
6. **Slide is clipped.** `td.cell` has `overflow: hidden`, so a glyph sliding in from the neighbour's side is cut at the cell edge. The design decides whether to relax the overflow for the sliding cell or to slide a shorter distance.
7. **Reserved Font Name.** See Requirement 2 and D19. The TTF ships unchanged, so the design only records the license finding from the downloaded file.
8. **Playwright and animation.** The animations move only a glyph and the table for at most 300 ms. Playwright waits for stable elements, so a global `reducedMotion` setting is not recommended (the ghost test needs real motion). Sound cannot be checked in headless runs; the mapper and a fake `AudioContext` cover it.
9. **Hosting.** Tasks 1.2 and later of the hosting spec are open. The build must copy `public/` to `dist/`; Vite does this by default.
10. **Desktop colour behind the window.** The BRIEF fixes no page colour. The design picks one that meets the contrast floor for any text placed on it.
