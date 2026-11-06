import { describe, expect, it } from 'vitest';
import { makeError, pickError, truncateCause } from './errors';

describe('makeError', () => {
  it('starts the cause with the origin', () => {
    const e = makeError('#REF!', 'B9', 'refers to M30, which does not exist');
    expect(e).toEqual({
      kind: 'error',
      error: '#REF!',
      cause: 'B9 refers to M30, which does not exist',
      origin: 'B9',
    });
  });

  it('keeps the cause between 1 and 200 characters', () => {
    expect(makeError('#VALUE!', 'A1', '').cause).toBe('A1');
    const long = makeError('#VALUE!', 'A1', 'x'.repeat(1000));
    expect(Array.from(long.cause)).toHaveLength(200);
    expect(long.cause.startsWith('A1 ')).toBe(true);
  });
});

describe('pickError', () => {
  it('takes the leftmost error when there is no #CYCLE!', () => {
    const a = makeError('#NAME?', 'B1', 'a');
    const b = makeError('#DIV/0!', 'A1', 'b');
    expect(pickError([a, b])).toBe(a);
    expect(pickError([b, a])).toBe(b);
  });

  it('lets #CYCLE! beat other errors', () => {
    const a = makeError('#REF!', 'A1', 'a');
    const c = makeError('#CYCLE!', 'C5', 'c');
    expect(pickError([a, c])).toBe(c);
    expect(pickError([c, a])).toBe(c);
  });

  it('picks the #CYCLE! with the lowest origin reading index', () => {
    const late = makeError('#CYCLE!', 'A2', 'late'); // index 12
    const early = makeError('#CYCLE!', 'L1', 'early'); // index 11
    expect(pickError([late, early])).toBe(early);
    expect(pickError([early, late])).toBe(early);
  });

  it('keeps the first #CYCLE! on an origin tie', () => {
    const first = makeError('#CYCLE!', 'B2', 'first');
    const second = makeError('#CYCLE!', 'B2', 'second');
    expect(pickError([first, second])).toBe(first);
  });

  it('returns a single error unchanged', () => {
    const a = makeError('#VALUE!', 'D4', 'a');
    expect(pickError([a])).toBe(a);
  });
});

describe('truncateCause', () => {
  it('leaves short text alone', () => {
    expect(truncateCause('short')).toBe('short');
    expect(truncateCause('a'.repeat(200))).toBe('a'.repeat(200));
  });

  it('keeps the start and cuts to 200', () => {
    const out = truncateCause('B9 ' + 'x'.repeat(500));
    expect(out).toHaveLength(200);
    expect(out.startsWith('B9 ')).toBe(true);
  });

  it('never splits a surrogate pair', () => {
    const text = 'a'.repeat(199) + '😀' + 'tail';
    const out = truncateCause(text);
    expect(Array.from(out)).toHaveLength(200);
    expect(out.endsWith('😀')).toBe(true);
    const all = '😀'.repeat(300);
    expect(Array.from(truncateCause(all))).toHaveLength(200);
    expect(truncateCause(all)).toBe('😀'.repeat(200));
  });
});
