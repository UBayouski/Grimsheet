import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = resolve(__dirname);

const FORBIDDEN_IDENTIFIERS = [
  'eval',
  'Function',
  'localStorage',
  'sessionStorage',
  'document',
  'window',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'AudioContext',
  'location',
  'indexedDB',
  'requestAnimationFrame',
  'HTMLElement',
];

const EXPECTED_MODULES = [
  'address.ts',
  'ast.ts',
  'context.ts',
  'errors.ts',
  'evaluate-cell.ts',
  'evaluator.ts',
  'functions.ts',
  'graph.ts',
  'index.ts',
  'names.ts',
  'parser.ts',
  'printer.ts',
  'recalculator.ts',
  'sheet.ts',
  'tokenizer.ts',
  'values.ts',
];

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

/** Keywords after which a "/" starts a regex literal rather than a division. */
const REGEX_AFTER_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

/** A "/" starts a regex unless the previous meaningful token is an identifier, number, ")" or "]". */
function regexAllowed(prevToken: string): boolean {
  if (prevToken === '') return true;
  if (IDENTIFIER_CHAR.test(prevToken.charAt(0))) return REGEX_AFTER_KEYWORDS.has(prevToken);
  return prevToken !== ')' && prevToken !== ']';
}

/**
 * Replaces comments, string literals, template literal text and regex literals with spaces,
 * keeping line structure. Code inside template `${...}` substitutions is kept and scanned,
 * including nested braces and nested templates.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const blankTo = (stop: number): void => {
    out += source.slice(i, stop).replace(/[^\n]/g, ' ');
    i = stop;
  };

  /** Code to the end of input, or inside `${` up to its matching "}", which is left unconsumed. */
  function code(inSubstitution: boolean): void {
    let depth = 0;
    let prevToken = '';
    let inWord = false;
    while (i < source.length) {
      const ch = source.charAt(i);
      const next = source.charAt(i + 1);
      if (ch === '/' && next === '/') {
        const end = source.indexOf('\n', i);
        blankTo(end === -1 ? source.length : end);
        inWord = false;
      } else if (ch === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2);
        blankTo(end === -1 ? source.length : end + 2);
        inWord = false;
      } else if (ch === '"' || ch === "'") {
        quoted(ch);
        prevToken = ')'; // a value: a following "/" is a division
        inWord = false;
      } else if (ch === '`') {
        template();
        prevToken = ')';
        inWord = false;
      } else if (ch === '/' && regexAllowed(prevToken)) {
        regex();
        prevToken = ')';
        inWord = false;
      } else {
        if (inSubstitution && ch === '}') {
          if (depth === 0) return;
          depth -= 1;
        } else if (inSubstitution && ch === '{') {
          depth += 1;
        }
        out += ch;
        i += 1;
        if (IDENTIFIER_CHAR.test(ch)) {
          prevToken = inWord ? prevToken + ch : ch;
          inWord = true;
        } else {
          inWord = false;
          if (!/\s/.test(ch)) prevToken = ch;
        }
      }
    }
  }

  function quoted(quote: string): void {
    let j = i + 1;
    while (j < source.length && source.charAt(j) !== quote && source.charAt(j) !== '\n') {
      j += source.charAt(j) === '\\' ? 2 : 1;
    }
    blankTo(Math.min(j + 1, source.length));
  }

  function template(): void {
    blankTo(i + 1); // opening backtick
    while (i < source.length) {
      const ch = source.charAt(i);
      if (ch === '\\') {
        blankTo(Math.min(i + 2, source.length));
      } else if (ch === '`') {
        blankTo(i + 1);
        return;
      } else if (ch === '$' && source.charAt(i + 1) === '{') {
        blankTo(i + 2);
        code(true);
        if (i < source.length) blankTo(i + 1); // closing "}"
      } else {
        blankTo(i + 1);
      }
    }
  }

  function regex(): void {
    let j = i + 1;
    let inClass = false;
    while (j < source.length) {
      const c = source.charAt(j);
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === '\n') break;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        j += 1;
        while (j < source.length && /[a-z]/i.test(source.charAt(j))) j += 1; // flags
        break;
      }
      j += 1;
    }
    blankTo(Math.min(j, source.length));
  }

  code(false);
  return out;
}

