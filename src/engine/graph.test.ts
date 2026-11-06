import { describe, expect, it } from 'vitest';
import { buildGraph, extractDependencies, findCycleCells, topologicalOrder } from './graph';
import type { GraphCell } from './graph';
import { parseFormula } from './parser';
import type { Node } from './ast';

/** Reading-order index of a Cell such as 'B2' (A1 = 0, L1 = 11, A2 = 12). */
function at(address: string): number {
  const col = address.charCodeAt(0) - 64;
  const row = Number(address.slice(1));
  return (row - 1) * 12 + (col - 1);
}

function parse(text: string): Node {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(`parse failed: ${text}`);
  return result.ast;
}

const NAMES: Record<string, number> = { HP: at('B14'), KEY: at('B15') };
const resolveName = (upper: string): number | undefined => NAMES[upper];

function deps(text: string, isRule = false, heroIndex: number | null = at('C3')): number[] {
  return extractDependencies(parse(text), resolveName, { heroIndex: heroIndex ?? undefined, isRule });
}

function cell(address: string, text: string | null, isRule = false): GraphCell {
  return { index: at(address), ast: text === null ? null : parse(text), isRule };
}

describe('extractDependencies edges', () => {
  it('adds an edge for a Cell reference', () => {
    expect(deps('=B2')).toEqual([at('B2')]);
  });

  it('adds an edge for every Cell of a Range, in either corner order', () => {
    const expected = [at('A14'), at('A15'), at('A16')];
    expect(deps('=SUM(A14:A16)')).toEqual(expected);
    expect(deps('=SUM(A16:A14)')).toEqual(expected);
  });

  it('adds an edge for a Range covering a block', () => {
    expect(deps('=SUM(A1:B2)')).toEqual([at('A1'), at('B1'), at('A2'), at('B2')]);
  });

  it('adds an edge for a known name', () => {
    expect(deps('=HP+KEY')).toEqual([at('B14'), at('B15')]);
  });

  it('adds edges from inside every operator and function', () => {
    expect(deps('=-A1 + IF(B1, C1, D1) & E1')).toEqual([at('A1'), at('B1'), at('C1'), at('D1'), at('E1')]);
  });

  it('counts the untaken IF branch', () => {
    expect(deps('=IF(TRUE, A1, B1)')).toEqual([at('A1'), at('B1')]);
  });

  it('de-duplicates and sorts', () => {
    expect(deps('=C1 + A1 + C1 + A1')).toEqual([at('A1'), at('C1')]);
  });
});

describe('extractDependencies non-edges', () => {
  it('adds no edge for literals', () => {
    expect(deps('=1 + 2')).toEqual([]);
    expect(deps('="a" & "b"')).toEqual([]);
    expect(deps('=TRUE')).toEqual([]);
  });

  it('adds no edge for an out-of-sheet reference', () => {
    expect(deps('=M1')).toEqual([]);
    expect(deps('=A21')).toEqual([]);
    expect(deps('=A0')).toEqual([]);
  });

  it('adds no edge for a Range with an out-of-sheet endpoint', () => {
    expect(deps('=SUM(A1:M1)')).toEqual([]);
    expect(deps('=SUM(A19:A21)')).toEqual([]);
  });

  it('adds no edge for an unknown name', () => {
    expect(deps('=NOPE')).toEqual([]);
  });

  it('adds no edge for SELF', () => {
    expect(deps('=SELF')).toEqual([]);
    expect(deps('=DIST(SELF, A1)')).toEqual([at('A1')]);
  });
});

describe('HERO edge', () => {
  it('depends on the hero Cell in a map Cell', () => {
    expect(deps('=HERO', false)).toEqual([at('C3')]);
    expect(deps('=TOWARD(HERO)', false)).toEqual([at('C3')]);
  });

  it('adds no HERO edge in a rule Cell', () => {
    expect(deps('=HERO', true)).toEqual([]);
    expect(deps('=TOWARD(HERO)', true)).toEqual([]);
  });

  it('adds no HERO edge when the hero position is unknown', () => {
    expect(deps('=HERO', false, null)).toEqual([]);
  });

  it('adds no HERO edge for a direct argument of ROW, COL or DIST', () => {
    expect(deps('=ROW(HERO)')).toEqual([]);
    expect(deps('=COL(HERO)')).toEqual([]);
    expect(deps('=DIST(HERO, A1)')).toEqual([at('A1')]);
    expect(deps('=DIST(A1, HERO)')).toEqual([at('A1')]);
  });

  it('keeps the HERO edge when HERO is nested inside such an argument', () => {
    expect(deps('=ROW(IF(TRUE, HERO, A1))')).toEqual([at('A1'), at('C3')]);
    expect(deps('=ABS(HERO)')).toEqual([at('C3')]);
  });
});

