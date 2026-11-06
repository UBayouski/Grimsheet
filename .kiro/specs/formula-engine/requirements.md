# Requirements Document

## Introduction

The Formula_Engine is the DOM-free spreadsheet core of Grimsheet. It turns cell text into a token stream and an AST, prints an AST back to formula text, evaluates every cell over a dependency graph in topological order, detects circular references, and reports five error kinds. It implements the frozen formula subset defined in `docs/BRIEF.md` section 4 and `.kiro/steering/formulas.md`.

The engine lives under `src/engine/` and exposes its public API through `src/engine/index.ts`. It contains no game rules. Names and functions that depend on the hero or on a monster (`HERO`, `SELF`, `DIST`, `TOWARD`) and the random number source (`RAND`) read from an Evaluation_Context that the game layer supplies later. This spec defines the shape of that context and nothing more.

Sheet recalculation always takes an Evaluation_Context with a Hero_Address and a Random_Source, and stores a Value for every Cell, including Formulas that use `HERO` or `RAND()`. A Formula that contains `SELF` or calls `TOWARD` is a Rule_Cell, because `TOWARD` is measured from the Self_Address. During Sheet recalculation a Rule_Cell that is not on a circular reference is not evaluated and holds the "rule" Value kind, which the UI shows as the Formula text and not as an error. A Rule_Cell on a circular reference holds `#CYCLE!`, because `#CYCLE!` takes precedence over every other outcome (Requirement 13, criterion 9). Rule_Cells are evaluated with a Self_Address only by the explicit Per_Monster_Evaluation call, which takes a Cell and not formula text, and whose result goes to the caller and is not stored. A Cell that depends on a Rule_Cell sees `#VALUE!` unless the precedence rule applies. `RAND()` calls happen in a deterministic order, so that a fixed seed gives identical stored Values whatever order the Cells were defined or edited in.

Property-based testing with fast-check is enabled on exactly three requirements: Requirement 5 (parse, print, parse is stable), Requirement 11 (recalculation is independent of definition and edit order) and Requirement 12 (evaluation is total). All other requirements are covered by example-based unit tests.

Out of scope: absolute references (`$A$1`), other sheets, dates, text functions other than `&`, array formulas, `INDIRECT`, user-defined functions, iterative calculation, and every game rule.

## Glossary

- **Formula_Engine**: The complete `src/engine/` module, exposed through `src/engine/index.ts`.
- **Tokenizer**: The component that converts formula text into tokens, each with a 1-based column position.
- **Parser**: The recursive-descent component that converts tokens into an AST or a Parse_Error.
- **Printer**: The component that converts an AST into canonical formula text.
- **Evaluator**: The component that computes a Value for an AST within an Evaluation_Context.
- **Dependency_Graph**: The directed graph in which each Cell points to the Cells and names its formula references.
- **Recalculator**: The component that evaluates all Cells of a Sheet in topological order of the Dependency_Graph.
- **Sheet**: A fixed grid of Cells with columns `A` to `L` and rows `1` to `20`.
- **Cell**: A Sheet position with an Address, raw text, an optional name, and a computed Value.
- **Address**: A column letter `A` to `L` followed by a row number `1` to `20`, such as `B9`.
- **Cell_Name**: A case-insensitive identifier made of `A-Z`, `0-9` and `_`, starting with a letter or `_`, unique within one Sheet.
- **Raw_Text**: The text stored in a Cell. Text starting with `=` is a Formula; any other text is a Literal.
- **Formula**: Raw_Text that starts with `=`.
- **Literal**: Raw_Text that does not start with `=`. A Literal that reads as a decimal number is a number Value; any other Literal is a string Value taken as-is.
- **Value**: A number, a string, a boolean, an Error_Value, or a Rule_Value.
- **Rule_Value**: The Value of kind "rule" held, after Sheet recalculation, by a Rule_Cell that is not on a circular reference. It carries the Formula text, is not an Error_Value, and is shown by the UI as the Formula itself.
- **Rule_Cell**: A Cell whose Formula text contains the name `SELF` or a call to the function `TOWARD` anywhere, including inside an `IF` branch that is never taken. Detection is textual, like cycle detection in Requirement 13, criterion 7, and does not depend on any evaluated Value.
- **Per_Monster_Evaluation**: The explicit evaluation call that takes a Cell, identified by Address or Cell_Name, and an Evaluation_Context, optionally with a Self_Address. The call first checks that the Cell exists. For a Rule_Cell that is not on a circular reference, it then checks the Evaluation_Context, evaluates the Cell's Formula with the Self_Address and returns the result to the caller without storing it in the Sheet. For any other Cell, it returns the Cell's stored Value and neither requires nor validates the Evaluation_Context.
- **Error_Value**: One of `#REF!`, `#NAME?`, `#DIV/0!`, `#VALUE!` or `#CYCLE!`.
- **Range**: Two Addresses joined by `:`, such as `A14:A20`, covering the rectangle between them in row-major order.
- **Parse_Error**: A failure to parse a Formula, reported as `Col N: <message>.` where N is the 1-based column in the Raw_Text.
- **Evaluation_Context**: An object supplied by the caller of the Formula_Engine that holds the hero Address, the optional current monster Address, and a seeded random number function.
- **Hero_Address**: The Address of the hero held in the Evaluation_Context.
- **Self_Address**: The Address of the monster being evaluated, held in the Evaluation_Context. It is absent during Sheet recalculation and is supplied only for a Per_Monster_Evaluation call (and may be absent there too).
- **Random_Source**: A function in the Evaluation_Context that returns a number in [0, 1) and is the only source of randomness for the Formula_Engine.
- **Reference**: An Address, a Range or a Cell_Name appearing in a Formula.
- **Canonical_Form**: The text produced by the Printer for an AST.

