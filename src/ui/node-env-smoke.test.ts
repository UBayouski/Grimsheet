import { describe, expect, it } from 'vitest';

describe('default node environment', () => {
  it('has no document', () => {
    expect(typeof document).toBe('undefined');
  });
});
