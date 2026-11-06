import { describe, expect, it } from 'vitest';
import { validateContext } from './context';

const random = (): number => 0.5;

describe('validateContext', () => {
  it('accepts a valid context without a self address', () => {
    const r = validateContext({ heroAddress: { col: 2, row: 3 }, random });
    expect(r).toEqual({ ok: true, hero: { col: 2, row: 3 }, self: undefined, random });
  });

  it('keeps a valid self address, even outside the sheet', () => {
    const r = validateContext({
      heroAddress: { col: 1, row: 1 },
      selfAddress: { col: 99, row: -4 },
      random,
    });
    expect(r).toMatchObject({ ok: true, self: { col: 99, row: -4 } });
  });

  it('accepts a hero outside the sheet', () => {
    const r = validateContext({ heroAddress: { col: 0, row: 500 }, random });
    expect(r).toMatchObject({ ok: true, hero: { col: 0, row: 500 } });
  });

  it('rejects a missing or malformed hero', () => {
    expect(validateContext({ random })).toEqual({ ok: false, field: 'heroAddress' });
    for (const heroAddress of [
      null,
      7,
      'B2',
      {},
      { col: 1 },
      { col: 1.5, row: 2 },
      { col: '1', row: 2 },
      { col: Number.NaN, row: 2 },
      { col: Number.POSITIVE_INFINITY, row: 2 },
      { col: 2 ** 53, row: 2 },
    ]) {
      expect(validateContext({ heroAddress, random })).toEqual({
        ok: false,
        field: 'heroAddress',
      });
    }
  });

  it('rejects a random that is not a function', () => {
    const heroAddress = { col: 1, row: 1 };
    expect(validateContext({ heroAddress })).toEqual({ ok: false, field: 'random' });
    expect(validateContext({ heroAddress, random: 0.5 })).toEqual({ ok: false, field: 'random' });
    expect(validateContext({ heroAddress, random: null })).toEqual({ ok: false, field: 'random' });
  });

  it('rejects non-object input', () => {
    for (const ctx of [null, undefined, 42, 'ctx', true]) {
      expect(validateContext(ctx)).toEqual({ ok: false, field: 'heroAddress' });
    }
  });

  it('treats a malformed self address as absent', () => {
    for (const selfAddress of [null, 'A1', { col: 1 }, { col: 1.2, row: 1 }, []]) {
      const r = validateContext({ heroAddress: { col: 1, row: 1 }, selfAddress, random });
      expect(r).toMatchObject({ ok: true, self: undefined });
    }
  });
});