## Requirements

### Requirement 1: Sheet and Cell Model

**User Story:** As a game developer, I want a fixed Sheet with addressable Cells and unique names, so that formulas have a well-defined space to reference.

#### Acceptance Criteria

1. THE Formula_Engine SHALL represent a Sheet as exactly 240 Cells arranged in 12 columns (`A` to `L`) by 20 rows (`1` to `20`), with exactly one Cell per Address.
2. WHEN an Address is supplied as input, THE Formula_Engine SHALL accept it only if its column is a single letter `A` to `L` (case-insensitive) and its row is a base-10 integer from `1` to `20` written without a leading zero, sign, decimal point, or surrounding whitespace.
3. IF an Address is supplied whose column is outside `A` to `L`, whose row is outside `1` to `20`, or whose text is otherwise malformed, THEN THE Formula_Engine SHALL reject it with an error indicating an invalid Address and leave the Sheet unchanged.
4. WHEN an Address is accepted, THE Formula_Engine SHALL convert the column letter to upper case in its Canonical_Form (for example, `b7` becomes `B7`).
5. WHEN a Cell_Name is assigned, THE Formula_Engine SHALL accept it only if all of the following hold: it matches the Cell_Name pattern; it is not a reserved name (`HERO`, `SELF`, `TRUE`, `FALSE`) under case-insensitive comparison; it is not a function name from Requirement 9 under case-insensitive comparison; and it does not read as an Address (column `A` to `L` followed by digits, case-insensitive).
6. IF a Cell_Name is assigned that fails any check in criterion 5, THEN THE Formula_Engine SHALL reject the assignment with an error indicating which check failed, keep the Cell's previous Cell_Name unchanged, and leave all other Cells unchanged.
7. IF a Cell_Name is assigned that is already used by another Cell in the same Sheet (compared case-insensitively), THEN THE Formula_Engine SHALL reject the assignment with an error that includes the conflicting name, keep the Cell's previous Cell_Name unchanged, and leave all other Cells unchanged.
8. WHEN a Cell has Raw_Text that does not start with `=` and reads as a decimal number (an optional leading `-` or `+`, one or more digits, and an optional `.` followed by one or more digits, with no surrounding whitespace), THE Formula_Engine SHALL give the Cell a number Value equal to that decimal number.
9. WHEN a Cell has Raw_Text that does not start with `=` and does not read as a decimal number as defined in criterion 8 (including empty Raw_Text), THE Formula_Engine SHALL give the Cell a string Value exactly equal to the Raw_Text.

### Requirement 2: Tokenizer

**User Story:** As a game developer, I want formula text split into precise tokens, so that the Parser and error messages can point to exact columns.

#### Acceptance Criteria

1. WHEN a Formula is tokenized, THE Tokenizer SHALL produce tokens for unsigned numbers (`3`, `2.5`), strings in double quotes, `TRUE`, `FALSE`, identifiers, Addresses, the operators `+ - * / & = <> < > <= >=`, parentheses, commas and `:`.
2. WHEN the Tokenizer reads an operator, THE Tokenizer SHALL produce the longest matching operator, so that `<=`, `>=` and `<>` are each one token and never two tokens.
3. WHEN the Tokenizer reads a number, THE Tokenizer SHALL accept one or more digits optionally followed by a single `.` and one or more digits, and SHALL treat `-` before a number as a separate operator token.
4. IF a number is followed immediately by a `.` with no digit after it, or contains a second `.`, THEN THE Tokenizer SHALL report a Parse_Error at the column of the offending `.` character.
5. THE Tokenizer SHALL record for every token its 1-based start column in the Raw_Text, counting the leading `=` as column 1.
6. THE Tokenizer SHALL skip space characters (U+0020) between tokens and SHALL NOT produce tokens for them.
7. THE Tokenizer SHALL match `TRUE`, `FALSE`, function names and Cell_Names case-insensitively.
8. WHEN a string literal contains a doubled double quote (`""`), THE Tokenizer SHALL read it as one double quote character within the string value and SHALL keep the string as a single token.
9. IF the Tokenizer meets a character that starts no valid token, including tab and newline characters, THEN THE Tokenizer SHALL report a Parse_Error at the column of that character and SHALL produce no tokens for the Formula.
10. IF a string literal has no closing double quote, THEN THE Tokenizer SHALL report a Parse_Error at the column of the opening double quote and SHALL produce no tokens for the Formula.
11. IF the Tokenizer meets `$`, THEN THE Tokenizer SHALL report a Parse_Error at the column of the `$` character with an error message indicating that absolute references are not supported.

### Requirement 3: Parser and AST

**User Story:** As a game developer, I want formulas parsed into a typed AST with the frozen operator precedence, so that evaluation is unambiguous.

#### Acceptance Criteria

