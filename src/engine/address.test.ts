import { describe, expect, it } from 'vitest';
import {
  SHEET_CELL_COUNT,
  formatAddress,
  isInSheet,
  parseAddress,
  readingIndex,
} from './address';

describe('parseAddress', () => {
  it('parses A1 and L20', () => {
    expect(parseAddress('A1')).toEqual({ ok: true, point: { col: 1, row: 1 }, canonical: 'A1' });
    expect(parseAddress('L20')).toEqual({ ok: true, point: { col: 12, row: 20 }, canonical: 'L20' });
  });

  it('canonicalizes lower case', () => {
    expect(parseAddress('b7')).toEqual({ ok: true, point: { col: 2, row: 7 }, canonical: 'B7' });
  });

  it.each(['M1', 'A0', 'A21', 'A01', '+A1', 'A1.0', ' A1', 'A1 ', '', 'A', '1'])(
    'rejects %j',
    (text) => {
      expect(parseAddress(text)).toEqual({ ok: false });
    },
  );
});

describe('formatAddress', () => {
  it('formats points', () => {
    expect(formatAddress({ col: 2, row: 9 })).toBe('B9');
    expect(formatAddress({ col: 12, row: 20 })).toBe('L20');
  });

  it('returns empty for unformattable columns', () => {
    expect(formatAddress({ col: 0, row: 1 })).toBe('');
    expect(formatAddress({ col: 27, row: 1 })).toBe('');
  });
});

describe('isInSheet', () => {
  it('checks bounds', () => {
    expect(isInSheet({ col: 1, row: 1 })).toBe(true);
    expect(isInSheet({ col: 12, row: 20 })).toBe(true);
    expect(isInSheet({ col: 13, row: 1 })).toBe(false);
    expect(isInSheet({ col: 1, row: 21 })).toBe(false);
    expect(isInSheet({ col: 0, row: 1 })).toBe(false);
    expect(isInSheet({ col: 1.5, row: 1 })).toBe(false);
  });
});

describe('readingIndex', () => {
  it('runs 0 to 239 in reading order', () => {
    expect(readingIndex({ col: 1, row: 1 })).toBe(0);
    expect(readingIndex({ col: 2, row: 1 })).toBe(1);
    expect(readingIndex({ col: 1, row: 2 })).toBe(12);
    expect(readingIndex({ col: 12, row: 20 })).toBe(239);
    expect(SHEET_CELL_COUNT).toBe(240);
  });
});