/** Import specifiers are strings, so they are read from the comment-stripped text before string removal. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function scanSource(source: string): string[] {
  const findings: string[] = [];
  const code = stripCommentsAndStrings(source);
  for (const id of FORBIDDEN_IDENTIFIERS) {
    if (id === 'Function') {
      if (/\bnew\s+Function\b/.test(code)) findings.push('new Function');
      // A plain call is the same as `new Function`, so it is flagged too.
      if (/\bFunction\s*\(/.test(code)) findings.push('Function(');
    } else if (new RegExp(`\\b${id}\\b`).test(code)) {
      findings.push(id);
    }
  }
  if (/\bMath\s*\.\s*random\b/.test(code)) findings.push('Math.random');

  const specifiers: string[] = [];
  const importRe = /\b(?:from|import)\s*\(?\s*(['"])([^'"]+)\1/g;
  for (const m of stripComments(source).matchAll(importRe)) specifiers.push(m[2] as string);
  for (const spec of specifiers) {
    if (/(^|\/)src\/(model|game|ui)(\/|$)/.test(spec) || /^(\.\.\/)+(model|game|ui)(\/|$)/.test(spec)) {
      findings.push(`import ${spec}`);
    }
  }
  return findings;
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (entry.name.endsWith('.ts') && !/\.(prop\.)?test\.ts$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('engine source constraints', () => {
  const files = listSourceFiles(ENGINE_DIR);

  it('finds the expected module files', () => {
    const names = files.map((f) => f.slice(ENGINE_DIR.length + 1).replace(/\\/g, '/'));
    for (const expected of EXPECTED_MODULES) expect(names).toContain(expected);
    expect(names.some((n) => n.endsWith('.test.ts'))).toBe(false);
  });

  it('flags a sample bad snippet', () => {
    const bad = [
      'const a = eval("1");',
      'const b = new Function("return 1");',
      'const c = Math.random();',
      'const d = document.body; window.x = 1; localStorage.a; sessionStorage.b; navigator.c;',
      'fetch("x"); new XMLHttpRequest();',
      "import { x } from '../ui/grid';",
      "import { y } from 'src/game/turns';",
    ].join('\n');
    const findings = scanSource(bad);
    for (const expected of [
      'eval',
      'new Function',
      'Math.random',
      'document',
      'window',
      'localStorage',
      'sessionStorage',
      'navigator',
      'fetch',
      'XMLHttpRequest',
      'import ../ui/grid',
      'import src/game/turns',
    ]) {
      expect(findings).toContain(expected);
    }
  });

  it('flags a plain Function( call, and does not flag lower-case function', () => {
    expect(scanSource('const f = Function("return 1");')).toEqual(['Function(']);
    expect(scanSource('const f = Function ("return 1");')).toEqual(['Function(']);
    expect(scanSource('const f = new Function("return 1");')).toEqual(['new Function', 'Function(']);
    expect(scanSource('function f(x: number) { return x; } const g = (x: number) => x;')).toEqual([]);
  });

  it('flags the added browser globals', () => {
    expect(scanSource('const c = new AudioContext();')).toEqual(['AudioContext']);
    expect(scanSource('const l = location.href;')).toEqual(['location']);
    expect(scanSource('indexedDB.open("x");')).toEqual(['indexedDB']);
    expect(scanSource('requestAnimationFrame(tick);')).toEqual(['requestAnimationFrame']);
    expect(scanSource('const e = x as HTMLElement;')).toEqual(['HTMLElement']);
    expect(scanSource('const s = "location"; // indexedDB\nconst relocation = 1;')).toEqual([]);
  });

  it('ignores comments and string literals and respects word boundaries', () => {
    const ok = [
      '// eval window Math.random',
      '/* document localStorage */',
      'const s = "fetch navigator";',
      'const evaluate = 1; const windows = 2; const refetch = 3;',
    ].join('\n');
    expect(scanSource(ok)).toEqual([]);
  });

  it('scans code inside template substitutions but not template text', () => {
    expect(scanSource('const t = `text ${window.x} more`;')).toEqual(['window']);
    expect(scanSource('const t = `a ${`b ${document.y}`} c`;')).toEqual(['document']);
    expect(scanSource('const t = `${ { k: 1 }.k } and ${navigator.z}`;')).toEqual(['navigator']);
    expect(scanSource('const t = `window ${1} document`;')).toEqual([]);
  });

  it('recognizes regex literals so a quote inside one does not hide later code', () => {
    expect(scanSource('const r = /"/; const w = window;')).toEqual(['window']);
    expect(scanSource("const r = /['\"]/g.test(s) && eval(s);")).toEqual(['eval']);
    expect(scanSource('function f(s) { return /"/.test(s); } fetch(1);')).toEqual(['fetch']);
    expect(scanSource('const re = /window|document/;')).toEqual([]);
    // Division is not a regex: after an identifier, number, ")" or "]".
    expect(scanSource('const r = x / window.a / 2;')).toEqual(['window']);
    expect(scanSource('const r = (a) / 2 + b[0] / navigator.c / 3;')).toEqual(['navigator']);
  });

  it.each(files.map((f) => [f.slice(ENGINE_DIR.length + 1)] as const))('%s has no forbidden constructs', (rel) => {
    const source = readFileSync(join(ENGINE_DIR, rel), 'utf8');
    expect(scanSource(source)).toEqual([]);
  });
});
