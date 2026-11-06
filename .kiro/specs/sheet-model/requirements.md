# Requirements Document

## Introduction

The Sheet_Model is the data layer between the Formula_Engine and the game. It lives under `src/model/` and defines the Level type, the Level_Document JSON schema, a Loader that validates a Level_Document and builds a recalculated engine Sheet, a Serializer that turns a Level back into a Level_Document, and a lossless round-trip between the two. It is the second spec in `docs/BRIEF.md` section 12 and sits one layer above the engine in the dependency direction `ui -> game -> model -> engine`.

The Sheet_Model contains no game rules. Turns, movement, monsters acting, damage, traps, haunting, undo, the seeded generator and the run state belong to the `game-rules` spec. The Sheet_Model has no DOM, `localStorage` or Web Audio access. Progress persistence belongs to the UI layer.

The Loader reaches the engine only through `src/engine/index.ts`. The Level_Document stores raw cell text and the Locked_Flag, which the engine does not know about. The engine Sheet is derived data and is never serialized.

The five level files are authored and tested in the `levels` spec, which owns the check that each shipped file equals `serializeText` of its own Level.

Property-based testing with fast-check is enabled on exactly three requirements: Requirement 11 (round trip), Requirement 12 (Loader totality) and Requirement 13 (placement invariants). All other requirements are covered by example-based unit tests. Generators live in `src/model/testing/arbitraries.ts`, follow the pattern of `src/engine/testing/arbitraries.ts` (one owner of every generator, one `assertProperty` helper that honours `FC_SEED`, no `Math.random`), and are not exported from `src/model/index.ts`.

### Decisions

1. **NECRONOMICELL title.** The title is UI-only text rendered by `src/ui/`. Row 13 is an empty Separator_Row and holds no Cells.
2. **HP and TRAP.** HP is not a Cell. Starting HP is the `startingHp` field; current HP is run state owned by `game-rules`. `TRAP` is an optional named Rules_Panel Cell; the Sheet_Model neither creates nor requires it.
3. **Random source.** The Loader takes a Random_Source as a parameter. The seeded generator belongs to `game-rules`. The Loader result depends only on the Level_Document and the Random_Source.

## Glossary

