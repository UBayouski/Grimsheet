import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = ['fonts.css', 'grid-ui.css', 'error-monsters.css', 'chrome.css', 'motion.css'] as const;
const NEW_FILES = ['fonts.css', 'chrome.css', 'motion.css'] as const;

function read(name: string): string {
  return readFileSync(`src/styles/${name}`, 'utf8');
}

function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

/** Flat list of innermost rules (declaration blocks), at any @media depth. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of strip(css).matchAll(re)) {
    const head = (m[1] ?? '').trim();
    if (head.startsWith('@')) continue;
    out.push({
      selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      body: m[2] ?? '',
    });
  }
  return out;
}

function declared(css: string, selector: string, prop: string): string[] {
  const values: string[] = [];
  for (const rule of rules(css)) {
    if (!rule.selectors.includes(selector)) continue;
    for (const m of rule.body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, 'g'))) {
      values.push((m[1] ?? '').trim());
    }
  }
  return values;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

function palette(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of strip(read('chrome.css')).matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] ?? ''] = m[2] ?? '';
  }
  return out;
}

describe('skin stylesheets: sources', () => {
  it('uses url( only in fonts.css, only for a kebab-case ttf under /fonts/', () => {
    for (const name of FILES) {
      const css = read(name);
      const urls = css.match(/url\(/g) ?? [];
      if (name === 'fonts.css') {
        expect(urls.length).toBeGreaterThan(0);
        const ok = css.match(/url\('\/fonts\/[a-z0-9]+(?:-[a-z0-9]+)*\.ttf'\)/g) ?? [];
        expect(ok).toHaveLength(urls.length);
      } else {
        expect(urls, name).toHaveLength(0);
      }
    }
  });

  it('has no @import and no http in any stylesheet', () => {
    for (const name of FILES) {
      const css = read(name);
      expect(css, name).not.toMatch(/@import/);
      expect(css, name).not.toMatch(/http/i);
    }
  });

  it('does not use the CSS pointer-shape property in the new files', () => {
    const prop = ['cur', 'sor'].join('');
    for (const name of NEW_FILES) {
      expect(read(name).toLowerCase(), name).not.toContain(prop);
    }
  });
});

describe('skin stylesheets: layout', () => {
  it('pins the status bar to the bottom of the page', () => {
    const chrome = read('chrome.css');
    expect(declared(chrome, '#status-bar', 'position')).toContain('sticky');
    expect(declared(chrome, '#status-bar', 'bottom')).toContain('0');
    expect(declared(chrome, '#status-bar', 'z-index')).toContain('5');
  });

  it('makes column A 7.5rem and the table 38rem', () => {
    expect(declared(read('chrome.css'), "td.cell[data-col='A']", 'width')).toBeDefined();
    const all = FILES.map(read).join('\n');
    const colA = rules(all).filter((r) => r.selectors.some((s) => s.endsWith("td.cell[data-col='A']")));
    expect(colA.some((r) => /(^|[;\s])width:\s*7\.5rem/.test(r.body))).toBe(true);
    expect(declared(read('grid-ui.css'), '.grid-table', 'width')).toContain('38rem');
  });

  it('never clips the window, the app root, body or html (sticky status bar)', () => {
    const guarded = new Set(['.window', '#window', '.grimsheet-app', 'body', 'html']);
    for (const name of FILES) {
      for (const rule of rules(read(name))) {
        if (!rule.selectors.some((s) => guarded.has(s))) continue;
        for (const m of rule.body.matchAll(/(?:^|[;\s])overflow(?:-[xy])?\s*:\s*([^;]+)/g)) {
          expect(m[1]?.trim(), `${name}: ${rule.selectors.join(', ')}`).toBe('visible');
        }
      }
    }
  });

  it('removed both dark colour-scheme blocks from grid-ui.css', () => {
    const css = read('grid-ui.css');
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(declared(css, '.grimsheet-app', 'font-family')).toHaveLength(0);
    expect(declared(css, '.grimsheet-app', 'background')).toHaveLength(0);
    expect(declared(css, '.grimsheet-app', 'color')).toHaveLength(0);
  });
});

describe('skin stylesheets: motion', () => {
  it('has a slide rule for each of N, S, E and W', () => {
    const css = read('motion.css');
    for (const dir of ['N', 'S', 'E', 'W']) {
      expect(css).toContain(`.entity-glyph[data-slide='${dir}']`);
    }
  });

  it('keeps every animation rule inside the no-preference block, keyframes outside', () => {
    const css = strip(read('motion.css'));
    const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(start).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    const inside = css.slice(start, end + 1);
    const outside = css.slice(0, start) + css.slice(end + 1);
    expect(inside).not.toMatch(/@keyframes/);
    expect(outside).not.toMatch(/animation\s*:/);
    expect(inside.match(/animation\s*:/g)?.length).toBeGreaterThanOrEqual(8);
    expect(css).toMatch(/400ms/);
    expect(css).toMatch(/120ms/);
    expect(css).toMatch(/300ms/);
  });

  it('keeps the reduced-motion block in grid-ui.css', () => {
    const css = strip(read('grid-ui.css'));
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*animation:\s*none\s*!important/);
  });
});

describe('skin stylesheets: contrast', () => {
  const p = palette();
  const get = (k: string): string => {
    const v = p[k];
    if (v === undefined) throw new Error(`missing ${k}`);
    return v;
  };

  it.each([
    ['black on face', '--dark', '--face'],
    ['black on white', '--dark', '--white'],
    ['white on title-a', '--white', '--title-a'],
    ['white on title-b', '--white', '--title-b'],
    ['disabled on face', '--disabled', '--face'],
    ['alert on face', '--alert', '--face'],
  ])('text pair %s is at least 4.5', (_label, fg, bg) => {
    expect(ratio(get(fg), get(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['face', '--face'],
    ['white', '--white'],
  ])('focus ring on %s is at least 3', (_label, bg) => {
    expect(ratio(get('--ring'), get(bg))).toBeGreaterThanOrEqual(3);
  });
});
