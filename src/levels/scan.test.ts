import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Requirement 15: Deny_List scan, forbidden constructs, import lists and bundle reach.
// Every sensitive word is built from fragments, so this file contains none of them as a whole word.

const LEVELS_DIR = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = resolve(LEVELS_DIR, '..');
const SOLUTIONS_DIR = resolve(LEVELS_DIR, '..', '..', 'tests', 'solutions');

const DENY_LIST: readonly string[] = [
  ['cla', 'ude'].join(''),
  ['chat', 'gpt'].join(''),
  ['co', 'pilot'].join(''),
  ['cur', 'sor'].join(''),
  ['gem', 'ini'].join(''),
  ['co', 'dex'].join(''),
  ['open', 'ai'].join(''),
  ['anthro', 'pic'].join(''),
  ['wind', 'surf'].join(''),
  ['tab', 'nine'].join(''),
  ['ai', 'der'].join(''),
  ['dev', 'in'].join(''),
  ['mi', 'cro', 'soft'].join(''),
  ['ex', 'cel'].join(''),
  ['lo', 'tus'].join(''),
  ['goo', 'gle'].join(''),
  ['lla', 'ma'].join(''),
  ['mis', 'tral'].join(''),
  ['deep', 'seek'].join(''),
  ['perp', 'lexity'].join(''),
];

const FORBIDDEN: readonly string[] = [
  ['Math', 'random'].join('.'),
  ['Date', 'now'].join('.'),
  ['new', 'Date'].join(' '),
  ['ev', 'al'].join(''),
  ['new', 'Function'].join(' '),
  ['performance', 'now'].join('.'),
];

const BROWSER_GLOBALS: readonly string[] = ['window', 'document', 'localStorage', 'navigator'];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive matches of each entry in the text. */
function findWords(text: string, entries: readonly string[]): string[] {
  return entries.filter((entry) => new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(entry)}($|[^A-Za-z0-9_])`, 'i').test(text));
}

/** Module specifiers of the import and re-export statements of a source text. */
function importsOf(text: string): string[] {
  const found: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

const isTestFile = (file: string): boolean => /\.test\.ts$/.test(file);
const levelsFiles = listFiles(LEVELS_DIR);
const levelsTestFiles = levelsFiles.filter(isTestFile);
const helpersFile = join(LEVELS_DIR, 'helpers.ts');
const indexFile = join(LEVELS_DIR, 'index.ts');

describe('scanner self-check', () => {
  it('flags a sample bad snippet', () => {
    const bad = [
      `const a = ${FORBIDDEN[0]}();`,
      `const b = ${FORBIDDEN[2]}();`,
      `${FORBIDDEN[3]}('x');`,
      `// written with ${DENY_LIST[0]!.toUpperCase()}`,
      `import { x } from '../ui/grid';`,
    ].join('\n');
    expect(findWords(bad, FORBIDDEN)).toEqual([FORBIDDEN[0], FORBIDDEN[2], FORBIDDEN[3]]);
    expect(findWords(bad, DENY_LIST)).toEqual([DENY_LIST[0]]);
    expect(importsOf(bad)).toEqual(['../ui/grid']);
  });

  it('does not flag a clean snippet or a longer word', () => {
    const clean = 'const evaluated = excellent(); // no tool names';
    expect(findWords(clean, FORBIDDEN)).toEqual([]);
    expect(findWords(clean, DENY_LIST)).toEqual([]);
  });

  it('reads multi-line and side-effect imports', () => {
    const text = "import {\n  a,\n  b,\n} from './x';\nimport type { T } from '../y/index';\nimport './z.css';\n";
    expect(importsOf(text)).toEqual(['./x', '../y/index', './z.css']);
  });

  it('walks the expected files', () => {
    expect(levelsFiles.length).toBeGreaterThan(10);
    expect(levelsTestFiles.length).toBeGreaterThan(5);
    expect(listFiles(SOLUTIONS_DIR).length).toBeGreaterThanOrEqual(5);
  });
});

describe('Deny_List (Requirement 15.2)', () => {
  it('assembles entries that this file does not contain as whole words', () => {
    const self = read(join(LEVELS_DIR, 'scan.test.ts'));
    expect(findWords(self, DENY_LIST)).toEqual([]);
  });

  it('finds no entry in any file under src/levels/', () => {
    for (const file of levelsFiles) {
      expect({ file, hits: findWords(read(file), DENY_LIST) }).toEqual({ file, hits: [] });
    }
  });

  it('finds no entry in any file under tests/solutions/', () => {
    for (const file of listFiles(SOLUTIONS_DIR)) {
      expect({ file, hits: findWords(read(file), DENY_LIST) }).toEqual({ file, hits: [] });
    }
  });
});

describe('forbidden constructs (Requirement 15.1, 15.3)', () => {
  it('appear in no test file of src/levels/', () => {
    for (const file of levelsTestFiles) {
      expect({ file, hits: findWords(read(file), FORBIDDEN) }).toEqual({ file, hits: [] });
    }
  });

  it('appear in not helpers.ts', () => {
    expect(findWords(read(helpersFile), FORBIDDEN)).toEqual([]);
  });
});

describe('import lists', () => {
  const allowedForTests = (specifier: string): boolean =>
    specifier === 'vitest' ||
    specifier.startsWith('node:') ||
    specifier === './helpers' ||
    specifier === '../game/index' ||
    specifier === '../model/index' ||
    specifier === '../engine/index' ||
    (/^\.\/[^/]+$/.test(specifier) && levelsFiles.some((f) => f.startsWith(join(LEVELS_DIR, specifier.slice(2)))));

  it('each test file imports only vitest, node: modules, ./helpers, siblings and the three barrels', () => {
    for (const file of levelsTestFiles) {
      const bad = importsOf(read(file)).filter((specifier) => !allowedForTests(specifier));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('helpers.ts imports exactly node:fs and the three barrels', () => {
    expect([...new Set(importsOf(read(helpersFile)))].sort()).toEqual(
      ['../engine/index', '../game/index', '../model/index', 'node:fs'].sort(),
    );
  });

  it('index.ts imports exactly the five level files', () => {
    expect(importsOf(read(indexFile))).toEqual([
      './01-the-corridor.json',
      './02-the-chaser.json',
      './03-the-locked-crypt.json',
      './04-the-trap-row.json',
      './05-the-lich.json',
    ]);
  });

  it('index.ts makes no call and uses no browser global', () => {
    const text = read(indexFile);
    expect(text).not.toContain('(');
    expect(findWords(text, BROWSER_GLOBALS)).toEqual([]);
  });
});

describe('bundle reach (Requirement 15.3)', () => {
  it('no non-test .ts file under src/ imports the helper', () => {
    const helperBase = resolve(helpersFile).replace(/\.ts$/, '');
    const offenders: string[] = [];
    for (const file of listFiles(SRC_DIR)) {
      if (!file.endsWith('.ts') || isTestFile(file)) continue;
      for (const specifier of importsOf(read(file))) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier).replace(/\.ts$/, '');
        if (target === helperBase) offenders.push(`${file}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
