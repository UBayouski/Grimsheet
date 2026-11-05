---
inclusion: fileMatch
fileMatchPattern: "src/engine/**"
---

# Formula engine rules (frozen subset)

Anything not listed here is out of scope. Do not add features without updating `docs/BRIEF.md` section 4.

## Syntax
- A formula starts with `=`. A cell without `=` is a literal: a number, or text taken as-is.
- Literals: numbers (`3`, `2.5`), strings in double quotes, `TRUE`, `FALSE`.
- Operator precedence, high to low: unary `-`; `*` `/`; `+` `-`; `&` (text join); `=` `<>` `<` `>` `<=` `>=`.
  Parentheses group.
- References: a cell (`B9`), a range (`A14:A20`) only inside a function argument, or a cell name (`HP`, `KEY`).
- Special names: `HERO` (hero's cell) and `SELF` (the monster being evaluated; `#REF!` elsewhere).

## Functions
`SUM`, `MIN`, `MAX` (range or values), `ABS(x)`, `MOD(a, b)`, `IF(cond, then, else)`, `AND(...)`, `OR(...)`,
`NOT(x)`, `ROW(ref)`, `COL(ref)` (1-based), `DIST(a, b)` (Manhattan), `TOWARD(target)` (`"N"|"S"|"E"|"W"` along the
axis with the larger distance, ties vertical, `"-"` when already there), `RAND()` (seeded, in [0, 1)).

## Evaluation
- Recalculate in topological order of the dependency graph. Results never depend on definition or edit order.
- Evaluation never throws. Every cell ends as a value or an error.
- Errors: out-of-sheet reference or unknown name is `#REF!`; unknown function is `#NAME?`; division by zero is
  `#DIV/0!`; wrong type is `#VALUE!`; every cell on a circular reference is `#CYCLE!`.
- Errors in arguments propagate, except inside the branch `IF` does not take.
- Parse errors are reported as `Col N: <message>.` and the edit is refused (no ink spent).

## Not included
Absolute references (`$A$1`), other sheets, dates, text functions other than `&`, array formulas, `INDIRECT`,
user-defined functions, iterative calculation.

## Implementation constraints
- No `eval`, no `new Function`. No DOM, `window` or `localStorage` access.
- Hand-written tokenizer and recursive-descent parser to an AST; a printer must round-trip: parse, print, parse is
  stable.
- Randomness only through the seeded generator passed in.
- Cover changes with property tests: round-trip, order independence, totality.
