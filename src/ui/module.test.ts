import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_DIR = resolve(__dirname);
const ROOT = resolve(UI_DIR, '..', '..');
const SRC = join(ROOT, 'src');

const EXPECTED_MODULES = [
  'app',
  'confirmation',
  'controller',
  'index',
  'key-map',
  'messages',
  'progress',
  'render',
  'strings',
  'types',
  'view-model',
].map((n) => `${n}.ts`);

const DOM_FILES = ['app.ts', 'render.ts'];

const PURE_FORBIDDEN = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'AudioContext',
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
];

const DOM_FILE_FORBIDDEN = ['window', 'sessionStorage', 'fetch', 'XMLHttpRequest'];

const ENTRY_FORBIDDEN = [
  'window',
  'localStorage',
  'sessionStorage',
  'AudioContext',
  'navigator',
  'location',
  'fetch',
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

/** Replaces comments only; string literals stay (import specifiers, URL checks). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function mentions(code: string, id: string): boolean {
  return new RegExp(`(?<![\\w$])${id}(?![\\w$])`).test(code);
}

function importSpecifiers(source: string): string[] {
  const re = /\b(?:from|import)\s*\(?\s*(['"])([^'"]+)\1/g;
  return [...stripComments(source).matchAll(re)].map((m) => m[2] as string);
}

const UNIVERSAL_BAD: ReadonlyArray<readonly [string, RegExp]> = [
  ['eval', /(?<![\w$.])eval\b/],
  ['new Function', /\bnew\s+Function\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['Date.now', /\bDate\s*\.\s*now\b/],
  ['new Date', /\bnew\s+Date\b/],
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', /\bdocument\s*\.\s*write(ln)?\b/],
];

export type Kind = 'pure' | 'dom' | 'entry';

/** Scans one source file. `kind` selects the browser-global rules. */
export function scanSource(source: string, kind: Kind, relPath = 'x.ts'): string[] {
  const findings: string[] = [];
  const code = stripCommentsAndStrings(source);

  for (const [label, re] of UNIVERSAL_BAD) if (re.test(code)) findings.push(label);
  if (/https?:\/\//.test(stripComments(source))) findings.push('url literal');
  if (/\bexport\s+default\b/.test(code)) findings.push('default export');

  if (kind === 'pure') {
    for (const id of PURE_FORBIDDEN) if (mentions(code, id)) findings.push(id);
  } else if (kind === 'dom') {
    for (const id of DOM_FILE_FORBIDDEN) if (mentions(code, id)) findings.push(id);
    if (relPath !== 'app.ts' && mentions(code, 'localStorage')) findings.push('localStorage');
  } else {
    for (const id of ENTRY_FORBIDDEN) if (mentions(code, id)) findings.push(id);
    for (const m of code.matchAll(/(?<![\w$])document\b(?!\s*\.\s*getElementById\b)/g)) {
      findings.push(`document use at ${m.index}`);
    }
  }

  if (kind === 'entry') {
    for (const spec of importSpecifiers(source)) {
      if (/(^|\/)ui(\/|$)/.test(spec) && spec !== './ui/index' && spec !== '../../src/ui/index') {
        findings.push(`import ${spec}`);
      }
    }
  } else {
    const barrels = ['../game/index', '../model/index', '../engine/index'];
    for (const spec of importSpecifiers(source)) {
      const sibling = /^\.\/[\w-]+$/.test(spec);
      if (!sibling && !barrels.includes(spec)) findings.push(`import ${spec}`);
      if (/levels/.test(spec)) findings.push(`import ${spec}`);
    }
  }

  const lower = source.toLowerCase();
  for (const name of AI_TOOL_NAMES) {
    if (lower.includes(name.toLowerCase())) findings.push(`ai-tool ${name}`);
  }
  return findings;
}

function listFiles(dir: string, filter: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

const isSource = (n: string): boolean => n.endsWith('.ts') && !/\.(prop\.)?test\.ts$/.test(n);
const read = (p: string): string => readFileSync(p, 'utf8');

const uiEntries = readdirSync(UI_DIR, { withFileTypes: true });
const uiSourceNames = uiEntries
  .filter((e) => e.isFile() && isSource(e.name))
  .map((e) => e.name)
  .sort();

const MAIN_FILES = [join(SRC, 'main.ts'), join(ROOT, 'tests', 'fixtures', 'main.ts')];

describe('ui module layout', () => {
  it('has exactly the designed files and no subdirectories', () => {
    expect(uiSourceNames).toEqual([...EXPECTED_MODULES].sort());
    expect(uiEntries.filter((e) => e.isDirectory())).toEqual([]);
  });
});

describe('ui public API', () => {
  const text = read(join(UI_DIR, 'index.ts'));
  const code = stripCommentsAndStrings(text);

  it('uses named exports only', () => {
    expect(code).not.toMatch(/\bexport\s+default\b/);
    expect(code).not.toMatch(/\bexport\s*\*/);
  });

  it('exports exactly the documented names', () => {
    const runtime = new Set<string>();
    const types = new Set<string>();
    for (const m of text.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
      for (const raw of (m[2] as string).split(',')) {
        const name = raw
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim();
        if (name) (m[1] ? types : runtime).add(name);
      }
    }
    expect([...runtime].sort()).toEqual(['browserStorage', 'mountApp']);
    expect([...types].sort()).toEqual(['AppHandle', 'MountOptions', 'Progress', 'StorageLike']);
  });

  it('has no default export in any ui file', () => {
    for (const name of uiSourceNames) {
      expect(scanSource(read(join(UI_DIR, name)), 'pure', name)).not.toContain('default export');
    }
  });
});

describe('ui source constraints', () => {
  it.each(uiSourceNames.map((n) => [n] as const))('%s has no forbidden constructs', (name) => {
    const kind: Kind = DOM_FILES.includes(name) ? 'dom' : 'pure';
    expect(scanSource(read(join(UI_DIR, name)), kind, name)).toEqual([]);
  });

  it.each(MAIN_FILES.map((p) => [p.slice(ROOT.length + 1).replace(/\\/g, '/'), p] as const))(
    'entry %s is a thin composition root',
    (_label, path) => {
      const source = read(path);
      expect(scanSource(source, 'entry')).toEqual([]);
      const specs = importSpecifiers(source);
      const uiSpecs = specs.filter((s) => /(^|\/)ui(\/|$)/.test(s));
      expect(uiSpecs).toHaveLength(1);
      expect(source).toMatch(/import\s*\{[^}]*\bmountApp\b[^}]*\}\s*from\s*['"][^'"]*ui\/index['"]/);
      expect(source).toMatch(
        /import\s*\{[^}]*\bbrowserStorage\b[^}]*\}\s*from\s*['"][^'"]*ui\/index['"]/,
      );
      expect(stripCommentsAndStrings(source)).toMatch(/\bbrowserStorage\s*\(\s*\)/);
    },
  );
});

