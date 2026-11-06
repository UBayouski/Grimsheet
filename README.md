# Grimsheet

A roguelike where every monster is a formula. The whole dungeon is a spreadsheet, and you survive by editing the formulas in it.

## Scripts

- `npm run dev` — run the dev server
- `npm test` — run the unit and property tests
- `npm run verify` — tests, then typecheck and lint
- `npm run build` — type-check and build the production site into `dist/`
- `npm run e2e` — run the Playwright end-to-end tests

## Headless play command

`scripts/play.mjs` plays a level without a browser, for automated playtesting. It uses only the public game and level APIs and touches no DOM. It prints JSON on stdout, and exits `0` when it ran or non-zero only for bad input (an unknown level, malformed actions).

Build the bundle once, and again whenever the `src/` code changes:

```
npm run build:play
```

This writes `dist-play/headless.js`, which the script imports, so `scripts/play.mjs` then runs with plain `node`. (`dist-play/` is build output and is git-ignored.)

Play a level with an action list. The list uses the same action format as `tests/solutions/*.json`: a JSON array of `{ "kind": "move", "dir": "N|S|E|W" }`, `{ "kind": "wait" }` and `{ "kind": "edit", "address": "B14", "raw": "..." }`. It may be a bare array, or a whole solution object with an `actions` array.

```
# actions as a positional JSON argument
node scripts/play.mjs 01-the-corridor '[{"kind":"move","dir":"E"}]'

# actions from a file (a stored solution works directly)
node scripts/play.mjs 01-the-corridor --actions-file tests/solutions/01-the-corridor.json

# actions from stdin
node scripts/play.mjs 02-the-chaser < tests/solutions/02-the-chaser.json
```

Inspect without playing, or list the levels:

```
node scripts/play.mjs 02-the-chaser --level-info
node scripts/play.mjs --list
```

`npm run play -- <args>` is the same as `node scripts/play.mjs <args>`.

### Output

The play output is a JSON object with:

- `levelId`, and `start` (hero, hp, ink, turn, status, monsters) before any action.
- `steps`: one entry per action, with the `action`, whether it was `accepted`, the `reason` and `message` when refused, any `damage`, and the hero, hp, ink, turn and status after it. A refused action is reported, never thrown; `refusedAt` is the index of the first refusal, or absent.
- `final`: the same state view after the last action.
- `sheet`: every non-empty cell, as `address`, `raw`, `value`, `valueKind`, `locked` and `name`.

`--level-info` prints the level's `map`, `cells`, `monsters`, `hp`, `ink` and the rest, without playing.
