import { parseAddress } from '../engine/index';
import type { ErrorKind, Value } from '../engine/index';

/** Error kind to the CSS class that styles its monster. The view model carries the kind only. */
export const ERROR_CLASS: Readonly<Record<ErrorKind, string>> = {
  '#REF!': 'cell-error-ref',
  '#NAME?': 'cell-error-name',
  '#DIV/0!': 'cell-error-div0',
  '#VALUE!': 'cell-error-value',
  '#CYCLE!': 'cell-error-cycle',
};

/** How long the ghost rests on each Cycle_Cell before drifting to the next, in milliseconds. */
export const GHOST_INTERVAL_MS = 800;

/** An Address paired with its computed Value (or undefined when the Cell has none). */
export interface AddressValue {
  readonly address: string;
  readonly value: Value | undefined;
}

/** The inputs placeGhost reads to decide where the ghost should sit this render (Decision D15). */
export interface PlaceInput {
  readonly prevCells: readonly string[];
  readonly prevAt: string | undefined;
  readonly cells: readonly string[];
  readonly levelChanged: boolean;
  readonly still: boolean;
}

/**
 * A Cycle_Cell is an error Value whose kind is `#CYCLE!` and whose origin is its own Address
 * (Decision D4). A downstream `#CYCLE!` cell carries a different origin and is excluded.
 */
export function isCycleCell(address: string, value: Value | undefined): boolean {
  return value?.kind === 'error' && value.error === '#CYCLE!' && value.origin === address;
}

/**
 * The Cycle_Cells of a sheet in reading order (row first, then column). Keeps only cells that
 * satisfy isCycleCell and have a parseable Address; downstream `#CYCLE!` cells are excluded by
 * isCycleCell. Total: never throws.
 */
export function cycleCellsOf(cells: Iterable<AddressValue>): string[] {
  const kept: { readonly address: string; readonly row: number; readonly col: number }[] = [];
  for (const { address, value } of cells) {
    if (!isCycleCell(address, value)) continue;
    const parsed = parseAddress(address);
    if (!parsed.ok) continue;
    kept.push({ address, row: parsed.point.row, col: parsed.point.col });
  }
  kept.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
  return kept.map((c) => c.address);
}

/** True when two string lists hold the same entries in the same order. */
export function sameCells(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * The cell after `current` in reading order, wrapping after the last. Returns the first cell when
 * `current` is undefined or not in the list, and undefined for an empty list.
 */
export function nextGhostCell(
  list: readonly string[],
  current: string | undefined,
): string | undefined {
  if (list.length === 0) return undefined;
  if (current === undefined) return list[0];
  const i = list.indexOf(current);
  if (i === -1) return list[0];
  return list[(i + 1) % list.length];
}

/**
 * Where the ghost sits this render (Decision D15): nowhere when there are no Cycle_Cells; the first
 * cell when the sheet is still, the level changed, or the Cycle_Cell set changed; otherwise it keeps
 * its place when that place is still a Cycle_Cell, falling back to the first cell.
 */
export function placeGhost(input: PlaceInput): string | undefined {
  const { prevCells, prevAt, cells, levelChanged, still } = input;
  if (cells.length === 0) return undefined;
  if (still || levelChanged || !sameCells(prevCells, cells)) return cells[0];
  return prevAt !== undefined && cells.includes(prevAt) ? prevAt : cells[0];
}
