---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**", "**/*.css"]
---

# Sheet UI and visual design

## Look
- A spreadsheet that has gone wrong. Late-1990s office chrome: grey bevels, column letters, row numbers, gridlines,
  a formula bar, and a status bar showing HP, ink and turn. Title bar reads `GRIMSHEET.XLS`.
- **No real product names, logos or trademarks anywhere**: not in text, class names, assets, fonts or comments.
- Cells are square and monospace. Glyphs first; optional 16x16 sprites for hero, monster and error monsters.
- Open-licensed fonts only, self-hosted. No external CDN or font requests.

## Structure
- The grid is a DOM table styled with CSS. No UI framework.
- Only `src/ui/` touches the DOM, `localStorage` or Web Audio. Game logic stays in `src/game/`.
- Clicking a cell shows its formula in the formula bar. Locked cells show a padlock and cannot be edited.
- Parse errors show as `Col N: <message>.` in the formula bar.
- Hovering an error cell explains its cause in plain English, for example "B9 refers to M30, which does not exist".

## Error looks
`#REF!` coffin, `#NAME?` tombstone with a blank name, `#DIV/0!` crack into the void, `#VALUE!` wilted grey cell,
`#CYCLE!` ghost drifting along the cycle.

## Motion and sound
- Small animations only: recalculated cells flash, hero slides one cell, ghost drifts, sheet shakes on damage.
- Always honor `prefers-reduced-motion` by disabling or minimizing them.
- Sound is short square-wave beeps from Web Audio, generated in code. No sound files.

## Screens
Title screen is a spreadsheet splash. The death screen is a dialog: "GRIMSHEET.XLS has stopped responding" with a
Recover button that restarts the level.

## Accessibility
Keyboard play (arrows, Space) must work fully. Provide visible focus, sufficient contrast, and text equivalents
(`aria-label`) for glyph and sprite cells. Never convey state by color alone.
