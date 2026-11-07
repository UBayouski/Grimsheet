---
name: "play-level"
description: "Run a Grimsheet level headlessly with an action list and report whether it was won, the end HP and the ink spent. Use when asked to playtest a level, replay a stored solution, probe a level for an exploit, or check ink use."
license: "MIT"
metadata:
  author: "Grimsheet"
  version: "1.0.0"
---

# Play a Grimsheet level

Wraps `scripts/play.mjs`, the headless play command. Run every command from the repo root. Do not edit `src/` or `scripts/play.mjs` while playtesting; report findings only.

## 1. Build the bundle

```
npm run build:play
```

This writes `dist-play/headless.js`. Rerun it whenever `src/` has changed. If `dist-play/` is missing, play exits 2 with "the play bundle is missing".

## 2. Find and inspect levels

```
node scripts/play.mjs --list
node scripts/play.mjs <level-id> --level-info
```

`--list` prints `{"levels": [...]}`. `--level-info` describes a level without playing it (`title`, `hint`, `startingHp`, `ink`, `seed`, `hero`, `monsters`, `map`, `cells` with `raw` and `locked`), so read it before writing an action list.

## 3. Run an action list

The list is a JSON array, or an object with an `"actions"` array, like `tests/solutions/*.json` (which also carry `levelId` and `minimalInk`). Actions:

- `{"kind": "move", "dir": "N"}` with `dir` one of `N`, `S`, `E`, `W`
- `{"kind": "wait"}`
- `{"kind": "edit", "address": "B14", "raw": "7"}` (costs 1 ink if the formula changes; `raw` is the cell text as typed)

Ways to pass it:

```
node scripts/play.mjs <level-id> --actions-file <path>
Get-Content actions.json | node scripts/play.mjs <level-id>
node scripts/play.mjs <level-id> '<json>'
```

The inline form works in bash but not in Windows PowerShell, which strips the inner double quotes (exit 2, "not valid JSON"). In PowerShell use `--actions-file` or stdin. The `<level-id>` is always passed explicitly; a solution file's `levelId` is not read by the command. For throwaway probes, write the list to a temp file outside the repo and delete it afterwards.

## 4. Read the result

Output is JSON: `start`, one entry in `steps`, then `final`.

- Won: `final.status` is `"won"` (otherwise `"playing"` or a losing status).
- End HP: `final.hp`.
- Ink spent: `start.ink - final.ink`. Compare it with the solution file's `minimalInk`.
- Per step: `accepted` (false means the action was refused), `damage`, `hero`, `hp`, `ink`, `turn`, `status`.

Exit 0 means it ran. Exit 2 means bad input (unknown level, bad JSON, bad action, missing bundle); read stderr.

## Tips

- A zero-edit probe uses only `move` and `wait` actions. Ink spent is then 0.
- Actions after the game ends are refused (`accepted: false`, `reason: "not-playing"`). Check the first step where `status` changes.
- Do not change game code to make a probe pass. Report what you found.
