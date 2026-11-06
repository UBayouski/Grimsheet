import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as game from './index';

const GAME_DIR = resolve(__dirname);

const EXPECTED_RUNTIME_EXPORTS = [
  'MAX_DAMAGE',
  'REFUSAL_REASONS',
  'applyAction',
  'canUndo',
  'cellName',
  'cellRawText',
  'cellValue',
  'createRandom',
  'describeCellError',
  'isCellLocked',
  'isPlaying',
  'seedOf',
  'startRun',
];

const EXPECTED_TYPE_EXPORTS = [
  'Action',
  'ActionResult',
  'DamageEntry',
  'DamageLog',
  'DamageSource',
  'Direction',
  'EditRecordEntry',
  'Level',
  'MonsterState',
  'RandomGenerator',
  'Refusal',
  'RefusalReason',
  'RunState',
  'StartRunResult',
  'Status',
  'UndoSnapshot',
  'Value',
];

const EXPECTED_MODULES = [
  'index.ts',
  'monsters.ts',
  'random.ts',
  'run.ts',
  'state.ts',
  'testing/arbitraries.ts',
  'turn.ts',
  'types.ts',
];

const FORBIDDEN_IDENTIFIERS = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'AudioContext',
  'eval',
];

// The deny-list of AI tool names is assembled from fragments so this file does not
// spell any tool name. "Kiro" is allowed and never added here.
const AI_TOOL_NAMES: string[] = [
  ['Cop', 'ilot'],
  ['Curs', 'or'],
  ['Clau', 'de'],
  ['Chat', 'GPT'],
  ['Gemi', 'ni'],
  ['Code', 'ium'],
  ['Wind', 'surf'],
  ['Devi', 'n'],
].map((parts) => parts.join(''));

/** Replaces comments and string/template literal text with spaces, keeping line structure. */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const blank = (stop: number): void => {
    out += source.slice(i, stop).replace(/[^\n]/g, ' ');
    i = stop;
  };
  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      blank(end === -1 ? source.length : end);
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      blank(end === -1 ? source.length : end + 2);
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source.charAt(j) !== ch) j += source.charAt(j) === '\\' ? 2 : 1;
      blank(Math.min(j + 1, source.length));
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Import specifiers are strings, so they are read from comment-stripped text. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Finds forbidden constructs in a source file. `fromTesting` allows the one-step-deeper
 * barrel paths (`../../model/index`, `../../engine/index`) used by files under `testing/`.
 */
export function scanSource(source: string, fromTesting = false): string[] {
  const findings: string[] = [];
  const code = stripCommentsAndStrings(source);
  for (const id of FORBIDDEN_IDENTIFIERS) {
    if (new RegExp(`\\b${id}\\b`).test(code)) findings.push(id);
  }
  if (/\bnew\s+Function\b/.test(code)) findings.push('new Function');
  if (/\bMath\s*\.\s*random\b/.test(code)) findings.push('Math.random');
  if (/\bDate\s*\.\s*now\b/.test(code)) findings.push('Date.now');
  if (/\bnew\s+Date\b/.test(code)) findings.push('new Date');

  // AI tool names other than Kiro, checked case-insensitively against the raw source.
  const lower = source.toLowerCase();
  for (const name of AI_TOOL_NAMES) {
    if (lower.includes(name.toLowerCase())) findings.push(`ai-tool ${name}`);
  }

  const engineOk = fromTesting
    ? ['../../engine', '../../engine/index']
    : ['../engine', '../engine/index'];
  const modelOk = fromTesting
    ? ['../../model', '../../model/index']
    : ['../model', '../model/index'];
  const importRe = /\b(?:from|import)\s*\(?\s*(['"])([^'"]+)\1/g;
  for (const m of stripComments(source).matchAll(importRe)) {
    const spec = m[2] as string;
    if (/(^|\/)ui(\/|$)/.test(spec)) {
      findings.push(`import ${spec}`);
    } else if (/(^|\/)engine(\/|$)/.test(spec) && !engineOk.includes(spec)) {
      findings.push(`import ${spec}`);
    } else if (/(^|\/)model(\/|$)/.test(spec) && !modelOk.includes(spec)) {
      findings.push(`import ${spec}`);
    } else if (spec.startsWith('.')) {
      // A relative import must stay inside src/game/. Allowed: siblings (./x), the
      // testing subdir (./testing/x), the parent from testing (../x), and the two
      // barrels handled above.
      const inGame =
        /^\.\/[\w./-]+$/.test(spec) || (fromTesting && /^\.\.\/[\w-]+(?:\/index)?$/.test(spec));
      const isBarrel = engineOk.includes(spec) || modelOk.includes(spec);
      if (!inGame && !isBarrel) findings.push(`import ${spec}`);
    }
  }
  return findings;
}

function listSourceFiles(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full, base));
    } else if (entry.name.endsWith('.ts') && !/\.(prop\.)?test\.ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function rel(full: string): string {
  return full.slice(GAME_DIR.length + 1).replace(/\\/g, '/');
}

function isTesting(relPath: string): boolean {
  return relPath.startsWith('testing/');
}

/** Reads the exported names from index.ts without importing it, splitting runtime from type. */
function readBarrelNames(): { runtime: string[]; types: string[] } {
  const text = readFileSync(join(GAME_DIR, 'index.ts'), 'utf8');
  const runtime = new Set<string>();
  const types = new Set<string>();
  const blockRe = /export\s+(type\s+)?\{([^}]*)\}/g;
  for (const m of text.matchAll(blockRe)) {
    const isType = Boolean(m[1]);
    for (const raw of (m[2] as string).split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) (isType ? types : runtime).add(name);
    }
  }
  return { runtime: [...runtime].sort(), types: [...types].sort() };
}