- **Sheet_Model**: The complete `src/model/` module, exposed through `src/model/index.ts`.
- **Formula_Engine**: The frozen module under `src/engine/`, used only through `src/engine/index.ts`.
- **Level_Document**: A JSON-compatible value that describes one Level. One Level_Document is stored per level file, named `NN-slug.json`.
- **Level**: An alias of Level_Document in normalized form (see Requirement 10): the typed, immutable in-memory form of a valid Level_Document.
- **Schema_Version**: A positive integer naming the Level_Document format. The only supported value is `1`.
- **Loader**: The component that validates a Level_Document and builds a Level and an engine Sheet.
- **Serializer**: The component that converts a Level into a Normalized_Document and into JSON text.
- **Normalized_Document**: The canonical Level_Document form defined in Requirement 10.
- **Random_Source**: A function with no arguments that returns a number in [0, 1), supplied by the caller of the Loader.
- **Map**: The Level_Document field `map`, an array of 12 strings of 12 characters each. Row r of the Map gives the Literal Raw_Text of row r, columns A to L.
- **Terrain_Glyph**: One of the characters `#` (wall), `.` (floor), `X` (exit) or `^` (trap).
- **Cell_Spec**: One entry of the Level_Document `cells` list: an Address, Raw_Text, an optional Locked_Flag and an optional Cell_Name. A Cell_Spec at a Map_Area Address overrides the Map character at that Address.
- **Raw_Text**: The text of a Cell as defined in the formula-engine spec. Text starting with `=` is a Formula; any other text is a Literal.
- **Effective_Raw**: The Raw_Text a Cell holds after loading: the Cell_Spec `raw` when a Cell_Spec exists at the Address, otherwise the Map character for a Map_Area Cell, otherwise the empty string.
- **Locked_Flag**: A boolean on a Cell_Spec. A Cell with the Locked_Flag set to `true` is read-only to the player. The Formula_Engine does not know this flag.
- **Cell_Name**: An upper-case identifier that satisfies the engine name check. Its canonical form is the upper-case form returned by that check.
- **Address**: A column letter `A` to `L` followed by a row number `1` to `20`, as defined in the formula-engine spec.
- **Map_Area**: The Cells in rows 1 to 12 of the Sheet.
- **Separator_Row**: Row 13 of the Sheet.
- **Rules_Panel**: The Cells in rows 14 to 20 of the Sheet.
- **Panel_Label**: The Cell directly to the left of a named Rules_Panel Cell. Its Effective_Raw is non-empty and does not start with `=`, and its computed Value after the first recalculation is a non-empty string.
- **Walkable_Cell**: A Map_Area Cell whose computed Value is the string `.`, `X` or `^`. Any other Value is blocking.
- **Floor_Cell**: A Map_Area Cell whose computed Value is the string `.`.
- **Hero_Start**: The Address on which the hero begins the Level.
- **Monster_Spec**: One entry of the `monsters` list: a monster id, a start Address, a move Rule_Name and an atk Rule_Name.
- **Rule_Name**: The Cell_Name of a Rules_Panel Cell that holds a monster's `move` or `atk` rule.
- **Level_Id**: The Level's identifier of the form `NN-slug`, equal to the file name without `.json`.
- **Tab_Label**: The sheet tab text of a Level, `Sheet<N>: <Title>`, where N is the number in the Level_Id without leading zeros. It is derived and never stored.
- **Load_Error**: A record with a `path` (the location in the Level_Document, such as `monsters[1].move`), a stable `code` string and a plain-English `message` written for a level author.
- **Load_Result**: Either `{ ok: true, level, sheet }` or `{ ok: false, errors }` where `errors` is a non-empty list of Load_Errors.
- **Level_Equality**: Structural deep equality of two Levels: equal scalar fields, equal `map` strings, and equal `cells` and `monsters` lists in the same order.
- **Author_Order**: The order of the `monsters` list in a Level_Document.
- **Reading_Order**: Row ascending, then column ascending within each row.

## Requirements

### Requirement 1: Level Document Schema

**User Story:** As a level author, I want one JSON document per level with a fixed set of fields, so that a level is complete and checkable in a single file.

#### Acceptance Criteria

1. THE Sheet_Model SHALL define a Level_Document as a JSON object with exactly these fields: `schemaVersion`, `id`, `title`, `hint`, `map`, `cells`, `hero`, `monsters`, `startingHp`, `ink` and `seed`.
2. THE Sheet_Model SHALL define each Cell_Spec as a JSON object with the required fields `address` and `raw` and the optional fields `locked` and `name`.
3. THE Sheet_Model SHALL define each Monster_Spec as a JSON object with exactly the fields `id`, `at`, `move` and `atk`, and `hero` as a JSON object with exactly the field `at`, where `at`, `move` and `atk` are strings.
4. THE Sheet_Model SHALL represent `schemaVersion`, `startingHp`, `ink` and `seed` as JSON numbers, `map`, `cells` and `monsters` as JSON arrays, and `id`, `title` and `hint` as JSON strings.
5. THE Sheet_Model SHALL export TypeScript types for Level, Cell_Spec, Monster_Spec, Level_Document, Load_Error and Load_Result from `src/model/index.ts` using named exports and no default export, with every field `readonly`, where the Level type is an alias of the Level_Document type in normalized form.
6. THE Sheet_Model SHALL export a function `tabLabel` from `src/model/index.ts` that returns the Tab_Label of a Level, for example `Sheet1: The Corridor` for the Level_Id `01-the-corridor` with the title `The Corridor`.

### Requirement 2: Metadata Validation

**User Story:** As a level author, I want the identifying and descriptive fields checked, so that a level is always identified and described consistently.

#### Acceptance Criteria

