import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as model from './index';

const MODEL_DIR = resolve(__dirname);

const EXPECTED_RUNTIME_EXPORTS = [
  'LOAD_ERROR_CODES',
  'loadLevel',
  'loadLevelText',
  'serializeLevel',
  'serializeLevelText',
  'tabLabel',
];

const EXPECTED_MODULES = ['index.ts', 'loader.ts', 'serializer.ts', 'types.ts'];

const FORBIDDEN_IDENTIFIERS = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'eval',
];

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

export function scanSource(source: string): string[] {
  const findings: string[] = [];
  const code = stripCommentsAndStrings(source);
  for (const id of FORBIDDEN_IDENTIFIERS) {
    if (new RegExp(`\\b${id}\\b`).test(code)) findings.push(id);
  }
  if (/\bnew\s+Function\b/.test(code)) findings.push('new Function');
  if (/\bMath\s*\.\s*random\b/.test(code)) findings.push('Math.random');
  if (/\bDate\s*\.\s*now\b/.test(code)) findings.push('Date.now');
  if (/\bnew\s+Date\b/.test(code)) findings.push('new Date');
  // Copies of the engine's Address or Cell_Name patterns belong in the engine only.
  if (/\[A-L(?:a-l)?\]/.test(code)) findings.push('address pattern');
  if (/\[A-Z_\]|\[A-Z0-9_\]/.test(code)) findings.push('cell-name pattern');

  const importRe = /\b(?:from|import)\s*\(?\s*(['"])([^'"]+)\1/g;
  for (const m of stripComments(source).matchAll(importRe)) {
    const spec = m[2] as string;
    if (/(^|\/)(game|ui)(\/|$)/.test(spec)) findings.push(`import ${spec}`);
    else if (/(^|\/)engine(\/|$)/.test(spec) && spec !== '../engine' && spec !== '../engine/index') {
      findings.push(`import ${spec}`);
    }
  }
  return findings;
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'testing') files.push(...listSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !/\.(prop\.)?test\.ts$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('model public API', () => {
  it('exports exactly the documented runtime names and no default', () => {
    expect(Object.keys(model).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
    expect('default' in model).toBe(false);
  });

  it('loads a small valid document and labels its tab', () => {
    const floor = '#' + '.'.repeat(10) + '#';
    const wall = '#'.repeat(12);
    const doc = {
      schemaVersion: 1,
      id: '01-the-corridor',
      title: 'The Corridor',
      hint: 'Walk to the exit.',
      startingHp: 5,
      ink: 3,
      seed: 7,
      hero: { at: 'B2' },
      monsters: [],
      map: [wall, floor, ...Array.from({ length: 9 }, () => floor), wall],
      cells: [],
    };
    const result = model.loadLevel(doc, () => 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(model.tabLabel(result.level)).toBe('Sheet1: The Corridor');
    expect(model.loadLevelText(model.serializeLevelText(result.level), () => 0).ok).toBe(true);
  });
});

describe('model source constraints', () => {
  const files = listSourceFiles(MODEL_DIR);

  it('finds the expected module files and no test files', () => {
    const names = files.map((f) => f.slice(MODEL_DIR.length + 1).replace(/\\/g, '/'));
    for (const expected of EXPECTED_MODULES) expect(names).toContain(expected);
    expect(names.some((n) => n.includes('.test.') || n.startsWith('testing/'))).toBe(false);
  });

  it('flags a sample bad snippet', () => {
    const bad = [
      'const a = eval("1"); const b = new Function("return 1");',
      'const c = Math.random(); const d = Date.now(); const e = new Date();',
      'document.body; window.x; localStorage.a; sessionStorage.b; navigator.c; fetch("x"); new XMLHttpRequest();',
      "import { x } from '../ui/grid';",
      "import { y } from '../game/turns';",
      "import { z } from '../engine/parser';",
      'const re = /^[A-L][0-9]+$/; const nm = /^[A-Z_][A-Z0-9_]*$/;',
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
      'import ../ui/grid',
      'import ../game/turns',
      'import ../engine/parser',
      'address pattern',
      'cell-name pattern',
    ]) {
      expect(findings).toContain(expected);
    }
  });

  it('ignores comments and strings and allows the engine barrel', () => {
    const ok = [
      '// eval window Math.random',
      'const s = "fetch navigator";',
      "import { a } from '../engine/index';",
      "import { b } from '../engine';",
      'const evaluate = 1;',
    ].join('\n');
    expect(scanSource(ok)).toEqual([]);
  });

  it.each(listSourceFiles(MODEL_DIR).map((f) => [f.slice(MODEL_DIR.length + 1)] as const))(
    '%s has no forbidden constructs',
    (rel) => {
      expect(scanSource(readFileSync(join(MODEL_DIR, rel), 'utf8'))).toEqual([]);
    },
  );
});