describe('game public API', () => {
  it('declares exactly the documented runtime and type names', () => {
    const { runtime, types } = readBarrelNames();
    expect(runtime).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
    expect(types).toEqual([...EXPECTED_TYPE_EXPORTS].sort());
  });

  it('exports the 13 runtime names and no default', () => {
    expect(Object.keys(game).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
    expect('default' in game).toBe(false);
  });
});

describe('game source constraints', () => {
  const files = listSourceFiles(GAME_DIR);

  it('finds the expected module files and no test files', () => {
    const names = files.map(rel);
    expect([...names].sort()).toEqual([...EXPECTED_MODULES].sort());
    expect(names.some((n) => n.includes('.test.'))).toBe(false);
  });

  it('flags a sample bad snippet', () => {
    const bad = [
      'const a = eval("1"); const b = new Function("return 1");',
      'const c = Math.random(); const d = Date.now(); const e = new Date();',
      'document.body; window.x; localStorage.a; sessionStorage.b; navigator.c; fetch("x");',
      'new XMLHttpRequest(); new AudioContext();',
      "import { x } from '../ui/grid';",
      "import { z } from '../engine/parser';",
      "import { w } from '../model/loader';",
    ].join('\n');
    const findings = scanSource(bad);
    for (const expected of [
      'eval',
      'new Function',
      'Math.random',
      'Date.now',
      'new Date',
      'document',
      'window',
      'localStorage',
      'sessionStorage',
      'navigator',
      'fetch',
      'XMLHttpRequest',
      'AudioContext',
      'import ../ui/grid',
      'import ../engine/parser',
      'import ../model/loader',
    ]) {
      expect(findings).toContain(expected);
    }
  });

  it('flags an AI tool name other than Kiro', () => {
    const snippet = `// written with the ${['Cop', 'ilot'].join('')} assistant`;
    expect(scanSource(snippet).some((f) => f.startsWith('ai-tool'))).toBe(true);
    expect(scanSource('// built with Kiro')).toEqual([]);
  });

  it('allows the engine and model barrels and the testing parent import', () => {
    const ok = [
      "import { a } from '../engine/index';",
      "import { b } from '../engine';",
      "import { c } from '../model/index';",
      "import { d } from './state';",
    ].join('\n');
    expect(scanSource(ok)).toEqual([]);
    const okTesting = [
      "import { a } from '../../engine/index';",
      "import { b } from '../../model/index';",
    ].join('\n');
    expect(scanSource(okTesting, true)).toEqual([]);
  });

  it.each(files.map((f) => [rel(f)] as const))('%s has no forbidden constructs', (relPath) => {
    const source = readFileSync(join(GAME_DIR, relPath), 'utf8');
    expect(scanSource(source, isTesting(relPath))).toEqual([]);
  });

  it('needs no DOM environment', () => {
    expect(typeof (globalThis as Record<string, unknown>)['document']).toBe('undefined');
  });
});
