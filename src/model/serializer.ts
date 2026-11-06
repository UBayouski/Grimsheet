import type { CellSpec, Level, LevelDocument, MonsterSpec } from './types';

const MAP_ROWS = 12;
const MAP_COLS = 12;
const GLYPHS = '#.X^';

interface Position {
  readonly row: number;
  readonly col: number;
}

/** Split an Address into 1-based row and column without a pattern. Unknown shapes sort last. */
function positionOf(address: string): Position {
  const upper = address.toUpperCase();
  const col = upper.charCodeAt(0) - 64;
  const row = Number(upper.slice(1));
  return {
    col: Number.isFinite(col) ? col : Number.MAX_SAFE_INTEGER,
    row: Number.isFinite(row) ? row : Number.MAX_SAFE_INTEGER,
  };
}

/** Maps -0 to 0 so a Level never holds negative zero. */
function noNegativeZero(n: number): number {
  return n === 0 ? 0 : n;
}

function isGlyph(text: string): boolean {
  return text.length === 1 && GLYPHS.includes(text);
}

function mapCharAt(map: readonly string[], pos: Position): string {
  const line = map[pos.row - 1];
  const ch = line === undefined ? undefined : line[pos.col - 1];
  return ch === undefined ? '.' : ch;
}

function inMapArea(pos: Position): boolean {
  return pos.row >= 1 && pos.row <= MAP_ROWS && pos.col >= 1 && pos.col <= MAP_COLS;
}

/**
 * Build the Normalized_Document of a level document. Pure and total for any
 * loader-produced input; idempotent. Every object is built key by key in the
 * fixed key order.
 */
export function normalize(doc: LevelDocument): LevelDocument {
  // Later specs at the same Address replace earlier ones (the loader refuses duplicates).
  const byAddress = new Map<string, CellSpec>();
  for (const spec of doc.cells) {
    byAddress.set(spec.address.toUpperCase(), spec);
  }

  const mapRows: string[] = [];
  for (let r = 1; r <= MAP_ROWS; r += 1) {
    let line = '';
    for (let c = 1; c <= MAP_COLS; c += 1) {
      const address = String.fromCharCode(64 + c) + String(r);
      const spec = byAddress.get(address);
      const effective = spec === undefined ? mapCharAt(doc.map, { row: r, col: c }) : spec.raw;
      line += isGlyph(effective) ? effective : '.';
    }
    mapRows.push(line);
  }

  const kept: { readonly pos: Position; readonly spec: CellSpec }[] = [];
  for (const [address, spec] of byAddress) {
    const pos = positionOf(address);
    const locked = spec.locked === true;
    const named = spec.name !== undefined;
    const baseline = inMapArea(pos) ? mapCharAt(mapRows, pos) : '';
    if (!locked && !named && spec.raw === baseline) continue;
    const out: { address: string; raw: string; locked?: true; name?: string } = {
      address,
      raw: spec.raw,
    };
    if (locked) out.locked = true;
    if (spec.name !== undefined) out.name = spec.name.toUpperCase();
    kept.push({ pos, spec: out });
  }
  kept.sort((a, b) => a.pos.row - b.pos.row || a.pos.col - b.pos.col);

  const monsters: MonsterSpec[] = doc.monsters.map((m) => ({
    id: m.id,
    at: m.at.toUpperCase(),
    move: m.move.toUpperCase(),
    atk: m.atk.toUpperCase(),
  }));

  return {
    schemaVersion: 1,
    id: doc.id,
    title: doc.title,
    hint: doc.hint,
    startingHp: noNegativeZero(doc.startingHp),
    ink: noNegativeZero(doc.ink),
    seed: noNegativeZero(doc.seed),
    hero: { at: doc.hero.at.toUpperCase() },
    monsters,
    map: mapRows,
    cells: kept.map((k) => k.spec),
  };
}

/** The Normalized_Document of a Level. */
export function serializeLevel(level: Level): LevelDocument {
  return normalize(level);
}

/** Two-space JSON with `\n` line endings and one trailing newline. */
export function serializeLevelText(level: Level): string {
  return JSON.stringify(serializeLevel(level), null, 2) + '\n';
}

/** Tab label such as `Sheet1: The Corridor`. */
export function tabLabel(level: { readonly id: string; readonly title: string }): string {
  return `Sheet${Number(level.id.slice(0, 2))}: ${level.title}`;
}
