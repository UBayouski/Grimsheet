import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('README level documentation', () => {
  it('describes the sixth level', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('6: The Audit');
    expect(readme).toContain('The Audit');
    expect(readme).not.toContain('five hand-built');
  });
});