1. WHEN a token sequence is valid, THE Parser SHALL produce an AST using recursive descent with node kinds for number, string, boolean, cell reference, range, name, unary minus, binary operation and function call.
2. THE Parser SHALL apply operator precedence, from highest to lowest: unary `-`; `*` and `/`; `+` and `-`; `&`; `=`, `<>`, `<`, `>`, `<=` and `>=`.
3. THE Parser SHALL treat `*`, `/`, `+`, `-`, `&` and the comparison operators as left-associative, so that `1-2-3` parses as `(1-2)-3`.
4. THE Parser SHALL treat parentheses as grouping that overrides precedence, so that `(1+2)*3` parses with the `+` operation as the left operand of `*`.
5. WHERE a Range appears as a direct argument of a function call, THE Parser SHALL accept the Range as an argument node of that function call.
6. IF a Range appears anywhere other than as a direct function argument, THEN THE Parser SHALL report a Parse_Error at the 1-based column of the first character of the Range and SHALL NOT produce an AST.
7. IF the Parser meets an unexpected token where an operand or closing parenthesis is required, THEN THE Parser SHALL report a Parse_Error at the 1-based column of the first character of that token and SHALL NOT produce an AST.
8. IF the end of input is reached where an operand or closing parenthesis is required, THEN THE Parser SHALL report a Parse_Error at the column one past the last character of the input and SHALL NOT produce an AST.
9. IF tokens remain after a complete expression has been parsed, THEN THE Parser SHALL report a Parse_Error at the 1-based column of the first character of the first remaining token and SHALL NOT produce an AST.
10. IF the token sequence contains more than one error, THEN THE Parser SHALL report only the Parse_Error with the lowest column and SHALL return the Parse_Error as a result value without throwing an exception.
11. THE Parser SHALL format each Parse_Error text as `Col N: <message>.`, where N is a positive integer with no leading zeros and the message is a non-empty sentence fragment of 1 to 100 characters.
12. WHEN an identifier is not followed by an opening parenthesis, THE Parser SHALL produce a name node for it without checking whether the Cell_Name exists.

### Requirement 4: Printer

**User Story:** As a game developer, I want an AST printed back to formula text, so that the UI can display and normalize formulas.

#### Acceptance Criteria

1. WHEN an AST is printed, THE Printer SHALL produce Formula text whose first character is `=` and which contains no leading or trailing whitespace.
2. WHEN an AST is printed, THE Printer SHALL print Addresses, function names, `TRUE` and `FALSE` in upper case.
3. WHEN an AST containing a string literal is printed, THE Printer SHALL print the string literal enclosed in double quotes with each embedded double quote replaced by two consecutive double quotes.
4. WHEN an AST is printed, THE Printer SHALL insert parentheses only where removing them would cause the Formula text to parse to a different AST.
5. WHEN an AST containing a function call with two or more arguments is printed, THE Printer SHALL separate adjacent arguments with exactly one comma followed by exactly one space.
6. WHEN an AST containing a binary operator is printed, THE Printer SHALL place exactly one space on each side of every binary operator.
7. WHEN an AST containing a number is printed, THE Printer SHALL print the number as the shortest decimal text that, when parsed, yields the same numeric value.
8. IF an AST contains a number that is not finite (NaN or infinity), THEN THE Printer SHALL reject the AST with an error indicating that the number cannot be printed, and SHALL NOT produce partial Formula text.
9. IF the AST is structurally invalid (an unknown node type or a missing required child node), THEN THE Printer SHALL reject the AST with an error indicating the invalid node, and SHALL NOT produce partial Formula text.

### Requirement 5: Parse-Print-Parse Stability (Property-Based Test)

**User Story:** As a game developer, I want printing and re-parsing to be stable, so that formula normalization never changes meaning.

#### Acceptance Criteria

1. WHEN the Formula_Engine test suite runs the round-trip property, THE Formula_Engine SHALL produce, for every valid Formula, an AST from parsing the first printed text that is structurally equal (same node kinds, operators, operands, and literal values) to the AST from the first parse.
2. WHEN the Formula_Engine test suite runs the fixed-point property, THE Formula_Engine SHALL produce, for every valid Formula, printed text from the second-parse AST that is character-for-character identical to the first printed text (the Canonical_Form is a fixed point).
3. THE Formula_Engine test suite SHALL verify criteria 1 and 2 with fast-check, running at least 100 generated cases per property, using a generator that produces random valid ASTs covering every node kind, every operator, parenthesis nesting depths from 0 to at least 5, and string literals of 0 to 50 characters that include embedded double quotes.
4. IF a fast-check property fails, THEN THE Formula_Engine test suite SHALL fail the test run and report the shrunk counterexample and the random seed so the failure can be reproduced.
5. IF the first print of a generated AST produces text that the parser rejects, THEN THE Formula_Engine test suite SHALL fail the property and report the generated AST and the printed text.

### Requirement 6: Parse Error Reporting

**User Story:** As a player, I want clear parse errors with a column, so that I can fix a formula without spending ink.

#### Acceptance Criteria

1. IF a Formula fails to parse, THEN THE Formula_Engine SHALL return exactly one Parse_Error for that Formula and SHALL leave the Cell Raw_Text, the Cell Value and the Dependency_Graph identical to their values before the edit was attempted.
2. IF a Formula fails to parse, THEN THE Formula_Engine SHALL report the Parse_Error for the leftmost column at which the parse fails.
3. THE Formula_Engine SHALL format every Parse_Error as `Col N: <message>.` where N is a positive integer counted from 1 at the leading `=`, and where `<message>` is a non-empty text of at most 80 characters that names the unexpected or missing element.
4. IF the failure position lies beyond the last character of the Raw_Text, THEN THE Formula_Engine SHALL report N as the length of the Raw_Text plus 1.
5. WHEN the Raw_Text is a Literal, THE Formula_Engine SHALL accept the Raw_Text without parsing, SHALL NOT return a Parse_Error, and SHALL store the Raw_Text in the Cell.
6. IF a Formula fails to parse, THEN THE Formula_Engine SHALL return a result with a boolean accepted/refused indicator set to refused, and WHEN an edit is accepted, THE Formula_Engine SHALL return the indicator set to accepted, so that the caller can distinguish the two without inspecting the message text.

