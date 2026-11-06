import { describe, expect, it } from 'vitest';
import {
  SHEET_CELL_COUNT,
  formatAddress,
  isInSheet,
  parseAddress,
  readingIndex,
} from './address';

describe('parseAddress', () => {
  it('accepts A1', () => {
    expect(parseAddress('A1')).toEqual({ ok: true, point: { col: 1, row: 1 }, canonical: 'A1' });
  });

  it('accepts L20', () => {
    expect(parseAddress('L20')).toEqual({ ok: true, point: { col: 12, row: 20 }, canonical: 'L20' });
  });

  it('canonicalizes b7 to B7', () => {
    expect(parseAddress('b7')).toEqual({ ok: true, point: { col: 2, row: 7 }, canonical: 'B7' });
  });

  it.each(['M1', 'A0', 'A21', 'A01', '+A1', 'A1.0', ' A1', ''])('rejects %j', (text) => {
    expect(parseAddress(text)).toEqual({ ok: false });
  });
});

describe('readingIndex', () => {
  it('is 0 for A1', () => {
    expect(readingIndex({ col: 1, row: 1 })).toBe(0);
  });

  it('is 239 for L20', () => {
    expect(readingIndex({ col: 12, row: 20 })).toBe(239);
    expect(SHEET_CELL_COUNT - 1).toBe(239);
  });
});

describe('isInSheet and formatAddress', () => {
  it('checks sheet bounds', () => {
    expect(isInSheet({ col: 12, row: 20 })).toBe(true);
    expect(isInSheet({ col: 13, row: 1 })).toBe(false);
    expect(isInSheet({ col: 1, row: 0 })).toBe(false);
  });

  it('formats an address', () => {
    expect(formatAddress({ col: 2, row: 9 })).toBe('B9');
  });
});
