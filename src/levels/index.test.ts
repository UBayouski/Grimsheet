import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as barrel from './index';
import { LEVELS } from './index';

const DIR = new URL('./', import.meta.url);

const LEVEL_FILES = [
  '01-the-corridor.json',
  '02-the-chaser.json',
  '03-the-locked-crypt.json',
  '04-the-trap-row.json',
  '05-the-lich.json',
];

function read(name: string): string {
  return readFileSync(new URL(name, DIR), 'utf8');
}

describe('levels barrel', () => {
  it('has exactly the five level files, index.ts and helpers.ts as non-test entries', () => {
    const entries = readdirSync(DIR, { withFileTypes: true });
    expect(entries.filter((e) => e.isDirectory())).toEqual([]);
    const names = entries
      .map((e) => e.name)
      .filter((n) => !n.endsWith('.test.ts'))
      .sort();
    expect(names).toEqual([...LEVEL_FILES, 'helpers.ts', 'index.ts'].sort());
  });

  it('exports only LEVELS, with five entries and no default', () => {
    expect(Object.keys(barrel)).toEqual(['LEVELS']);
    expect('default' in barrel).toBe(false);
    expect(LEVELS).toHaveLength(5);
  });

  it('holds each level file at the same position', () => {
    LEVEL_FILES.forEach((name, i) => {
      expect(LEVELS[i]).toEqual(JSON.parse(read(name)));
    });
  });

  it('has a source with five JSON imports, one export, no call and no default export', () => {
    const source = read('index.ts');
    const imports = source.match(/^import\s.+$/gm) ?? [];
    expect(imports).toHaveLength(5);
    LEVEL_FILES.forEach((name, i) => {
      expect(imports[i]).toContain(`'./${name}'`);
    });
    expect(source.match(/^export\s/gm) ?? []).toHaveLength(1);
    expect(source).not.toContain('(');
    expect(source).not.toContain('default export');
    expect(source.replace(/^import\s.+$/gm, '')).not.toContain('default');
  });
});