### Requirement 7: References and Names

**User Story:** As a player, I want formulas to refer to cells by address or by name, so that I can read and rewrite game rules.

#### Acceptance Criteria

1. WHEN a Formula contains an Address whose column is in `A` to `L` and whose row is in `1` to `20`, THE Evaluator SHALL use the current Value of the referenced Cell as the operand value.
2. IF a Formula contains an Address whose column is beyond `L` or whose row is `0` or beyond `20`, THEN THE Evaluator SHALL evaluate that reference to `#REF!`.
3. WHEN a Formula contains a Cell_Name that exists in the Sheet, THE Evaluator SHALL use the current Value of the named Cell as the operand value.
4. IF a Formula contains a name that is not a Cell_Name in the Sheet and is not `HERO` or `SELF`, THEN THE Evaluator SHALL evaluate that name to `#REF!`.
5. WHEN a Formula contains a reference to an empty Cell as an operand of an arithmetic operation, THE Evaluator SHALL use the number `0` as the operand value.
6. WHEN a Formula contains a reference to an empty Cell as an operand of `&` concatenation, THE Evaluator SHALL use the empty string (length 0) as the operand value.
7. WHEN a Formula compares a reference to an empty Cell with a string, THE Evaluator SHALL use the empty string (length 0) as the empty Cell's value in the comparison.
8. WHEN a Formula compares a reference to an empty Cell with a number or with another empty Cell, THE Evaluator SHALL use the number `0` as the empty Cell's value in the comparison.
9. WHEN a Formula compares a reference to an empty Cell with a boolean, THE Evaluator SHALL use the boolean `FALSE` as the empty Cell's value in the comparison.
10. IF a Formula compares a non-empty string with a number, THEN THE Evaluator SHALL evaluate the comparison to `#VALUE!`.
11. IF a Range is used as a value outside a function that accepts ranges, THEN THE Evaluator SHALL evaluate that argument to `#REF!`.
12. IF a Range contains an Address outside the Sheet (column beyond `L`, or row `0` or beyond `20`), THEN THE Evaluator SHALL evaluate the Range argument to `#REF!`.
13. IF a reference evaluates to `#REF!`, THEN THE Evaluator SHALL keep the Formula text and the Values of all other Cells unchanged, and SHALL show `#REF!` as the Value of the Cell containing the Formula.

### Requirement 8: Evaluation Context and Special Names

**User Story:** As a game developer, I want the engine to take hero and monster bindings and a random source through a context, so that game rules can be added later without engine changes.

#### Acceptance Criteria

