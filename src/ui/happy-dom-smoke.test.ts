// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

describe('happy-dom environment', () => {
  it('provides a document that can create elements and set textContent', () => {
    expect(typeof document).toBe('object');
    const el = document.createElement('div');
    el.textContent = 'hello';
    expect(el.textContent).toBe('hello');
  });
});