1. IF `schemaVersion` is missing, is not an integer, or is any value other than `1`, THEN THE Loader SHALL return a Load_Error at path `schemaVersion` that names the received value and states that only version 1 is supported.
2. IF `id` does not match two digits, a hyphen, then one or more lower-case letters or digits optionally separated by single hyphens (for example `01-the-corridor`), or is longer than 40 characters, THEN THE Loader SHALL return a Load_Error at path `id`.
3. IF `title` is not a string of 1 to 60 characters with no leading or trailing space and no control characters, THEN THE Loader SHALL return a Load_Error at path `title`.
4. IF `hint` is not a single-line string of 1 to 160 characters with no control characters, THEN THE Loader SHALL return a Load_Error at path `hint`.
5. IF `startingHp` is not a safe integer greater than or equal to 1, THEN THE Loader SHALL return a Load_Error at path `startingHp` stating that HP must be a positive whole number.
6. IF `ink` is not a safe integer greater than or equal to 0, THEN THE Loader SHALL return a Load_Error at path `ink` stating that ink must be a whole number of 0 or more.
7. WHEN `ink` is `0` and every other field is valid, THE Loader SHALL accept the Level_Document.
8. IF `seed` is not an integer from 0 to 4294967295, THEN THE Loader SHALL return a Load_Error at path `seed`.

### Requirement 3: Shape and Unknown Fields

**User Story:** As a level author, I want a missing field, a wrong type or a typo in a field name to be reported, so that a misspelled `lokced` is never silently ignored.

#### Acceptance Criteria

1. IF a field of the Level_Document root is missing, THEN THE Loader SHALL return a Load_Error at the path of that field stating that the field is required.
2. IF the Level_Document root, a Cell_Spec, a Monster_Spec or the `hero` object contains a field that Requirement 1 does not define, THEN THE Loader SHALL return a Load_Error at the path of that field that names the unknown field and lists the allowed fields.
3. IF the value passed to the Loader is not a plain object (for example `null`, a number, a string, a boolean or an array), THEN THE Loader SHALL return a single Load_Error at the empty path stating the received type and that a Level_Document must be an object.
4. IF a field holds a value of the wrong JSON type, including `NaN`, `Infinity` or `-Infinity` in a number field, a non-string `raw`, `move` or `atk`, or a non-boolean `locked`, THEN THE Loader SHALL return exactly one Load_Error at the path of that field stating the expected type and the received type.
5. IF `cells` holds more than 240 entries or `monsters` holds more than 16 entries, THEN THE Loader SHALL return a Load_Error at the path of that list stating the maximum.

### Requirement 4: Terrain Map

**User Story:** As a level author, I want to draw the map as 12 lines of text, so that I can see the dungeon in the file.

#### Acceptance Criteria

1. IF `map` does not hold exactly 12 entries, THEN THE Loader SHALL return a Load_Error at path `map` stating the expected and the received count.
2. IF a `map` entry is not a string of exactly 12 characters, THEN THE Loader SHALL return a Load_Error at path `map[i]` stating the expected and the received length.
3. IF a `map` character is not a Terrain_Glyph, THEN THE Loader SHALL return a Load_Error at path `map[i]` whose message names the row (1 to 12), the column letter and the rejected character, for example `map row 3, column F: "Q" is not one of # . X ^`.
4. WHEN the Level_Document is valid, THE Loader SHALL give the Cell at row r and column c of the Map_Area the Raw_Text of the character at index c of `map[r - 1]`, before any Cell_Spec is applied.

### Requirement 5: Cell Specs, Layout and Labels

**User Story:** As a level author, I want each formula, name and lock checked against the sheet layout, so that the map and the rules panel are always where the game expects them.

#### Acceptance Criteria

