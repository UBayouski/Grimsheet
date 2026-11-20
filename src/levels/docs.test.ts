import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('sixth-level documentation', () => {
  it('updates the brief, steering and original levels spec', () => {
    const brief = readFileSync(new URL('../../docs/BRIEF.md', import.meta.url), 'utf8');
    const product = readFileSync(new URL('../../.kiro/steering/product.md', import.meta.url), 'utf8');
    const structure = readFileSync(new URL('../../.kiro/steering/structure.md', import.meta.url), 'utf8');
    const levelsSpec = readFileSync(new URL('../../.kiro/specs/levels/requirements.md', import.meta.url), 'utf8');

    expect(brief).toContain('The Audit');
    expect(brief).toContain('Sheet6: The Audit');
    expect(product).toContain('The Audit');
    expect(product).not.toContain('Five hand-written');
    expect(structure).not.toContain('the five level JSON files');
    expect(levelsSpec).toContain('](../sixth-level/requirements.md)');
  });
});
