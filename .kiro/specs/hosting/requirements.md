# Requirements Document

## Introduction

Hosting is spec 8 of 8 in `docs/BRIEF.md` section 12. It publishes Grimsheet as a free static site. The brief (section 9) and `tech.md` fix the shape: a static site, no backend, no API keys, no AI calls at run time. The platform is Render.

The spec adds a Render Blueprint (`render.yaml`), a small check of the built site (`scripts/check-dist.mjs`, run as `npm run check:dist`) and documentation. It changes no code under `src/` and no `vite.config.ts`.

### What was checked while writing this document

- Vite builds one page. `vite.config.ts` has only a `test` block, so `vite build` uses its default input: the root `index.html`, which loads `src/main.ts`.
- `tests/fixtures/index.html` is a second HTML page for the Playwright flows. Nothing links to it, and no file under `src/` outside `*.test.ts` imports from `tests/` (the one match, `src/levels/helpers.ts`, reads `tests/solutions/` through `node:fs` and is a test helper, not part of the bundle).
- Shipped code (`src/` without `*.test.ts`, and `index.html`) has no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, absolute URL, `@import` or `url(`. The only font is the system stack `ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace`. There is no `public/` folder.
- Shipped code has no `pushState`, `replaceState`, `hashchange`, `popstate` or `location` use, so the game has no client routes.
- `npm run verify` is `npm test` then `npm run check` (type-check and lint). `npm run build` is `tsc --noEmit && vite build`.

## Glossary

- **Site**: the built game that Render serves.
- **Dist**: the `dist/` folder written by `npm run build`.
- **Hosting_Config**: the file `render.yaml` at the repository root.
- **Verify**: the command `npm run verify`.
- **Fixture_Files**: everything under `tests/fixtures/` and the fixture level text they contain.

## Requirements

### Requirement 1: Render Blueprint

**User Story:** As the author, I want the deployment described in the repository, so that one dashboard action creates the site.

#### Acceptance Criteria

1. THE Hosting_Config SHALL define exactly one service, named `grimsheet`, of type `web` with runtime `static`.
2. THE Hosting_Config SHALL set the build command to `npm ci && npm run verify && npm run build`.
3. THE Hosting_Config SHALL set the publish directory to `dist`.
4. THE Hosting_Config SHALL set the branch to `main` and the auto-deploy trigger to `commit`, so that every push to `main` starts a deploy.
5. THE Hosting_Config SHALL set the environment variable `NODE_VERSION` to `22`, matching `engines` in `package.json`, and SHALL define no other environment variable and no secret.

### Requirement 2: A failing check stops the deploy

**User Story:** As the author, I want a broken commit to leave the live game untouched.

#### Acceptance Criteria

1. THE build command SHALL join its steps with `&&` only, with no `;`, `||`, `|| true` or other way to continue after a failing step, so a failing Verify makes the build fail.
2. WHEN a build fails, THE platform SHALL keep serving the previously deployed Site. The spec relies on this behaviour of Render and does not reimplement it.

### Requirement 3: Self-hosted assets only

**User Story:** As a player, I want the game to load from one place and call nobody else.

#### Acceptance Criteria

1. THE Dist SHALL contain no absolute `http://` or `https://` URL and no protocol-relative `src`, `href` or `action` reference, except the XML namespace strings under `http://www.w3.org/`.
2. THE Site SHALL use no web font, stylesheet, script, image or analytics from another domain.
3. WHEN `npm run check:dist` runs against a Dist that breaks criterion 1, THE script SHALL print each problem and exit with a non-zero status.

### Requirement 4: No test fixtures in the build

**User Story:** As the author, I want only the game in the published files.

#### Acceptance Criteria

1. THE Dist SHALL contain no file or folder path inside `tests` or `fixtures`, and no text from the Fixture_Files (`tests/fixtures`, `(fixtures)`, `Fixture Corridor`, `Fixture Lab`, `fixture-corridor`, `fixture-lab`).
2. THE build input SHALL stay the root `index.html` alone; no second HTML entry SHALL be added to the build.

### Requirement 5: Scope

**User Story:** As the author, I want hosting to change as little as possible.

#### Acceptance Criteria

1. THE change SHALL NOT modify `vite.config.ts` or any file under `src/`, unless the build cannot succeed without it.
2. THE Hosting_Config SHALL define no `routes` or rewrite rule, because the Site is one page with no client routes. IF a client route is ever added, THEN a rewrite of all paths to `/index.html` SHALL be added with it.
3. THE change SHALL add no dependency; `package.json` SHALL gain only the `check:dist` script.

### Requirement 6: Documentation

**User Story:** As the author, I want to know exactly what to do in the dashboard.

#### Acceptance Criteria

1. THE design document SHALL list the one-time steps in the Render dashboard.
2. `KIRO_USAGE.md` SHALL gain an entry for this spec.
