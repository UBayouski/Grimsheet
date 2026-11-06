import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, isRuleAst, type Node } from './ast';

const num = (value: number): Node => ({ kind: 'number', value });
const name = (n: string): Node => ({ kind: 'name', name: n });
const call = (n: string, ...args: Node[]): Node => ({ kind: 'call', name: n, args });

describe('isRuleAst', () => {
  it('finds SELF nested in IF', () => {
    const ast = call('IF', { kind: 'boolean', value: true }, num(1), name('SELF'));
    expect(isRuleAst(ast)).toBe(true);
  });

  it('finds TOWARD in an argument', () => {
    const ast = call('SUM', num(1), call('TOWARD', name('HERO'), { kind: 'cell', col: 2, row: 2 }));
    expect(isRuleAst(ast)).toBe(true);
  });

  it('finds SELF under negate and binary', () => {
    const ast: Node = {
      kind: 'binary',
      op: '+',
      left: num(1),
      right: { kind: 'negate', operand: name('SELF') },
    };
    expect(isRuleAst(ast)).toBe(true);
  });

  it('ignores the string "SELF"', () => {
    expect(isRuleAst({ kind: 'string', value: 'SELF' })).toBe(false);
    expect(isRuleAst(call('IF', { kind: 'string', value: 'TOWARD' }, num(1), num(2)))).toBe(false);
  });

  it('is false for a plain formula', () => {
    const ast: Node = {
      kind: 'binary',
      op: '*',
      left: { kind: 'cell', col: 1, row: 1 },
      right: call('SUM', { kind: 'range', from: { kind: 'cell', col: 1, row: 1 }, to: { kind: 'cell', col: 1, row: 3 } }),
    };
    expect(isRuleAst(ast)).toBe(false);
    expect(isRuleAst(name('HERO'))).toBe(false);
  });
});

describe('MAX_DEPTH', () => {
  it('is 200', () => {
    expect(MAX_DEPTH).toBe(200);
  });
});

describe('isRuleAst with input from plain JavaScript', () => {
  it('refuses malformed input with false instead of throwing', () => {
    const malformed: unknown[] = [
      undefined,
      null,
      5,
      'SELF',
      {},
      { kind: 'call', name: 'SUM' }, // no args
      { kind: 'call', name: 'SUM', args: [undefined] },
      { kind: 'negate' },
      { kind: 'binary', op: '+', left: undefined, right: null },
    ];
    for (const bad of malformed) {
      expect(isRuleAst(bad as Node)).toBe(false);
    }
  });

  it('refuses an object whose property getter throws', () => {
    const hostile = {
      get kind(): never {
        throw new Error('boom');
      },
    };
    expect(isRuleAst(hostile as unknown as Node)).toBe(false);
  });

  it('still recognizes a real Rule_Cell AST', () => {
    expect(isRuleAst({ kind: 'name', name: 'SELF' })).toBe(true);
  });
});