1. IF a Cell_Spec `address` is not an Address accepted by the engine's address parser, THEN THE Loader SHALL return a Load_Error at path `cells[i].address` stating that the Address is malformed or outside columns A to L and rows 1 to 20.
2. IF a Cell_Spec `address` is in row 13, THEN THE Loader SHALL return a Load_Error at path `cells[i].address` stating that row 13 is reserved between the map and the rules panel.
3. IF two Cell_Specs have the same Address after the column letter is converted to upper case, THEN THE Loader SHALL return a Load_Error at the path of the later Cell_Spec that names the Address and the index of the earlier Cell_Spec.
4. IF a Cell_Spec `raw` is a string longer than 500 characters, THEN THE Loader SHALL return a Load_Error at path `cells[i].raw`.
5. IF a Cell_Spec `raw` is a Formula and the engine refuses it with a Parse_Error, THEN THE Loader SHALL return a Load_Error at path `cells[i].raw` whose message contains the engine's `Col N: <message>.` text unchanged and the Address of the Cell.
6. IF a Cell_Spec `locked` is present and is not a boolean, THEN THE Loader SHALL report it once, as the wrong-type Load_Error of Requirement 3, criterion 4, at path `cells[i].locked`.
7. WHEN a Cell_Spec omits `locked`, THE Loader SHALL treat the Locked_Flag as `false`.
8. IF a Cell_Spec `name` fails the engine's name validation, THEN THE Loader SHALL return a Load_Error at path `cells[i].name` that states which check failed (pattern, reserved name, function name or address-like) and names the rejected text.
9. IF two Cell_Specs have the same Cell_Name under case-insensitive comparison, THEN THE Loader SHALL return a Load_Error at the path of the later Cell_Spec that names the duplicate and the Address of the earlier Cell_Spec.
10. THE Loader SHALL store Addresses and Cell_Names in upper case and SHALL store `raw` exactly as written, without trimming, case folding or reprinting of Formulas.
11. WHERE a Cell_Spec in the Rules_Panel has a `name`, THE Loader SHALL require the Cell directly to its left (same row, previous column) to have an Effective_Raw that is non-empty and does not start with `=`, and SHALL otherwise return a Load_Error at path `cells[i].name` that names the Cell_Name and the Address where the label is expected, or, for a name in column A, states that column A has no label cell.
12. IF a Panel_Label Cell has a `name`, THEN THE Loader SHALL return a Load_Error at the path of that `name` stating that a label cell cannot be a named rule cell.
13. WHERE a Cell_Spec in the Map_Area has a `name`, THE Loader SHALL accept the name without requiring a Panel_Label.
14. IF, after the first recalculation, the computed Value of the Panel_Label Cell of a named Rules_Panel Cell is a number, a boolean, an error or the empty string, THEN THE Loader SHALL return a Load_Error at path `cells[i].name` that names the Cell_Name, the Address of the label Cell and the Value found.

### Requirement 6: Sheet Construction

**User Story:** As a game developer, I want the loader to hand back a ready, recalculated engine sheet, so that the game starts from a consistent state.

#### Acceptance Criteria

1. THE Loader SHALL accept a Level_Document and a Random_Source as parameters.
2. WHEN a Level_Document is valid, THE Loader SHALL create a new engine Sheet, set the Map Literals and then the Raw_Text of every Cell_Spec, assign every Cell_Name, and recalculate the Sheet with the Hero_Start as the hero Address and the supplied Random_Source.
3. THE Loader SHALL use the Formula_Engine only through `src/engine/index.ts`.
4. WHEN the Loader is called twice with the same Level_Document and equivalent Random_Sources, THE Loader SHALL return two independent Sheets with identical Values in every Cell, and a later edit of one Sheet SHALL leave the other Sheet unchanged.
5. IF the engine refuses `setRawText`, `setCellName` or `recalculate` for a reason that the earlier checks should have caught, THEN THE Loader SHALL return a Load_Error with code `engine-refused` that includes the engine's error text.
6. THE Sheet_Model SHALL expose the Locked_Flag only through the Level and SHALL NOT keep a reference from the Level to the mutable engine Sheet.

### Requirement 7: Hero and Monster Placement

**User Story:** As a level author, I want the hero and monsters checked against the map, so that no one starts inside a wall or an error cell.

#### Acceptance Criteria

