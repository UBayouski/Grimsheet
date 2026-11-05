import { describe, expect, it } from 'vitest';
import { TITLE } from './title';

describe('title', () => {
  it('is GRIMSHEET.XLS', () => {
    expect(TITLE).toBe('GRIMSHEET.XLS');
  });
});
