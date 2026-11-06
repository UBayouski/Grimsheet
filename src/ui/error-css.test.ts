import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = join(process.cwd(), 'src', 'styles', 'error-monsters.css');
const css = readFileSync(CSS_PATH, 'utf8');

describe('error-monsters.css', () => {
  it('contains no url(, no @import and no http', () => {
    expect(css).not.toMatch(/url\(/);
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/http/);
  });

  it('defines the five kind looks', () => {
    for (const cls of [
      'cell-error-ref',
      'cell-error-name',
      'cell-error-div0',
      'cell-error-value',
      'cell-error-cycle',
    ]) {
      expect(css).toContain(cls);
    }
  });

  it('defines the generic grave rule', () => {
    expect(css).toContain(".cell-error:not([class*='cell-error-'])");
  });

  it('defines the ghost rule', () => {
    expect(css).toContain('td[data-ghost]');
  });

  it('defines the visually-hidden helper', () => {
    expect(css).toContain('.visually-hidden');
  });

  it('includes the reduced-motion block', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('includes the forced-colors block', () => {
    expect(css).toContain('@media (forced-colors: active)');
  });

  it('defines an -fg and a -bg for each colour pair', () => {
    for (const pair of ['ref', 'name', 'div0', 'value', 'cycle']) {
      expect(css).toContain(`--error-${pair}-fg`);
      expect(css).toContain(`--error-${pair}-bg`);
    }
  });
});
