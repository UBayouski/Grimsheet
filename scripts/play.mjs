#!/usr/bin/env node
// Headless playtesting command for Grimsheet. No DOM.
//
// Build the bundle once (whenever src/ changes):
//   npm run build:play
//
// Play a level with an action list (same action format as tests/solutions/*.json):
//   node scripts/play.mjs <level-id> '<json-actions>'
//   node scripts/play.mjs <level-id> --actions-file tests/solutions/01-the-corridor.json
//   node scripts/play.mjs <level-id> < actions.json          # read the list from stdin
//
// Inspect a level without playing:
//   node scripts/play.mjs <level-id> --level-info
//   node scripts/play.mjs --list                             # list the level ids
//
// The action list may be a bare JSON array of actions, or a solution-file object with an
// "actions" array. Output is JSON on stdout. Exit code is 0 when it ran, non-zero for bad input.
import { readFileSync } from 'node:fs';

const BUNDLE = new URL('../dist-play/headless.js', import.meta.url);

function die(message) {
  process.stderr.write(`play: ${message}\n`);
  process.exit(2);
}

let core;
try {
  core = await import(BUNDLE.href);
} catch {
  die('the play bundle is missing. Run "npm run build:play" first.');
}
const { play, levelInfo, levelIds, parseActionsText, PlayInputError } = core;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

const args = process.argv.slice(2);

try {
  if (args.includes('--list')) {
    emit({ levels: levelIds() });
    process.exit(0);
  }

  const levelId = args[0];
  if (levelId === undefined || levelId.startsWith('--')) {
    die('usage: node scripts/play.mjs <level-id> [actions-json | --actions-file <path> | --level-info]');
  }

  if (args.includes('--level-info')) {
    emit(levelInfo(levelId));
    process.exit(0);
  }

  // Gather the action list: from --actions-file, from a positional JSON argument, or from stdin.
  let actionsText;
  const fileFlag = args.indexOf('--actions-file');
  if (fileFlag !== -1) {
    const path = args[fileFlag + 1];
    if (path === undefined) die('--actions-file needs a path.');
    try {
      actionsText = readFileSync(path, 'utf8');
    } catch {
      die(`could not read actions file "${path}".`);
    }
  } else if (args[1] !== undefined && !args[1].startsWith('--')) {
    actionsText = args[1];
  } else {
    actionsText = readStdin();
  }

  const actions = parseActionsText(actionsText);
  emit(play(levelId, actions));
  process.exit(0);
} catch (error) {
  if (error instanceof PlayInputError) die(error.message);
  const message = error instanceof Error ? error.message : String(error);
  die(`unexpected failure: ${message}`);
}
