import { isInSheet, readingIndex, SHEET_CELL_COUNT } from './address';
import type { CellNode, Node } from './ast';

export interface DependencyGraph {
  /** edges[i] = sorted, de-duplicated indices of the Cells that Cell i depends on. */
  readonly edges: readonly (readonly number[])[]; // length 240
}

/** Plain per-Cell input for buildGraph. Independent of the Sheet store. */
export interface GraphCell {
  readonly index: number; // reading-order index 0..239
  readonly ast: Node | null; // null for literals and empty Cells
  readonly isRule: boolean;
}

/** Functions whose direct HERO argument needs only the position, not the Value. */
const POSITION_ONLY_FUNCTIONS: readonly string[] = ['ROW', 'COL', 'DIST'];

function inSheetIndex(node: CellNode): number | undefined {
  const point = { col: node.col, row: node.row };
  return isInSheet(point) ? readingIndex(point) : undefined;
}

/**
 * Indices of the Cells that a Formula depends on, from its text alone (untaken IF branches count).
 * Out-of-sheet references, unknown names and Ranges with an out-of-sheet endpoint add no edge.
 * Result is sorted ascending and de-duplicated.
 */
export function extractDependencies(
  ast: Node,
  resolveName: (upper: string) => number | undefined,
  options: { readonly heroIndex: number | undefined; readonly isRule: boolean },
): number[] {
  const found = new Set<number>();
  const stack: { node: Node; positionOnly: boolean }[] = [{ node: ast, positionOnly: false }];
  while (stack.length > 0) {
    const { node, positionOnly } = stack.pop() as { node: Node; positionOnly: boolean };
    switch (node.kind) {
      case 'cell': {
        const index = inSheetIndex(node);
        if (index !== undefined) found.add(index);
        break;
      }
      case 'range': {
        if (inSheetIndex(node.from) === undefined || inSheetIndex(node.to) === undefined) break;
        const colLow = Math.min(node.from.col, node.to.col);
        const colHigh = Math.max(node.from.col, node.to.col);
        const rowLow = Math.min(node.from.row, node.to.row);
        const rowHigh = Math.max(node.from.row, node.to.row);
        for (let row = rowLow; row <= rowHigh; row += 1) {
          for (let col = colLow; col <= colHigh; col += 1) {
            found.add(readingIndex({ col, row }));
          }
        }
        break;
      }
      case 'name': {
        if (node.name === 'HERO') {
          if (!positionOnly && !options.isRule && options.heroIndex !== undefined) {
            found.add(options.heroIndex);
          }
        } else if (node.name !== 'SELF') {
          const index = resolveName(node.name);
          if (index !== undefined) found.add(index);
        }
        break;
      }
      case 'negate':
        stack.push({ node: node.operand, positionOnly: false });
        break;
      case 'binary':
        stack.push({ node: node.left, positionOnly: false }, { node: node.right, positionOnly: false });
        break;
      case 'call': {
        const exempt = POSITION_ONLY_FUNCTIONS.includes(node.name);
        for (const arg of node.args) stack.push({ node: arg, positionOnly: exempt });
        break;
      }
      default:
        break;
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Builds the graph from plain per-Cell input. The result does not depend on the order of `cells`. */
export function buildGraph(
  cells: readonly GraphCell[],
  resolveName: (upper: string) => number | undefined,
  heroIndex: number | undefined,
): DependencyGraph {
  const merged: Set<number>[] = [];
  for (let i = 0; i < SHEET_CELL_COUNT; i += 1) merged.push(new Set<number>());
  for (const cell of cells) {
    if (!Number.isInteger(cell.index) || cell.index < 0 || cell.index >= SHEET_CELL_COUNT) continue;
    if (cell.ast === null) continue;
    const deps = extractDependencies(cell.ast, resolveName, { heroIndex, isRule: cell.isRule });
    const target = merged[cell.index] as Set<number>;
    for (const dep of deps) target.add(dep);
  }
  return { edges: merged.map((set) => [...set].sort((a, b) => a - b)) };
}

interface Components {
  readonly componentOf: number[];
  readonly members: number[][]; // each ascending
}

/** Iterative Tarjan. Component ids are arbitrary but deterministic. */
function stronglyConnected(graph: DependencyGraph): Components {
  const n = graph.edges.length;
  const order = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const componentOf = new Array<number>(n).fill(-1);
  const members: number[][] = [];
  const tarjanStack: number[] = [];
  let counter = 0;

  for (let root = 0; root < n; root += 1) {
    if (order[root] !== -1) continue;
    const work: { v: number; next: number }[] = [{ v: root, next: 0 }];
    order[root] = low[root] = counter;
    counter += 1;
    tarjanStack.push(root);
    onStack[root] = true;
    while (work.length > 0) {
      const frame = work[work.length - 1] as { v: number; next: number };
      const v = frame.v;
      const out = graph.edges[v] as readonly number[];
      if (frame.next < out.length) {
        const w = out[frame.next] as number;
        frame.next += 1;
        if (w < 0 || w >= n) continue;
        if (order[w] === -1) {
          order[w] = low[w] = counter;
          counter += 1;
          tarjanStack.push(w);
          onStack[w] = true;
          work.push({ v: w, next: 0 });
        } else if (onStack[w]) {
          low[v] = Math.min(low[v] as number, order[w] as number);
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = (work[work.length - 1] as { v: number }).v;
          low[parent] = Math.min(low[parent] as number, low[v] as number);
        }
        if (low[v] === order[v]) {
          const id = members.length;
          const group: number[] = [];
          let w: number;
          do {
            w = tarjanStack.pop() as number;
            onStack[w] = false;
            componentOf[w] = id;
            group.push(w);
          } while (w !== v);
          group.sort((a, b) => a - b);
          members.push(group);
        }
      }
    }
  }
  return { componentOf, members };
}

function isCircular(graph: DependencyGraph, group: readonly number[]): boolean {
  if (group.length >= 2) return true;
  const only = group[0] as number;
  return (graph.edges[only] as readonly number[]).includes(only);
}

/**
 * The circular strongly connected components from the same Tarjan pass: one ascending list of
 * Cell indices per component that is a real circular reference (2+ Cells, or a Cell that
 * depends on itself). Lists are ordered by their smallest member.
 */
export function circularComponents(graph: DependencyGraph): number[][] {
  const { members } = stronglyConnected(graph);
  return members
    .filter((group) => isCircular(graph, group))
    .sort((a, b) => (a[0] as number) - (b[0] as number));
}

/** Tarjan's algorithm (iterative). Returns the Cell indices on a circular reference, ascending. */
export function findCycleCells(graph: DependencyGraph): number[] {
  const { members } = stronglyConnected(graph);
  const cycle: number[] = [];
  for (const group of members) {
    if (isCircular(graph, group)) cycle.push(...group);
  }
  return cycle.sort((a, b) => a - b);
}

/**
 * Kahn's algorithm over the condensation. A Cell comes after every Cell it depends on.
 * Among ready components the one with the smallest member index goes first; members of a
 * circular component are emitted together, ascending.
 */
export function topologicalOrder(graph: DependencyGraph): number[] {
  const { componentOf, members } = stronglyConnected(graph);
  const count = members.length;
  const remaining = new Array<number>(count).fill(0);
  const dependents: Set<number>[] = [];
  for (let c = 0; c < count; c += 1) dependents.push(new Set<number>());
  const dependencies: Set<number>[] = [];
  for (let c = 0; c < count; c += 1) dependencies.push(new Set<number>());
  graph.edges.forEach((out, from) => {
    const a = componentOf[from] as number;
    for (const to of out) {
      const b = componentOf[to];
      if (b === undefined || b < 0 || b === a) continue;
      (dependencies[a] as Set<number>).add(b);
    }
  });
  for (let a = 0; a < count; a += 1) {
    remaining[a] = (dependencies[a] as Set<number>).size;
    for (const b of dependencies[a] as Set<number>) (dependents[b] as Set<number>).add(a);
  }
  const key = (c: number): number => (members[c] as number[])[0] as number;
  const ready: number[] = [];
  for (let c = 0; c < count; c += 1) if (remaining[c] === 0) ready.push(c);

  const result: number[] = [];
  while (ready.length > 0) {
    let best = 0;
    for (let i = 1; i < ready.length; i += 1) {
      if (key(ready[i] as number) < key(ready[best] as number)) best = i;
    }
    const [component] = ready.splice(best, 1) as [number];
    result.push(...(members[component] as number[]));
    for (const next of dependents[component] as Set<number>) {
      remaining[next] = (remaining[next] as number) - 1;
      if (remaining[next] === 0) ready.push(next);
    }
  }
  return result;
}