1. WHEN a Sheet recalculation call is made with an Evaluation_Context containing exactly one Hero_Address and exactly one Random_Source, THE Formula_Engine SHALL accept the call and SHALL evaluate the Sheet using that Evaluation_Context.
2. WHEN a Per_Monster_Evaluation call is made for a Cell that exists and is a Rule_Cell not on a circular reference, with an Evaluation_Context containing exactly one Hero_Address, zero or one Self_Address and exactly one Random_Source, THE Formula_Engine SHALL accept the call and SHALL evaluate using that Evaluation_Context.
3. IF a Sheet recalculation call is made with an Evaluation_Context that has no Hero_Address or no Random_Source, or IF a Per_Monster_Evaluation call is made for an existing Rule_Cell that is not on a circular reference with an Evaluation_Context that has no Hero_Address or no Random_Source, THEN THE Formula_Engine SHALL reject the call with an error naming the missing field, SHALL leave every stored Cell Value and Raw_Text of the Sheet unchanged, and SHALL return no evaluation result. A missing Self_Address is not an error in a Per_Monster_Evaluation call; `SELF` and `TOWARD` then evaluate to `#REF!` according to criterion 8 and Requirement 9, criterion 24.
4. WHILE a Sheet recalculation is in progress, THE Recalculator SHALL ignore the Self_Address of the Evaluation_Context, including when the Evaluation_Context contains one, so that no stored Value depends on a Self_Address.
5. WHEN a Formula contains the name `HERO` and the Hero_Address is inside the Sheet bounds, THE Evaluator SHALL evaluate it to the reference to the Cell at the Hero_Address.
6. IF a Formula contains the name `HERO` and the Hero_Address is outside the Sheet bounds, THEN THE Evaluator SHALL evaluate it to `#REF!`.
7. WHEN a Per_Monster_Evaluation evaluates the name `SELF` and the Evaluation_Context has a Self_Address inside the Sheet bounds, THE Evaluator SHALL evaluate it to the reference to the Cell at the Self_Address.
8. IF a Per_Monster_Evaluation evaluates the name `SELF` and the Evaluation_Context has no Self_Address or has a Self_Address outside the Sheet bounds, THEN THE Evaluator SHALL evaluate it to `#REF!`.
9. WHEN a Formula passes `HERO`, `SELF` or a Cell_Name to `ROW`, `COL`, `DIST` or `TOWARD`, THE Evaluator SHALL use the Address that the name resolves to, and SHALL NOT use the Value of the Cell at that Address.
10. WHEN a Formula uses `HERO` or `SELF` as an argument where a plain Value is required, THE Evaluator SHALL use the Value of the referenced Cell, and IF that Cell is empty, THE Evaluator SHALL treat it as the empty-Cell Value defined for ordinary Cell references.
11. THE Formula_Engine SHALL obtain every random number from the Random_Source and SHALL NOT call `Math.random`.
12. THE Formula_Engine SHALL NOT read hero, monster, HP, ink or turn state from any source other than the Evaluation_Context and the Sheet.
13. WHEN a Sheet is recalculated, THE Recalculator SHALL store a Value for every Cell, including Cells whose Formulas use `HERO` or `RAND()`.
14. WHEN a Sheet is recalculated, THE Recalculator SHALL give every Rule_Cell that is not on a circular reference a Rule_Value, SHALL NOT evaluate any part of the Rule_Cell Formula, and SHALL NOT give the Rule_Cell an Error_Value on account of `SELF` or `TOWARD`. A Rule_Cell is a Cell whose Formula contains the name `SELF` or calls `TOWARD`. A Rule_Cell on a circular reference is governed by Requirement 13, criterion 9.
15. WHEN a Rule_Cell that is not on a circular reference holds a Rule_Value, THE Formula_Engine SHALL report its Value kind as "rule", distinct from the kind of every Error_Value, and SHALL provide the Raw_Text of the Cell as its display text, so that the UI shows the Formula and not an error. WHEN a Rule_Cell is on a circular reference, THE Formula_Engine SHALL report its Value as `#CYCLE!` with the display text `#CYCLE!` according to Requirement 10, criterion 9, and SHALL provide the Formula text as neither its Value nor its display text.
16. WHEN a Per_Monster_Evaluation call is made for a Rule_Cell that is not on a circular reference, THE Formula_Engine SHALL evaluate the Formula of the Rule_Cell with the Self_Address of the Evaluation_Context, SHALL return the result only to the caller of that call without storing it, and SHALL leave every stored Cell Value unchanged.
17. WHEN a Formula references a Rule_Cell that is not on a circular reference by Address, by Cell_Name or as a Range member, and the Value of the Rule_Cell is required, THE Evaluator SHALL evaluate that reference to `#VALUE!`, subject to the precedence in Requirement 13, criterion 9.
18. WHEN a Per_Monster_Evaluation call is made for an existing Cell that is not a Rule_Cell, or for a Rule_Cell on a circular reference, THE Formula_Engine SHALL return the stored Value of that Cell without requiring or validating the Evaluation_Context, and SHALL leave every stored Cell Value unchanged. For an empty Cell, the stored Value is the empty string `""` as defined in Requirement 1, criterion 9.
19. IF a Per_Monster_Evaluation call is made with an Address outside the Sheet or a Cell_Name that is not assigned, THEN THE Formula_Engine SHALL report that the Cell does not exist, as defined in Requirement 14, criterion 3, before checking the Evaluation_Context, so that an invalid Evaluation_Context does not change that outcome.

### Requirement 9: Operators and Functions

**User Story:** As a player, I want the documented operators and functions to behave predictably, so that I can reason about rules.

#### Acceptance Criteria

