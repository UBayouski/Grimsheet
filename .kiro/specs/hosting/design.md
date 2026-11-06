# Design Document

## Overview

Hosting adds three small things: `render.yaml` at the repository root, `scripts/check-dist.mjs` with an npm script `check:dist`, and this spec. The game stays a static site. There is no server code, no key and no run-time call to any other domain. No file under `src/` and no `vite.config.ts` change (Requirement 5.1).

```
git push to main
  -> Render clones the repo
  -> npm ci && npm run verify && npm run build     (any non-zero exit stops here)
  -> Render publishes dist/ at https://grimsheet.onrender.com (name permitting)
```

### Resolved decisions

| # | Decision | Reason |
| --- | --- | --- |
| 1 | A Render static site, defined as `type: web` with `runtime: static`. | Blueprints have no separate static type. A static site needs no process, so there is nothing to sleep. |
| 2 | Build command `npm ci && npm run verify && npm run build`, exactly as asked. | `npm ci` installs the locked versions. `verify` is the repo's one gate (tests, type-check, lint). `build` then type-checks again and runs `vite build`; the second type-check is redundant and left alone. |
| 3 | No `routes` entry. | The game is one page with no client routes (checked: no `pushState`, `hashchange`, `popstate` or `location` in shipped code). A rewrite of all paths to `/index.html` would only hide mistyped URLs. |
| 4 | `NODE_VERSION` is `22`. | `engines.node` is `>=22`. Without it Render uses its own default, which may be older. |
| 5 | `check:dist` is a separate command and is not in the build command. | See "Why the guard is not in the build command". |
| 6 | No change to `vite.config.ts`. | Vite's default input is the root `index.html`, and `base` defaults to `/`, which is right for a site served at the root of its own `onrender.com` host name. |

## The blueprint

```yaml
services:
  - type: web
    name: grimsheet
    runtime: static
    branch: main
    autoDeployTrigger: commit
    buildCommand: npm ci && npm run verify && npm run build
    staticPublishPath: dist
    envVars:
      - key: NODE_VERSION
        value: "22"
```

`render.yaml` in the repository is this block plus comments. It sets no `plan` (static sites have none), no `repo` (a Blueprint uses the repository it lives in), no `routes` and no secret (`sync: false` is never used).

## Failing check stops the deploy (Requirement 2)

The build command is one shell line joined by `&&`. If `npm ci`, `npm test`, the type-check or lint exits non-zero, the shell stops and the build fails. Render's documentation says a failed build is discarded and the running version is left untouched, so the previous Site stays live. Nothing in this repository implements that; it is a property of the platform, and this spec only makes sure the build command cannot swallow a failure.

`npm run verify` includes every property test, so a deploy is slow. The last recorded local run in `KIRO_USAGE.md` was about 21 to 23 seconds for the tests, on a developer machine. Render's build machine is slower and unmeasured, so the first deploy time is not known.

## What ships, and what does not (Requirements 3 and 4)

Checked by reading the code on 2026-11-06 (the build itself could not be run, see "Not verified"):

- **One entry.** `vite build` reads `index.html`, which loads `src/main.ts`. `main.ts` imports `src/ui/index`, `src/stub-levels` and `src/styles/grid-ui.css`.
- **Fixtures are unreachable.** `tests/fixtures/index.html`, `main.ts` and `levels.ts` are not imported by `main.ts` or anything it imports, and `vite.config.ts` adds no second input. The only `src/` file that names `tests/` outside a test is `src/levels/helpers.ts`, which only `helpers.test.ts` imports.
- **No other origin.** There is no `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` in shipped code, no absolute URL in `index.html`, `src/` or the CSS, and no `public/` folder. The font is the system stack in `grid-ui.css`. `tech.md` already requires open-licensed, self-hosted fonts if any are added later.
- **Shipped levels.** Today `main.ts` passes `STUB_LEVELS` (one stub level, id `01-stub`) to `mountApp`. Until the `levels` spec swaps `main.ts` to the five real levels (its task 5.1), the live site shows the stub. That swap is not part of this spec.

## The dist check (`scripts/check-dist.mjs`)

Run after a build: `npm run build && npm run check:dist`. It takes an optional folder (default `dist`), walks it recursively and reads every file as text.

It reports a problem for:

- a file path with a `tests` or `fixtures` folder in it;
- any of the fixture strings `tests/fixtures`, `(fixtures)`, `Fixture Corridor`, `Fixture Lab`, `fixture-corridor`, `fixture-lab` (the page title, level titles and level ids that exist only in the fixtures; the shipped stub is `Stub` / `01-stub` and does not match);
- an absolute `http://` or `https://` URL, except `http://www.w3.org/` (the XML namespace string that SVG code carries and that triggers no request);
- a protocol-relative `src`, `href` or `action` such as `src="//cdn.example/x.js"`.

It prints each problem, then exits 1; with no problem it prints a one-line summary and exits 0. It exits 1 with a hint if `index.html` is missing. It uses only `node:fs` and `node:path`, so it adds no dependency.

### Why the guard is not in the build command

The requested build command is fixed. The script has been exercised only on hand-made folders (clean, fixture text, fixture path, external URL in JS, `@import` of a web font in CSS, protocol-relative script, missing `index.html`), never on a real Vite output. A false positive in the real bundle would block every deploy, so it is run by hand first. When it has passed on a real build, adding `&& npm run check:dist` to the build command (and to the blueprint) is a one-line change. The script is also linted by `npm run verify` (`eslint .` covers `scripts/**/*.mjs`), so it is on the deploy path in that sense.

## Dashboard steps (Requirement 6.1)

One time only, in the Render dashboard:

1. Sign in at dashboard.render.com and connect GitHub if it is not connected. Give the Render GitHub app access to `UBayouski/Grimsheet`.
2. Choose **New +**, then **Blueprint**, and pick the `Grimsheet` repository.
3. Leave the branch as `main` and the Blueprint path as `render.yaml`, then continue.
4. Check the preview: one **Static Site** named `grimsheet`, build command `npm ci && npm run verify && npm run build`, publish directory `dist`. There are no environment variables to fill in. Choose **Apply** (or **Deploy Blueprint**).
5. Wait for the first deploy. The log should show `npm ci`, then the tests, then the type-check and lint, then `vite build`. Open the site URL shown on the service page.
6. In the service's **Settings**, confirm that **Auto-Deploy** is on for the `main` branch.
7. Put the URL into the README and write-up when they exist.

After that, every push to `main` deploys by itself. No further dashboard work is needed. If the name `grimsheet` is already taken on `onrender.com`, Render assigns a different host name; rename the service in `render.yaml` and sync the Blueprint if a specific one is wanted.

## Not verified

- **No build was run.** The session that wrote this spec had no access to the npm registry (`npm ci` failed with a 403), so `npm run verify`, `npm run build` and `npm run check:dist` have not been run on this change. The first run of all three is task 2.1.
- **Render key names.** The keys (`type: web`, `runtime: static`, `staticPublishPath`, `buildCommand`, `branch`, `autoDeployTrigger: commit`, `envVars`) were confirmed from Render's published examples and API reference through search results; Render's Blueprint reference page itself could not be fetched. The Blueprint preview in step 4 above will reject a wrong key.
- **Render's build time and the free-tier build limits** for a `verify` that runs all property tests are unmeasured.

## Files

| File | Change |
| --- | --- |
| `render.yaml` | new |
| `scripts/check-dist.mjs` | new |
| `package.json` | one script: `check:dist` |
| `.kiro/specs/hosting/` | new (this spec) |
| `KIRO_USAGE.md` | one entry |
| `vite.config.ts`, `src/` | none |
