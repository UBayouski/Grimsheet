# Implementation Plan: Hosting

## Overview

Small spec, three groups: write the files (1.x), run what needs the npm registry (2.x), then the dashboard (3.x). No task touches `src/` or `vite.config.ts`.

Rules that apply to every task:

- A code task ends with `npm run verify` (`npm test`, then type-check and lint). It must stay green; `scripts/**/*.mjs` is linted by it.
- Nothing is committed to `main` directly; the work arrives as a pull request.
- No `[Crew]` tags: the tasks are few and touch different files, but 2.1 and 3.1 need a machine with registry access and a person with a Render account.

## Tasks

- [x] 1. Blueprint and dist check
  - Done: 1.1 and 1.2 are both ticked; `render.yaml` and `scripts/check-dist.mjs` arrived together in commit 32c8a8d (2026-11-06).
  - [x] 1.1 [IDE] Add `render.yaml`
    - Files: create `render.yaml`
    - One service named `grimsheet`, `type: web`, `runtime: static`, `branch: main`, `autoDeployTrigger: commit`, build command `npm ci && npm run verify && npm run build`, `staticPublishPath: dist`, one env var `NODE_VERSION` = `"22"`. No `routes`, no other env var, no secret.
    - Acceptance: the file parses as YAML and a script confirms every field above and the absence of `routes` (done with Ruby's YAML parser, since the npm registry was unreachable).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 5.2_

  - [x] 1.2 [IDE] Add `scripts/check-dist.mjs` and the `check:dist` script
    - Files: create `scripts/check-dist.mjs`, edit `package.json` (one script, no dependency)
    - The script reports fixture paths, the six fixture strings, absolute URLs other than `http://www.w3.org/`, and protocol-relative `src`/`href`/`action`; exit 1 on any problem or a missing `index.html`, exit 0 otherwise.
    - Tests: run against hand-made folders: clean (exit 0), fixture text, fixture path, external URL in JS, web-font `@import` in CSS, protocol-relative script, missing `index.html` (each exit 1). Done.
    - Acceptance: `npm run verify` passes.
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 5.3_
    - Done: script and `check:dist` npm script added in commit 32c8a8d (2026-11-06) and extended with font and favicon checks in c5d93aa; `npm run verify` exited 0 on 2026-11-07 (`eslint .` covers `scripts/**/*.mjs`); `npm run check:dist` printed `ok` on the current `dist/`; the hand-made-folder tests are recorded in the `KIRO_USAGE.md` entry "2026-11-06 — hosting spec and Render static site (Web surface)".

- [ ] 2. Checks that need the npm registry
  - [ ] 2.1 [IDE] Run the real build and the dist check
    - Files: none expected; fix `scripts/check-dist.mjs` only if lint or a false positive requires it
    - Run on the pull request branch, in this order: `npm ci`, `npm run verify`, `npm run build`, `npm run check:dist`.
    - Acceptance: all four exit 0. `check:dist` prints `ok`, and `dist/` holds `index.html` and an `assets/` folder and nothing from `tests/`.
    - If `check:dist` flags something in a real bundle, decide whether the script or the code is wrong before changing either.
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 5.1_

  - [ ] 2.2 [IDE] Optional hardening: put the dist check in the build command
    - Files: edit `render.yaml` (build command gains `&& npm run check:dist`) and the Requirement 1.2 text
    - Only after 2.1 has passed on a real build. Skip it if the guard has not proved stable.
    - _Requirements: 1.2_

- [ ] 3. First deploy
  - [ ] 3.1 [Dashboard] Create the Blueprint in Render
    - Follow "Dashboard steps" in `design.md`. No file changes.
    - Acceptance: the first deploy log shows `npm ci`, tests, type-check, lint and `vite build` in that order; the site URL opens the game; Auto-Deploy shows on for `main`.
    - _Requirements: 1.1, 1.4, 6.1_

  - [ ] 3.2 [Dashboard] Confirm a failing check keeps the old version live
    - No file changes. Do not break `main` on purpose. The first time a push to `main` fails the build, check the dashboard; until then this task stays open.
    - Acceptance: the failed deploy shows as failed in the dashboard and the site URL still serves the previous version.
    - _Requirements: 2.2_

- [x] 4. Record
  - Done: 4.1 is the only subtask and it is ticked; the entry "2026-11-06 — hosting spec and Render static site (Web surface)" is in `KIRO_USAGE.md` (commit 32c8a8d).
  - [x] 4.1 [IDE] Add the `KIRO_USAGE.md` entry "hosting spec and Render static site (Web surface)"
    - _Requirements: 6.2_