1. WHEN a Formula applies arithmetic `+`, `-`, `*` or `/`, or unary `-`, to numbers, THE Evaluator SHALL return the numeric result.
2. IF `/` is evaluated with a divisor equal to `0`, THEN THE Evaluator SHALL evaluate the expression to `#DIV/0!`.
3. WHEN a Formula applies `&`, THE Evaluator SHALL return the concatenation of the left and right operands as a string, converting each number to its printed decimal text and each boolean to `TRUE` or `FALSE`.
4. WHEN a Formula applies `=`, `<>`, `<`, `>`, `<=` or `>=` to two numbers, two strings or two booleans, or to operands that the empty-Cell rules in Requirement 7 criteria 5 to 9 turn into two numbers, two strings or two booleans, THE Evaluator SHALL return a boolean, comparing two strings as defined in criterion 25.
5. WHEN `SUM`, `MIN` or `MAX` is called with 1 or more arguments, THE Evaluator SHALL compute the result over all numeric members of every argument, where an argument may be a Range or a single Value, and SHALL ignore empty Cells and string Values that come from Range members.
6. WHEN `SUM`, `MIN` or `MAX` is called and the arguments contain no numeric members, THE Evaluator SHALL return `0` for `SUM` and evaluate the call to `#VALUE!` for `MIN` and `MAX`.
7. WHEN `ABS(x)` is called with a number, THE Evaluator SHALL return the absolute value of `x`.
8. WHEN `MOD(a, b)` is called with two numbers and `b` is not `0`, THE Evaluator SHALL return a result that has the sign of `b` (or is `0`) and whose absolute value is less than the absolute value of `b`.
9. IF `MOD` is called with `b` equal to `0`, THEN THE Evaluator SHALL evaluate the call to `#DIV/0!`.
10. WHEN `IF(cond, then, else)` is called with a boolean `cond`, THE Evaluator SHALL return `then` if `cond` is `TRUE` and `else` if `cond` is `FALSE`.
11. WHEN `AND(...)`, `OR(...)` or `NOT(x)` is called with boolean arguments, THE Evaluator SHALL return a boolean, where `AND` and `OR` accept 1 or more arguments and `NOT` accepts exactly 1 argument.
12. WHEN `ROW(ref)` or `COL(ref)` is called with a reference, THE Evaluator SHALL return the 1-based row number or the 1-based column number of that reference respectively (column `A` is `1`).
13. WHEN `DIST(a, b)` is called with two references, THE Evaluator SHALL return the Manhattan distance between the two referenced Addresses, being the absolute row difference plus the absolute column difference.
14. WHEN `TOWARD(target)` is called with a reference and the Self_Address does not equal the target Address, THE Evaluator SHALL return `"N"`, `"S"`, `"E"` or `"W"`, being the single step from the Self_Address toward the target Address along the axis with the larger absolute distance, and SHALL choose the vertical axis when the absolute distances are equal.
15. WHEN `TOWARD(target)` is called with a reference and the Self_Address equals the target Address, THE Evaluator SHALL return `"-"`.
16. THE Evaluator SHALL treat `N` as toward row 1, `S` as toward row 20, `W` as toward column `A` and `E` as toward column `L`.
17. WHEN `RAND()` is called with 0 arguments, THE Evaluator SHALL return the next number from the Random_Source.
18. IF a function is called with a number of arguments different from the number its definition accepts (`ABS`, `NOT`, `ROW`, `COL` and `TOWARD`: exactly 1; `MOD` and `DIST`: exactly 2; `IF`: exactly 3; `RAND`: exactly 0; `SUM`, `MIN`, `MAX`, `AND` and `OR`: 1 or more), THEN THE Evaluator SHALL evaluate the call to `#VALUE!`.
19. IF a Formula calls a function whose name is not listed in this requirement, THEN THE Evaluator SHALL evaluate the call to `#NAME?`.
20. WHEN a Formula calls a function whose name is not listed in this requirement, THE Parser SHALL accept the call as syntactically valid.
21. IF an operator or function receives a Value of the wrong type (such as a string where a number is needed, a number or string where a boolean is needed, a non-boolean `cond` in `IF`, or a non-boolean argument in `AND`, `OR` or `NOT`), THEN THE Evaluator SHALL evaluate the expression to `#VALUE!`.
22. IF a comparison operator receives two operands of different types after the empty-Cell rules in Requirement 7 criteria 5 to 9 have been applied (such as a non-empty string and a number, or a number and a boolean), THEN THE Evaluator SHALL evaluate the expression to `#VALUE!`.
23. IF `ROW`, `COL`, `DIST` or `TOWARD` receives an argument that is not a reference, THEN THE Evaluator SHALL evaluate the call to `#VALUE!`.
24. IF `TOWARD` is evaluated by a Per_Monster_Evaluation and the Self_Address is absent, THEN THE Evaluator SHALL evaluate the call to `#REF!`.
25. WHEN `=`, `<>`, `<`, `>`, `<=` or `>=` is applied to two strings, including an empty Cell that Requirement 7, criterion 7 turns into the empty string, THE Evaluator SHALL convert each string with `String.prototype.toUpperCase` (locale-independent) and compare the converted strings ordinally by UTF-16 code unit, so that `"a" = "A"` is `TRUE` and `"a" < "B"` is `TRUE`.

### Requirement 10: Error Values and Propagation

**User Story:** As a player, I want errors to follow fixed rules, so that I can break or fix a rule on purpose.

#### Acceptance Criteria

1. IF a division has a divisor that evaluates to the number 0 (including -0), THEN THE Evaluator SHALL evaluate the division to `#DIV/0!`.
2. IF `MOD(a, b)` has `b` that evaluates to the number 0 (including -0), THEN THE Evaluator SHALL evaluate the call to `#DIV/0!`.
3. IF an argument or operand evaluates to an Error_Value, THEN THE Evaluator SHALL evaluate the enclosing operator or function to that same Error_Value, without altering its kind, and SHALL leave the contents of all Cells unchanged.
4. IF two or more operands or arguments of one operator or function call evaluate to Error_Values, THEN THE Evaluator SHALL evaluate the call, among Error_Values other than `#CYCLE!`, subject to Requirement 13, criterion 9, to the Error_Value of the leftmost operand or argument in source order, regardless of the kind of each Error_Value.
5. WHEN `IF` evaluates its condition to `TRUE`, THE Evaluator SHALL evaluate only the `then` argument and SHALL NOT evaluate the `else` argument, so that an Error_Value in the `else` argument does not affect the result.
6. WHEN `IF` evaluates its condition to `FALSE`, THE Evaluator SHALL evaluate only the `else` argument and SHALL NOT evaluate the `then` argument, so that an Error_Value in the `then` argument does not affect the result.
7. IF the `IF` condition evaluates to an Error_Value, THEN THE Evaluator SHALL evaluate the `IF` call to that Error_Value and SHALL NOT evaluate the `then` or `else` argument.
8. IF a Range member holds an Error_Value and the Range is passed to `SUM`, `MIN` or `MAX`, THEN THE Evaluator SHALL evaluate the call, among Error_Values other than `#CYCLE!`, subject to Requirement 13, criterion 9, to the first Error_Value found when scanning the Range's Cells in row-major order (top row first, left to right within each row).
9. THE Formula_Engine SHALL represent each Error_Value as one of exactly five distinct values whose display text is exactly `#REF!`, `#NAME?`, `#DIV/0!`, `#VALUE!` or `#CYCLE!`, such that the display text of each value differs from that of the other four.
10. WHEN a Cell evaluates to an Error_Value, THE Formula_Engine SHALL provide for that Cell a plain-English cause of 1 to 200 characters that names each Address or name involved, such as "B9 refers to M30, which does not exist".
11. IF a Cell's Error_Value was propagated from another Cell or operand, THEN THE Formula_Engine SHALL provide a cause of 1 to 200 characters that names the Address or name where the Error_Value originated.
12. IF a Cell evaluates to `#VALUE!` because it references a Rule_Cell that is not on a circular reference, THEN THE Formula_Engine SHALL provide a plain-English cause of 1 to 200 characters that names the Rule_Cell by its Address, and by its Cell_Name when it has one, and states that the Rule_Cell is a rule.
13. IF a cause for an Error_Value would exceed 200 characters, THEN THE Formula_Engine SHALL provide a cause truncated to at most 200 characters that still begins with the originating Address or name.

