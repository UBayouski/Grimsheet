/** 1-based column and row. A GridPoint may lie outside the Sheet (used for out-of-sheet references). */
export interface GridPoint {
  readonly col: number; // integer; A = 1
  readonly row: number; // integer
}

export const SHEET_COLUMNS = 12; // A..L
export const SHEET_ROWS = 20;
export const SHEET_CELL_COUNT = 240;

const ADDRESS_PATTERN = /^[A-La-l]([1-9]|1[0-9]|20)$/;

export function isInSheet(p: GridPoint): boolean {
  return (
    Number.isInteger(p.col) &&
    Number.isInteger(p.row) &&
    p.col >= 1 &&
    p.col <= SHEET_COLUMNS &&
    p.row >= 1 &&
    p.row <= SHEET_ROWS
  );
}

/** Strict Address parser for API input. Returns the canonical (upper case) form. */
export function parseAddress(
  text: string,
): { ok: true; point: GridPoint; canonical: string } | { ok: false } {
  if (typeof text !== 'string' || !ADDRESS_PATTERN.test(text)) {
    return { ok: false };
  }
  const letter = text.charAt(0).toUpperCase();
  const col = letter.charCodeAt(0) - 64;
  const row = Number(text.slice(1));
  return { ok: true, point: { col, row }, canonical: `${letter}${row}` };
}

/** "B9". A column beyond 26 cannot be formatted and yields an empty string. */
export function formatAddress(p: GridPoint): string {
  if (!Number.isInteger(p.col) || p.col < 1 || p.col > 26) return '';
  return `${String.fromCharCode(64 + p.col)}${p.row}`;
}

/** Reading-order index 0..239: (row - 1) * 12 + (col - 1). Only defined for in-sheet points. */
export function readingIndex(p: GridPoint): number {
  return (p.row - 1) * SHEET_COLUMNS + (p.col - 1);
}