describe('buildGraph', () => {
  it('has 240 entries, empty for Cells without a Formula', () => {
    const graph = buildGraph([cell('A1', null), cell('B1', '=A1')], resolveName, undefined);
    expect(graph.edges).toHaveLength(240);
    expect(graph.edges[at('A1')]).toEqual([]);
    expect(graph.edges[at('B1')]).toEqual([at('A1')]);
  });

  it('ignores input with an index outside the Sheet', () => {
    const bad: GraphCell = { index: 240, ast: parse('=A1'), isRule: false };
    const graph = buildGraph([bad], resolveName, undefined);
    expect(graph.edges.every((out) => out.length === 0)).toBe(true);
  });

  it('applies the rule flag per Cell', () => {
    const graph = buildGraph([cell('A1', '=HERO', false), cell('A2', '=HERO', true)], resolveName, at('C3'));
    expect(graph.edges[at('A1')]).toEqual([at('C3')]);
    expect(graph.edges[at('A2')]).toEqual([]);
  });

  it('gives the same result for shuffled input', () => {
    const cells = [
      cell('A1', '=B1'),
      cell('B1', '=C1 + HP'),
      cell('C1', '=1'),
      cell('D1', '=SUM(A1:C1)'),
      cell('B14', '=D1'),
    ];
    const reversed = [...cells].reverse();
    const rotated = [...cells.slice(2), ...cells.slice(0, 2)];
    const base = buildGraph(cells, resolveName, at('C3'));
    expect(buildGraph(reversed, resolveName, at('C3'))).toEqual(base);
    expect(buildGraph(rotated, resolveName, at('C3'))).toEqual(base);
    expect(topologicalOrder(buildGraph(reversed, resolveName, at('C3')))).toEqual(topologicalOrder(base));
    expect(findCycleCells(buildGraph(rotated, resolveName, at('C3')))).toEqual(findCycleCells(base));
  });
});

describe('findCycleCells', () => {
  it('finds nothing in an acyclic graph', () => {
    const graph = buildGraph([cell('A1', '=B1'), cell('B1', '=C1'), cell('C1', '=1')], resolveName, undefined);
    expect(findCycleCells(graph)).toEqual([]);
  });

  it('finds a self-loop', () => {
    const graph = buildGraph([cell('A1', '=A1'), cell('B1', '=A1')], resolveName, undefined);
    expect(findCycleCells(graph)).toEqual([at('A1')]);
  });

  it('finds a two-Cell cycle', () => {
    const graph = buildGraph([cell('A1', '=B1'), cell('B1', '=A1')], resolveName, undefined);
    expect(findCycleCells(graph)).toEqual([at('A1'), at('B1')]);
  });

  it('finds a cycle with a tail, and only the cycle', () => {
    const graph = buildGraph(
      [cell('A1', '=B1'), cell('B1', '=C1'), cell('C1', '=B1'), cell('D1', '=A1'), cell('E1', '=1')],
      resolveName,
      undefined,
    );
    expect(findCycleCells(graph)).toEqual([at('B1'), at('C1')]);
  });

  it('finds a cycle through a name and a Range', () => {
    const graph = buildGraph(
      [cell('B14', '=SUM(A1:A2)'), cell('A1', '=1'), cell('A2', '=HP')],
      resolveName,
      undefined,
    );
    expect(findCycleCells(graph)).toEqual([at('A2'), at('B14')]);
  });

  it('finds a HERO cycle in a map Cell but not in a rule Cell', () => {
    const hero = at('C3');
    const map = buildGraph([cell('C3', '=HERO')], resolveName, hero);
    expect(findCycleCells(map)).toEqual([hero]);
    const rule = buildGraph([cell('C3', '=HERO', true)], resolveName, hero);
    expect(findCycleCells(rule)).toEqual([]);
  });

  it('does not form a cycle through the direct-argument exception', () => {
    const graph = buildGraph([cell('C3', '=ROW(HERO)')], resolveName, at('C3'));
    expect(findCycleCells(graph)).toEqual([]);
  });
});

describe('topologicalOrder', () => {
  it('lists every Cell exactly once', () => {
    const order = topologicalOrder(buildGraph([cell('A1', '=B1')], resolveName, undefined));
    expect(order).toHaveLength(240);
    expect(new Set(order).size).toBe(240);
  });

  it('puts a Cell after the Cells it depends on', () => {
    const graph = buildGraph(
      [cell('A1', '=B1'), cell('B1', '=C1'), cell('C1', '=D1'), cell('D1', '=1')],
      resolveName,
      undefined,
    );
    const order = topologicalOrder(graph);
    const position = (address: string): number => order.indexOf(at(address));
    expect(position('D1')).toBeLessThan(position('C1'));
    expect(position('C1')).toBeLessThan(position('B1'));
    expect(position('B1')).toBeLessThan(position('A1'));
  });

  it('breaks ties by reading index', () => {
    const order = topologicalOrder(buildGraph([], resolveName, undefined));
    expect(order).toEqual(Array.from({ length: 240 }, (_, i) => i));
  });

  it('breaks ties by reading index among ready Cells', () => {
    // A1 depends on the last Cell, L20; everything else is independent.
    const graph = buildGraph([cell('A1', '=L20')], resolveName, undefined);
    const order = topologicalOrder(graph);
    expect(order.indexOf(at('L20'))).toBeLessThan(order.indexOf(at('A1')));
    expect(order.slice(0, 3)).toEqual([at('B1'), at('C1'), at('D1')]);
    expect(order[0]).toBe(at('B1'));
  });

  it('emits members of a cycle together, ascending, after their dependencies', () => {
    const graph = buildGraph(
      [cell('B1', '=C1'), cell('C1', '=B1 + A5'), cell('A5', '=1'), cell('A1', '=B1')],
      resolveName,
      undefined,
    );
    const order = topologicalOrder(graph);
    const position = (address: string): number => order.indexOf(at(address));
    expect(position('C1')).toBe(position('B1') + 1);
    expect(position('A5')).toBeLessThan(position('B1'));
    expect(position('B1')).toBeLessThan(position('A1'));
  });
});