1. IF `hero.at` is not a valid Address in the Map_Area (rows 1 to 12), THEN THE Loader SHALL return a Load_Error at path `hero.at` stating that the hero must start in the map area, rows 1 to 12.
2. IF the Cell at `hero.at` is not a Walkable_Cell after the first recalculation, THEN THE Loader SHALL return a Load_Error at path `hero.at` that names the Address and the Value found there, such as `hero start B3 is a wall (#)` or `hero start B3 is #DIV/0!`.
3. WHEN the Cell at `hero.at` is `.`, `X` or `^`, THE Loader SHALL accept the hero start.
4. IF a Monster_Spec `id` does not match `M` followed by one or more digits without a leading zero, or is longer than 8 characters, THEN THE Loader SHALL return a Load_Error at path `monsters[i].id`.
5. IF two Monster_Specs have the same `id`, THEN THE Loader SHALL return a Load_Error at the path of the later Monster_Spec naming the duplicate id.
6. IF a Monster_Spec `at` is not a valid Address in the Map_Area, THEN THE Loader SHALL return a Load_Error at path `monsters[i].at`.
7. IF the Cell at a Monster_Spec `at` is not a Floor_Cell after the first recalculation, THEN THE Loader SHALL return a Load_Error at path `monsters[i].at` that names the monster id, the Address, the Value found there and that monsters start on floor (`.`).
8. IF a Monster_Spec `at` equals `hero.at` or the `at` of an earlier Monster_Spec, THEN THE Loader SHALL return a Load_Error at the path of the later one stating which entity already stands there.
9. IF a Monster_Spec `move` or `atk` is a string that does not name a Cell_Name of the Level under case-insensitive comparison, THEN THE Loader SHALL return a Load_Error at `monsters[i].move` or `monsters[i].atk` whose message has the form `monster M1: move rule MOVE_X is not a named cell`.
10. IF a Monster_Spec `move` or `atk` names a Cell outside the Rules_Panel or a Rules_Panel Cell whose Effective_Raw is empty, THEN THE Loader SHALL return a Load_Error at the same path stating the Cell's Address and that rule cells must be non-empty and in rows 14 to 20.
11. THE Loader SHALL store each Rule_Name in canonical upper-case form and SHALL keep the monsters in Author_Order.
12. WHEN the `monsters` list is empty, THE Loader SHALL accept the Level_Document and produce a Level with no monsters.

### Requirement 8: Error Reporting

**User Story:** As a level author, I want every problem in my level listed at once with a path, so that I can fix a file in one pass.

#### Acceptance Criteria

1. IF a Level_Document has more than one independent problem, THEN THE Loader SHALL report every one in a single Load_Result, in this order: the scalar fields (`schemaVersion`, `id`, `title`, `hint`, `startingHp`, `ink`, `seed`), then `map`, `cells` by index, `hero`, `monsters` by index, and last the post-recalculation checks (hero and monster placement on computed Values, and the Panel_Label Value check of Requirement 5, criterion 14). WHILE any earlier Load_Error exists, THE Loader SHALL skip the post-recalculation checks and SHALL add no note about the skipped checks to the result.
2. IF more than 50 Load_Errors are found, THEN THE Loader SHALL return the first 50 followed by one Load_Error with code `too-many-errors` that states how many were left out.
3. THE Loader SHALL give every Load_Error a `code` from a fixed list exported by the Sheet_Model, a `path`, and a plain-English `message` of 1 to 300 characters with no stack trace, exception name or internal file path.
4. WHERE a Load_Error message quotes text from the Level_Document, THE Loader SHALL truncate the quoted text to at most 40 characters and mark the truncation with an ellipsis.
5. IF a check depends on a field that already has a Load_Error, THEN THE Loader SHALL skip the dependent check and SHALL NOT add a derived Load_Error for the same cause.

### Requirement 9: Loading From JSON Text

**User Story:** As a game developer, I want to load a level straight from file text, so that the game and the solver need no extra glue.

#### Acceptance Criteria

1. THE Sheet_Model SHALL provide a text loader that accepts a string of JSON text and a Random_Source and returns a Load_Result.
2. IF the text is longer than 200,000 characters, THEN THE text loader SHALL return a Load_Error with code `too-large` without parsing the text.
3. IF the text is not valid JSON, THEN THE text loader SHALL return a single Load_Error with code `invalid-json` at the empty path whose message includes the parser's position when one is available, except that a stack-exhaustion `RangeError` from the JSON parser on extreme nesting SHALL map to a Load_Error with code `too-deep`.
4. WHEN the text is valid JSON, THE text loader SHALL return the same Load_Result as the value loader returns for the parsed value.