### Requirement 11: Dependency Graph and Order-Independent Recalculation (Property-Based Test)

**User Story:** As a player, I want results that never depend on the order I or the level author defined cells, so that the sheet behaves like a real spreadsheet.

#### Acceptance Criteria

1. WHEN Formulas are set, THE Formula_Engine SHALL build a Dependency_Graph containing one edge from each Cell to every Cell reached by its Addresses, to every member Address of each of its Ranges, and to every Cell reached by its Cell_Names.
2. WHEN a Sheet is recalculated, THE Recalculator SHALL evaluate each Cell only after every Cell it depends on has been evaluated, in topological order of the Dependency_Graph.
3. WHEN the Raw_Text of a Cell is changed, THE Recalculator SHALL produce, for every Cell in the Sheet, a Value equal to the Value produced by a full recalculation of the same Sheet from scratch, using the same Cell_Names, Evaluation_Context and Random_Source seed.
4. WHEN the same final Raw_Text, Cell_Names, Evaluation_Context and Random_Source seed are given, THE Recalculator SHALL produce the same stored Value for every Cell regardless of the order in which Cells were defined or edited.
5. FOR ALL Sheets, all Random_Source seeds and all permutations of the order in which the same Cells were defined, THE Recalculator SHALL produce stored Values for every Cell that are identical to the Values produced by the original definition order.
6. FOR ALL Sheets, all Random_Source seeds and all sequences of edits that end in the same final Raw_Text for every Cell, THE Recalculator SHALL produce stored Values for every Cell that are identical across those sequences.
7. THE Formula_Engine test suite SHALL verify criteria 5 and 6 with fast-check properties, each running at least 100 generated cases, using a generator that produces random Sheets of 1 to 50 Cells with random Addresses, Ranges, Cell_Names, `RAND()` calls, Rule_Cells and cyclic references, random seeds, and random shuffles of definition order and edit order.
8. IF fast-check finds a counterexample for a property in criterion 7, THEN THE Formula_Engine test suite SHALL fail and report the seed and the shrunk counterexample.
9. IF a Sheet contains a cycle, THEN THE Recalculator SHALL produce the same error Value for each Cell in the cycle, including each Rule_Cell in the cycle, regardless of definition order, and SHALL leave Values of Cells outside the cycle that do not depend on it unchanged.
10. WHERE `RAND()` appears in a Sheet, THE Recalculator SHALL make the `RAND()` calls in topological order of the Dependency_Graph, and among Cells whose dependencies have all been evaluated SHALL evaluate first the Cell with the lowest row and, within that row, the lowest column (Address reading order), so that the same Random_Source seed gives the same stored Values.
11. THE Recalculator SHALL NOT evaluate Rule_Cells during recalculation, and SHALL NOT draw any random number from the Random_Source on behalf of a Rule_Cell, including a Rule_Cell that also contains `RAND()` and a Rule_Cell that holds `#CYCLE!`, so that the presence, absence or position of Rule_Cells does not change the random numbers drawn by other Cells.

### Requirement 12: Total Evaluation (Property-Based Test)

**User Story:** As a game developer, I want evaluation to never throw, so that no player edit can crash the game.

#### Acceptance Criteria

1. FOR ALL Raw_Text strings of 0 to 10,000 characters, including arbitrary Unicode, THE Formula_Engine SHALL return exactly one of a Parse_Error or a parsed AST, and SHALL NOT throw an exception.
2. FOR ALL Sheets and all Evaluation_Contexts, THE Recalculator SHALL end with every Cell holding exactly one Value (a number, a string, a boolean, an Error_Value or a Rule_Value, where a Rule_Cell on a circular reference holds `#CYCLE!`), and SHALL NOT throw an exception.
3. FOR ALL Sheets, THE Recalculator SHALL terminate within 5,000 milliseconds, including Sheets with reference chains of up to 240 Cells (the whole Sheet), self-references and cyclic references.
4. THE Formula_Engine test suite SHALL verify criteria 1 to 3 with fast-check, running at least 100 generated cases per property, using generators that produce arbitrary strings, random valid formulas, deeply nested formulas, out-of-range references, unknown names, unknown functions, and arbitrary Evaluation_Contexts.
5. IF the Evaluator meets an arithmetic result that is not a finite number (NaN, positive infinity or negative infinity), THEN THE Evaluator SHALL evaluate the expression to `#VALUE!`.
6. IF a Formula is nested deeper than 200 levels, THEN THE Formula_Engine SHALL return a Parse_Error for that Formula, SHALL NOT throw an exception (including a stack overflow), and SHALL leave the other Cells of the Sheet unchanged.
7. IF a fast-check property fails, THEN THE Formula_Engine test suite SHALL mark the test as failed and SHALL output the shrunk counterexample and the seed needed to reproduce the failure.