describe('no AI tool names and no remote references', () => {
  const files: string[] = [
    ...listFiles(UI_DIR, (n) => n.endsWith('.ts')),
    join(SRC, 'styles', 'grid-ui.css'),
    join(SRC, 'main.ts'),
    ...listFiles(join(ROOT, 'tests', 'fixtures'), () => true),
    ...listFiles(join(ROOT, '.kiro', 'specs', 'grid-ui'), () => true),
  ];

  it.each(files.map((f) => [f.slice(ROOT.length + 1).replace(/\\/g, '/'), f] as const))(
    '%s names no other AI tool',
    (_label, path) => {
      const lower = read(path).toLowerCase();
      expect(AI_TOOL_NAMES.filter((n) => lower.includes(n.toLowerCase()))).toEqual([]);
    },
  );

  it('keeps the stylesheet free of url(, @import and http', () => {
    const css = read(join(SRC, 'styles', 'grid-ui.css'));
    expect(css).not.toMatch(/url\(/i);
    expect(css).not.toMatch(/@import/i);
    expect(css).not.toMatch(/http/i);
  });
});

describe('layering', () => {
  it.each(['game', 'model', 'engine'])('src/%s never imports from src/ui', (dir) => {
    // Non-test files only: scanner self-check tests hold bad imports inside strings.
    for (const file of listFiles(join(SRC, dir), isSource)) {
      const bad = importSpecifiers(read(file)).filter((s) => /(^|\/)ui(\/|$)/.test(s));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('has a directory for each lower layer', () => {
    for (const dir of ['game', 'model', 'engine']) {
      expect(statSync(join(SRC, dir)).isDirectory()).toBe(true);
    }
  });
});

describe('scanner self-check', () => {
  it('flags a sample bad snippet', () => {
    const bad = [
      'const a = eval("1"); const b = new Function("return 1");',
      'const c = Math.random(); const d = Date.now(); const e = new Date();',
      'el.innerHTML = x; el.outerHTML = y; el.insertAdjacentHTML("a", "b"); document.write("z");',
      'const u = "https://example.com";',
      'window.x; localStorage.a; navigator.c; fetch("x");',
      "import { x } from '../levels/index';",
      "import { y } from '../engine/parser';",
      'export default 1;',
    ].join('\n');
    const findings = scanSource(bad, 'pure');
    for (const expected of [
      'eval',
      'new Function',
      'Math.random',
      'Date.now',
      'new Date',
      'innerHTML',
      'outerHTML',
      'insertAdjacentHTML',
      'document.write',
      'url literal',
      'window',
      'localStorage',
      'navigator',
      'document',
      'import ../levels/index',
      'import ../engine/parser',
      'default export',
    ]) {
      expect(findings).toContain(expected);
    }
    expect(scanSource('document.title = "x"; window.a;', 'entry').length).toBeGreaterThan(0);
    expect(scanSource('document.getElementById("app");', 'entry')).toEqual([]);
    expect(scanSource('localStorage.a;', 'dom', 'render.ts')).toContain('localStorage');
    expect(scanSource('localStorage.a;', 'dom', 'app.ts')).toEqual([]);
  });

  it('flags an AI tool name other than Kiro', () => {
    const snippet = `// written with the ${['Cop', 'ilot'].join('')} assistant`;
    expect(scanSource(snippet, 'pure').some((f) => f.startsWith('ai-tool'))).toBe(true);
    expect(scanSource('// built with Kiro', 'pure')).toEqual([]);
  });
});