### Requirement 10: Serializer and Normalized Document

**User Story:** As a game developer, I want a canonical serialized form, so that a saved level has one stable text and diffs stay small.

#### Acceptance Criteria

1. THE Serializer SHALL convert a Level into a Normalized_Document, and the Loader SHALL build every Level already in that normalized form.
2. THE Normalized_Document SHALL write each Map character from the Effective_Raw of the Map_Area Cell: the character itself when the Effective_Raw is a single Terrain_Glyph, otherwise `.`.
3. THE Normalized_Document SHALL list `cells` in Reading_Order, with upper-case Addresses and upper-case Cell_Names, writing `locked` only when `true` and `name` only when present.
4. THE Normalized_Document SHALL omit a Cell_Spec that is unlocked, unnamed, and whose `raw` equals the Map character at its Address (Map_Area) or is empty (any other row).
5. THE Normalized_Document SHALL keep `monsters` in Author_Order with each Rule_Name in upper case.
6. THE Normalized_Document SHALL write fields in this fixed order: root `schemaVersion`, `id`, `title`, `hint`, `startingHp`, `ink`, `seed`, `hero`, `monsters`, `map`, `cells`; Cell_Spec `address`, `raw`, `locked`, `name`; Monster_Spec `id`, `at`, `move`, `atk`.
7. THE Serializer SHALL provide a text form that writes the Normalized_Document as JSON with two-space indentation, `\n` line endings and one trailing newline.
8. THE Serializer SHALL produce identical text for Levels that are equal under Level_Equality and SHALL NOT throw for any Level produced by the Loader.

### Requirement 11: Level Document Round Trip (Property-Based Test)

**User Story:** As a game developer, I want save and load to be lossless, so that no level changes meaning when it passes through the model.

#### Acceptance Criteria

1. FOR ALL valid Level_Documents, THE Sheet_Model SHALL satisfy `serialize(load(doc))` equal to the Normalized_Document of `doc`, computed by an independent oracle in the test suite that applies the Requirement 10 rules to the generated document directly.
2. FOR ALL Levels produced by the Loader, THE Sheet_Model SHALL satisfy `load(serialize(level))` equal to `level` under Level_Equality.
3. FOR ALL Levels produced by the Loader, THE Sheet_Model SHALL satisfy `loadText(serializeText(level))` equal to `level` under Level_Equality, and a second `serializeText` SHALL be character-for-character identical to the first.
4. FOR ALL valid Level_Documents, THE engine Sheet built from `doc` and the engine Sheet built from `serialize(load(doc))` SHALL hold identical Values in every Cell.
5. THE Sheet_Model test suite SHALL verify criteria 1 to 4 with fast-check, running at least 100 generated cases per property, using a generator that produces valid Level_Documents with 0 to 16 monsters, 0 to 240 Cell_Specs, Formulas, Literals, quotes and Unicode in strings, shuffled Cell_Spec order, lower-case column letters and names, explicit `locked: false`, Map_Area Cell_Specs that restate or override the Map character, and Cell_Specs that Requirement 10, criterion 4 removes.
6. IF a fast-check property fails, THEN THE Sheet_Model test suite SHALL fail the run and report the shrunk counterexample and the random seed.

### Requirement 12: Loader Totality (Property-Based Test)

**User Story:** As a game developer, I want the loader to never throw, so that no malformed file can crash the game or the solver.

#### Acceptance Criteria