### Requirement 13: Cycle Detection

**User Story:** As a player, I want circular references to be detected and marked, so that I can find and break the haunting.

#### Acceptance Criteria

1. WHEN the Recalculator recalculates a Cell, including a Rule_Cell, that depends on itself directly or through one or more other Cells, THE Recalculator SHALL set that Cell's value to `#CYCLE!`.
2. WHEN the Recalculator completes a recalculation, THE Recalculator SHALL have set `#CYCLE!` on every Cell, including every Rule_Cell, that lies on a circular reference, including every Cell of a cycle that spans two or more Cells and every Cell that references itself.
3. WHEN a Cell outside a circular reference has an operand that evaluates to `#CYCLE!` because the operand depends on a Cell that holds `#CYCLE!`, THE Recalculator SHALL set that Cell to `#CYCLE!` according to criterion 9, except where the dependency lies in the branch that `IF` does not take, because an Error_Value in an untaken `IF` branch is not an operand.
4. WHEN an edit removes a circular reference, THE Recalculator SHALL clear `#CYCLE!` from every Cell that is no longer on a cycle and recompute those Cells normally within the same recalculation, giving a Rule_Cell that is no longer on a cycle its Rule_Value, so that no Cell that is off every cycle retains `#CYCLE!` that originated from the removed cycle.
5. WHEN the cycle query is invoked, THE Formula_Engine SHALL return a list of the Addresses of all Cells that lie on a circular reference, ordered by row ascending and then by column ascending within each row, containing each Address at most once.
6. IF no Cell lies on a circular reference, THEN THE Formula_Engine SHALL return an empty list from the cycle query.
7. WHEN the Dependency_Graph is built, THE Recalculator SHALL decide cycles from the references that the Formula text contains, whether or not `IF` would take the branch that holds the reference.
8. WHEN a Formula contains an out-of-sheet reference or an unknown name, THE Dependency_Graph SHALL contain no edge for it.
9. THE Formula_Engine SHALL give `#CYCLE!` precedence over every other outcome and every other Error_Value, both on a circular reference and downstream of it, so that (a) a Cell on a circular reference holds `#CYCLE!` and never a Rule_Value, a `#VALUE!` caused by a dependency on a Rule_Cell, or any other Value, (b) a Cell with any operand or argument that evaluates to `#CYCLE!`, including a Range member, holds `#CYCLE!` regardless of any other Error_Value among its operands and regardless of Requirement 10, criterion 4, which applies only among Error_Values other than `#CYCLE!`, (c) an Error_Value in the branch that `IF` does not take is not an operand and does not trigger this precedence, and (d) a Per_Monster_Evaluation of a Cell on a circular reference returns `#CYCLE!`.

### Requirement 14: Public API and Constraints

**User Story:** As a game developer, I want a small DOM-free API and strict implementation rules, so that the engine runs in tests, in a headless solver and in the browser.

#### Acceptance Criteria

1. THE Formula_Engine SHALL export its public API from `src/engine/index.ts` using named exports and SHALL NOT provide a default export.
2. THE Formula_Engine API SHALL provide one named export for each of the following operations: parse text, print an AST, create a Sheet, set Raw_Text of a Cell, assign a Cell_Name, recalculate with an Evaluation_Context, read the Value of a Cell by Address, read the Value of a Cell by name, evaluate a Cell, identified by Address or Cell_Name, with an Evaluation_Context (the Per_Monster_Evaluation call), list cycle Cells, and describe an Error_Value on a Cell.
3. IF a caller invokes an API operation that reads a Cell Value by Address or by name, or invokes the Per_Monster_Evaluation call, and the Address is outside the Sheet or the name is not assigned, THEN THE Formula_Engine SHALL return a result indicating that the Cell does not exist and SHALL leave the Sheet unchanged.
4. IF a caller invokes the parse text operation with text that is not valid in the supported syntax, THEN THE Formula_Engine SHALL return a Parse_Error and SHALL NOT throw an exception.
5. THE Formula_Engine SHALL implement the Tokenizer and the Parser by hand and SHALL NOT use `eval` or `new Function` anywhere under `src/engine/`.
6. THE Formula_Engine SHALL NOT reference `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `fetch`, `XMLHttpRequest` or any other global object or function that exists only in browsers anywhere under `src/engine/`.
7. THE Formula_Engine SHALL NOT import any module whose path begins with `src/model/`, `src/game/` or `src/ui/` from any file under `src/engine/`.
8. WHEN the Formula_Engine test suite is run with Vitest under Node 22 or later without a browser, THE Formula_Engine SHALL complete all engine tests with zero failures and zero DOM-related errors.
9. THE Formula_Engine SHALL NOT implement HP, ink, turns, movement, monsters, traps, haunting damage or any other game rule.
10. IF a Formula uses syntax or a function outside the frozen subset (absolute references, other sheets, dates, text functions other than `&`, array formulas, `INDIRECT`, user-defined functions, iterative calculation), THEN THE Formula_Engine SHALL report a Parse_Error for unsupported syntax or `#NAME?` for an unsupported function name according to Requirements 2, 3 and 9, and SHALL NOT evaluate the unsupported part.
