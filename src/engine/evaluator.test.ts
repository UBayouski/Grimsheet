import { describe, expect, it } from 'vitest';
import type { GridPoint } from './address';
import type { CellNode, Node } from './ast';
import { evaluateAst, type CellView, type EvalEnv } from './evaluator';
import { parseFormula } from './parser';
import { booleanValue, numberValue, ruleValue, stringValue, type Value } from './values';

const EMPTY_CELL: CellView = { empty: true, name: null, value: stringValue('') };

interface EnvOptions {
  readonly cells?: Record<string, CellView>; // keyed "col,row"
  readonly names?: Record<string, GridPoint>;
  readonly hero?: GridPoint;
  readonly self?: GridPoint;
  readonly origin?: GridPoint;
}

function key(p: GridPoint): string {
  return `${p.col},${p.row}`;
}

function makeEnv(options: EnvOptions = {}): EvalEnv {
  const cells = options.cells ?? {};
  const names = options.names ?? {};
  return {
    origin: options.origin ?? { col: 2, row: 9 }, // B9
    cellAt: (p) => cells[key(p)] ?? EMPTY_CELL,
    resolveName: (upper) => names[upper],
    hero: options.hero ?? { col: 1, row: 1 },
    self: options.self,
    random: () => 0.5,
  };
}

function run(text: string, options?: EnvOptions): Value {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(`parse failed: ${text}`);
  return evaluateAst(parsed.ast, makeEnv(options));
}

function cell(col: number, row: number): CellNode {
  return { kind: 'cell', col, row } as CellNode;
}

function runAst(ast: Node, options?: EnvOptions): Value {
  return evaluateAst(ast, makeEnv(options));
}

function errorOf(value: Value): { error: string; cause: string } {
  if (value.kind !== 'error') throw new Error(`expected an error, got ${value.kind}`);
  return { error: value.error, cause: value.cause };
}

describe('empty Cell', () => {
  it('reads as 0 for a plain reference', () => {
    expect(run('=A1')).toEqual(numberValue(0));
  });

  it('acts as 0 in arithmetic', () => {
    expect(run('=A1+5')).toEqual(numberValue(5));
    expect(run('=5-A1')).toEqual(numberValue(5));
    expect(run('=A1*5')).toEqual(numberValue(0));
    expect(run('=-A1')).toEqual(numberValue(0));
    expect(run('=A1+A1')).toEqual(numberValue(0));
  });

  it('divides as 0', () => {
    expect(run('=A1/5')).toEqual(numberValue(0));
    expect(errorOf(run('=5/A1')).error).toBe('#DIV/0!');
  });

  it('acts as empty text for &', () => {
    expect(run('="x"&A1')).toEqual(stringValue('x'));
    expect(run('=A1&"y"')).toEqual(stringValue('y'));
  });

  it('takes the type of the other side in comparisons', () => {
    expect(run('=A1=0')).toEqual(booleanValue(true));
    expect(run('=A1<>0')).toEqual(booleanValue(false));
    expect(run('=A1<1')).toEqual(booleanValue(true));
    expect(run('=A1>-1')).toEqual(booleanValue(true));
    expect(run('=A1<=0')).toEqual(booleanValue(true));
    expect(run('=A1>=0')).toEqual(booleanValue(true));
    expect(run('=A1=""')).toEqual(booleanValue(true));
    expect(run('=A1=FALSE')).toEqual(booleanValue(true));
    expect(run('=A1=TRUE')).toEqual(booleanValue(false));
    expect(run('=A1=A1')).toEqual(booleanValue(true));
  });
});