1. FOR ALL JSON-compatible values, THE Loader SHALL return a Load_Result and SHALL NOT throw an exception.
2. FOR ALL input strings of 0 to 300,000 characters, THE text loader SHALL return a Load_Result and SHALL NOT throw an exception.
3. IF the input contains arrays or objects nested more than 100 levels deep, THEN THE Loader SHALL return a Load_Error with code `too-deep` and SHALL NOT throw a stack overflow; IF the input contains more than 100,000 nodes, THEN THE Loader SHALL return a Load_Error with code `too-large`.
4. IF the Loader meets an unexpected internal fault, THEN THE Loader SHALL return a Load_Error with code `internal-error` and SHALL NOT throw.
5. FOR ALL JSON-compatible values, THE Loader SHALL leave the input value unmodified.
6. THE Sheet_Model test suite SHALL verify criteria 1, 2, 3 and 5 with fast-check, running at least 100 generated cases per property, using generators that produce arbitrary JSON values, arbitrary strings, deeply nested arrays and objects, huge strings, and valid Level_Documents with one random mutation (field removed, field retyped, value replaced, unknown field added, address changed, map character changed).
7. IF a fast-check property fails, THEN THE Sheet_Model test suite SHALL fail the run and report the shrunk counterexample and the random seed.

### Requirement 13: Placement Invariants (Property-Based Test)

**User Story:** As a game developer, I want every loaded level to satisfy the placement rules without exception, so that the game never starts a hero inside a wall or a monster on a trap.

#### Acceptance Criteria

1. FOR ALL Level_Documents that the Loader accepts, THE Sheet SHALL hold a Walkable_Cell at the Hero_Start and a Floor_Cell at the start Address of every monster, and no two entities SHALL share an Address.
2. FOR ALL Level_Documents that the Loader accepts, every Rule_Name SHALL name exactly one non-empty Cell in rows 14 to 20, and every named Rules_Panel Cell SHALL have a Panel_Label whose computed Value is a non-empty string.
3. FOR ALL Level_Documents that the Loader accepts, every Cell_Name SHALL be unique and SHALL pass the engine's name validation, and row 13 SHALL hold no Cell.
4. FOR ALL Level_Documents that the Loader rejects, THE Loader SHALL return at least one Load_Error and SHALL NOT return a Sheet.
5. THE Sheet_Model test suite SHALL verify criteria 1 to 4 with fast-check, running at least 100 generated cases per property, using a generator that produces valid Level_Documents, Level_Documents with a hero on a blocking Cell, a monster on a wall, an exit, a trap or an error Cell, Level_Documents with invalid map characters, duplicate names, unknown rule names, rule names outside the Rules_Panel and missing labels.

### Requirement 14: Engine Public API Gap

**User Story:** As a game developer, I want the model to reuse the engine's own name and address checks, so that the model and the engine can never disagree about what a valid name is.

#### Acceptance Criteria

1. THE Formula_Engine SHALL export the operation `validateCellName` and the type `NameCheckFailure` from `src/engine/index.ts`.
2. WHEN the two exports are added, THE test file `src/engine/index.test.ts` SHALL be updated so that its expected runtime export list includes `validateCellName`, and the Formula_Engine SHALL change in no other way.
3. THE Sheet_Model SHALL obtain Cell_Name validation, Address parsing and Address formatting only from `src/engine/index.ts` and SHALL NOT duplicate the Cell_Name rules, the Address rules or the Formula parser.

### Requirement 15: Module Constraints

**User Story:** As a game developer, I want the model to stay a pure data layer, so that it runs in tests, in the headless solver and in the browser.

#### Acceptance Criteria

1. THE Sheet_Model SHALL export its public API from `src/model/index.ts` using named exports and no default export.
2. THE Sheet_Model SHALL NOT import any module under `src/game/` or `src/ui/`.
3. THE Sheet_Model SHALL NOT reference `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch`, `XMLHttpRequest` or any other browser-only global.
4. THE Sheet_Model SHALL NOT call `Math.random`, `Date.now` or `new Date`, and SHALL NOT use `eval` or `new Function`.
5. THE Sheet_Model SHALL NOT implement turns, movement, monster behaviour, damage, traps, haunting, undo, run state, a seeded generator or progress persistence.
6. WHEN the Sheet_Model test suite runs with Vitest under Node 22 or later without a browser, THE Sheet_Model SHALL complete all model tests with zero failures and zero DOM-related errors.
7. THE Sheet_Model SHALL contain no name of an AI tool other than Kiro in any file, comment, test name or message.