describe('references', () => {
  it('gives #REF! for an out-of-sheet cell', () => {
    const result = errorOf(run('=M1'));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('M1');
    expect(errorOf(run('=A21+1')).error).toBe('#REF!');
  });

  it('gives #REF! for an out-of-sheet range end', () => {
    const range: Node = { kind: 'range', from: cell(1, 1), to: cell(13, 1) };
    expect(errorOf(runAst(range)).error).toBe('#REF!');
  });

  it('gives #REF! for an unknown name', () => {
    const result = errorOf(run('=GHOST'));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('GHOST');
  });

  it('resolves a known name to its cell value', () => {
    const options: EnvOptions = {
      names: { HP: { col: 3, row: 14 } },
      cells: { '3,14': { empty: false, name: 'HP', value: numberValue(7) } },
    };
    expect(run('=HP+1', options)).toEqual(numberValue(8));
  });

  it('gives #REF! for a range used as a plain value', () => {
    // The parser only allows ranges inside calls, so build the AST by hand.
    const range: Node = { kind: 'range', from: cell(1, 1), to: cell(1, 3) };
    const result = errorOf(runAst(range));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('A1:A3');
    const sum: Node = { kind: 'binary', op: '+', left: range, right: { kind: 'number', value: 1 } };
    expect(errorOf(runAst(sum)).error).toBe('#REF!');
  });
});

describe('HERO and SELF', () => {
  it('resolves HERO to the hero cell value', () => {
    const options: EnvOptions = {
      hero: { col: 2, row: 3 },
      cells: { '2,3': { empty: false, name: null, value: stringValue('.') } },
    };
    expect(run('=HERO', options)).toEqual(stringValue('.'));
  });

  it('gives #REF! when HERO is off the sheet', () => {
    expect(errorOf(run('=HERO', { hero: { col: 0, row: 0 } })).error).toBe('#REF!');
  });

  it('resolves SELF when a monster is bound', () => {
    const options: EnvOptions = {
      self: { col: 4, row: 5 },
      cells: { '4,5': { empty: false, name: null, value: numberValue(9) } },
    };
    expect(run('=SELF', options)).toEqual(numberValue(9));
  });

  it('gives #REF! for SELF when no monster is bound', () => {
    const result = errorOf(run('=SELF'));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('SELF');
  });
});

describe('Rule_Cell reference', () => {
  it('gives #VALUE! naming the Rule_Cell', () => {
    const options: EnvOptions = {
      cells: { '2,14': { empty: false, name: 'MOVE_M1', value: ruleValue('=TOWARD(HERO)') } },
    };
    const result = errorOf(run('=B14', options));
    expect(result.error).toBe('#VALUE!');
    expect(result.cause).toContain('B14');
    expect(result.cause).toContain('MOVE_M1');
  });

  it('names an unnamed Rule_Cell by address', () => {
    const options: EnvOptions = {
      cells: { '2,14': { empty: false, name: null, value: ruleValue('=1') } },
    };
    const result = errorOf(run('=B14+1', options));
    expect(result.error).toBe('#VALUE!');
    expect(result.cause).toContain('B14');
  });
});

describe('types', () => {
  it('gives #VALUE! mixing text and numbers', () => {
    expect(errorOf(run('="a"+1')).error).toBe('#VALUE!');
    expect(errorOf(run('=1+"a"')).error).toBe('#VALUE!');
    expect(errorOf(run('=-"a"')).error).toBe('#VALUE!');
    expect(errorOf(run('=TRUE*2')).error).toBe('#VALUE!');
    expect(errorOf(run('="a"=1')).error).toBe('#VALUE!');
    expect(errorOf(run('=1<"a"')).error).toBe('#VALUE!');
  });

  it('compares text without regard to case', () => {
    expect(run('="a"="A"')).toEqual(booleanValue(true));
    expect(run('="a"<"B"')).toEqual(booleanValue(true));
    expect(run('="a"<>"A"')).toEqual(booleanValue(false));
    expect(run('="b"<"A"')).toEqual(booleanValue(false));
  });

  it('folds the sharp s to SS', () => {
    expect(run('="ß"="SS"')).toEqual(booleanValue(true));
  });

  it('joins text and numbers with &', () => {
    expect(run('="a"&1&TRUE')).toEqual(stringValue('a1TRUE'));
  });

  it('propagates operand errors', () => {
    expect(errorOf(run('=1/0+"a"')).error).toBe('#DIV/0!');
    expect(errorOf(run('=M1+1/0')).error).toBe('#REF!');
  });
});

describe('function calls (stub)', () => {
  it('give #NAME? for any call', () => {
    expect(errorOf(run('=SUM(1,2)')).error).toBe('#NAME?');
    expect(errorOf(run('=FOO()')).error).toBe('#NAME?');
    expect(errorOf(run('=1+ABS(2)')).error).toBe('#NAME?');
  });
});
