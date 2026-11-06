/**
 * Single owner of every fast-check generator used by the game-rules tests.
 * Test support only: not exported from `src/game/index.ts`.
 * All randomness here comes from fast-check or from the seeded `seededRandom` source below.
 */
import * as fc from 'fast-check';
import type { CellSpec, LevelDocument, MonsterSpec, RandomSource } from '../../model/index';

// ---------------------------------------------------------------------------
// Seeded Random_Source
// ---------------------------------------------------------------------------

/** mulberry32-style seeded source. Returns numbers in [0, 1). */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// assertProperty
// ---------------------------------------------------------------------------

function readSeed(): number | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const raw = env?.['FC_SEED'];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

/**
 * The one place `fc.assert` is called. Uses `FC_SEED` from the environment when set, so a failure
 * report (which includes the seed) can be replayed.
 */
export function assertProperty<Ts>(property: fc.IRawProperty<Ts>, numRuns: number): void {
  const seed = readSeed();
  fc.assert(property, seed === undefined ? { numRuns } : { numRuns, seed });
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

const COLUMN_LETTERS = 'ABCDEFGHIJKL';

/** Address text for a 0-based reading-order index (0 to 239). */
function addressOf(index: number): string {
  return `${COLUMN_LETTERS.charAt(index % 12)}${Math.floor(index / 12) + 1}`;
}

/** All 240 canonical addresses, in reading order. */
export const ALL_ADDRESSES: readonly string[] = Array.from({ length: 240 }, (_, i) => addressOf(i));

function pick<T>(items: readonly T[], n: number): T {
  return items[n % items.length] as T;
}

// ---------------------------------------------------------------------------
// gameLevelArbitrary
// ---------------------------------------------------------------------------

const MOVE_POOL: readonly string[] = [
  '="N"',
  '="-"',
  '=TOWARD(HERO)',
  '=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")',
  '=IF(RAND()<0.5,"E","W")',
  '=1/0',
];

const ATK_POOL: readonly string[] = [
  '0',
  '0.9',
  '1',
  '1.5',
  '2',
  '-1',
  '=RAND()*2',
  '=IF(DIST(HERO,SELF)<2,1,0)',
  'hit',
  '=1/0',
  '1e300',
];

const TRAP_POOL: readonly string[] = [
  '0',
  '0.5',
  '1',
  '1.5',
  '2',
  '=RAND()+1',
  'spikes',
  '1e300',
];

type ExtraKind = 'rand' | 'div0' | 'locked-wall' | 'locked-floor';

interface ExtraPlan {
  readonly pick: number;
  readonly kind: ExtraKind;
}

interface LevelPlan {
  readonly glyphs: readonly string[];
  readonly patchRow: number;
  readonly patchCol: number;
  readonly heroPick: number;
  readonly monsterCount: number;
  readonly monsterPicks: readonly number[];
  readonly moves: readonly number[];
  readonly atks: readonly number[];
  readonly lockedRules: readonly boolean[];
  readonly trap: number | undefined;
  readonly seed: number;
  readonly startingHp: number;
  readonly ink: number;
  readonly extras: readonly ExtraPlan[];
  readonly cycle: readonly [number, number] | undefined;
}

const glyphArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constant('.') },
  { weight: 2, arbitrary: fc.constant('#') },
  { weight: 1, arbitrary: fc.constant('X') },
  { weight: 1, arbitrary: fc.constant('^') },
);

const levelPlanArb: fc.Arbitrary<LevelPlan> = fc.record({
  glyphs: fc.array(glyphArb, { minLength: 144, maxLength: 144 }),
  patchRow: fc.integer({ min: 0, max: 9 }),
  patchCol: fc.integer({ min: 0, max: 9 }),
  heroPick: fc.nat(1000),
  monsterCount: fc.integer({ min: 0, max: 4 }),
  monsterPicks: fc.array(fc.nat(1000), { minLength: 4, maxLength: 4 }),
  moves: fc.array(fc.nat(100), { minLength: 4, maxLength: 4 }),
  atks: fc.array(fc.nat(100), { minLength: 4, maxLength: 4 }),
  lockedRules: fc.array(fc.boolean(), { minLength: 9, maxLength: 9 }),
  trap: fc.option(fc.nat(100), { nil: undefined }),
  seed: fc.integer({ min: 0, max: 4294967295 }),
  startingHp: fc.integer({ min: 1, max: 20 }),
  ink: fc.integer({ min: 0, max: 5 }),
  extras: fc.array(
    fc.record({
      pick: fc.nat(1000),
      kind: fc.constantFrom<ExtraKind>('rand', 'div0', 'locked-wall', 'locked-floor'),
    }),
    { maxLength: 6 },
  ),
  cycle: fc.option(fc.tuple(fc.nat(1000), fc.nat(1000)), { nil: undefined }),
});

/** Index of a rules-panel slot's label cell (rows 14 to 20, six label/rule pairs per row). */
function slotLabelIndex(slot: number): number {
  const row = 14 + Math.floor(slot / 6);
  return (row - 1) * 12 + (slot % 6) * 2;
}

/** Next free index at or after `start` (wrapping over `size`) that is not in `used`. */
function probe(start: number, size: number, used: ReadonlySet<number>): number | undefined {
  for (let step = 0; step < size; step++) {
    const index = (start + step) % size;
    if (!used.has(index)) return index;
  }
  return undefined;
}

function buildLevel(plan: LevelPlan): LevelDocument {
  const glyphs = [...plan.glyphs];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) glyphs[(plan.patchRow + r) * 12 + plan.patchCol + c] = '.';
  }
  const floor: number[] = [];
  glyphs.forEach((g, i) => {
    if (g === '.') floor.push(i);
  });

  // Entities: hero and monsters on distinct floor cells (the patch guarantees at least nine).
  const used = new Set<number>();
  const takeFloor = (n: number): number => {
    const start = n % floor.length;
    for (let step = 0; step < floor.length; step++) {
      const index = floor[(start + step) % floor.length] as number;
      if (!used.has(index)) {
        used.add(index);
        return index;
      }
    }
    throw new Error('no free floor cell');
  };
  const heroIndex = takeFloor(plan.heroPick);
  const monsterIndexes: number[] = [];
  for (let i = 0; i < plan.monsterCount; i++) {
    monsterIndexes.push(takeFloor(plan.monsterPicks[i] as number));
  }

  const cells: CellSpec[] = [];
  const rule = (slot: number, label: string, raw: string, name: string): void => {
    const labelIndex = slotLabelIndex(slot);
    cells.push({ address: addressOf(labelIndex), raw: label });
    const locked = plan.lockedRules[slot] === true;
    cells.push({
      address: addressOf(labelIndex + 1),
      raw,
      ...(locked ? { locked: true as const } : {}),
      name,
    });
  };

  const monsters: MonsterSpec[] = monsterIndexes.map((index, i) => {
    const n = i + 1;
    rule(2 * i, `Move M${n}`, pick(MOVE_POOL, plan.moves[i] as number), `MOVE_M${n}`);
    rule(2 * i + 1, `Attack M${n}`, pick(ATK_POOL, plan.atks[i] as number), `ATK_M${n}`);
    return { id: `M${n}`, at: addressOf(index), move: `MOVE_M${n}`, atk: `ATK_M${n}` };
  });
  if (plan.trap !== undefined) rule(8, 'Trap damage', pick(TRAP_POOL, plan.trap), 'TRAP');

  // Extra map cells, never on an entity start and never twice on one cell.
  for (const extra of plan.extras) {
    const index = probe(extra.pick % 144, 144, used);
    if (index === undefined) break;
    used.add(index);
    const address = addressOf(index);
    switch (extra.kind) {
      case 'rand':
        cells.push({ address, raw: '=IF(RAND()<0.5,".","#")' });
        break;
      case 'div0':
        cells.push({ address, raw: '=1/0' });
        break;
      case 'locked-wall':
        cells.push({ address, raw: '#', locked: true });
        break;
      case 'locked-floor':
        cells.push({ address, raw: '.', locked: true });
        break;
    }
  }
  if (plan.cycle !== undefined) {
    const a = probe(plan.cycle[0] % 144, 144, used);
    if (a !== undefined) {
      used.add(a);
      const b = probe(plan.cycle[1] % 144, 144, used);
      if (b !== undefined) {
        used.add(b);
        cells.push({ address: addressOf(a), raw: `=${addressOf(b)}` });
        cells.push({ address: addressOf(b), raw: `=${addressOf(a)}` });
      }
    }
  }

  const map: string[] = [];
  for (let r = 0; r < 12; r++) map.push(glyphs.slice(r * 12, r * 12 + 12).join(''));

  return {
    schemaVersion: 1,
    id: '01-game-level',
    title: 'Generated Level',
    hint: 'Reach the exit.',
    startingHp: plan.startingHp,
    ink: plan.ink,
    seed: plan.seed,
    hero: { at: addressOf(heroIndex) },
    monsters,
    map,
    cells,
  };
}

/** Valid Level_Documents that the loader accepts. */
export const gameLevelArbitrary: fc.Arbitrary<LevelDocument> = levelPlanArb.map(buildLevel);

// ---------------------------------------------------------------------------
// actionListArbitrary
// ---------------------------------------------------------------------------

const MALFORMED: readonly unknown[] = [
  null,
  undefined,
  { kind: 'jump' },
  { kind: 'move', dir: 'X' },
  { kind: 'edit', address: 5, raw: 'x' },
  { kind: 'edit', address: 'A1' },
  { kind: 'move' },
  'move',
  42,
  [],
];

const EDIT_LITERALS: readonly string[] = ['hello', '42', '-3.5', 'TRUE', '', 'x y', '0.9', '1e300'];
const EDIT_GLYPHS: readonly string[] = ['#', '.', 'X', '^'];
const EDIT_FORMULAS: readonly string[] = [
  '=1+1',
  '=HERO',
  '="N"',
  '=TOWARD(HERO)',
  '=DIST(HERO,SELF)',
  '=1/0',
  '=RAND()',
  '=IF(RAND()<0.5,".","#")',
  '=IF(RAND()<0.5,"#",".")',
];
const EDIT_INVALID: readonly string[] = ['=1+', '=(', '=)', '="', '=NOSUCH(', '=1 2'];
const BAD_ADDRESS_TEXT: readonly string[] = ['Z99', '', 'A0', 'M1', '1A', 'a', 'A21', ' B2', 'B2 '];

const editAddressArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 239 }).map(addressOf) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 239 }).map((i) => addressOf(i).toLowerCase()) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 11 }).map((c) => `${COLUMN_LETTERS.charAt(c)}13`) },
  { weight: 1, arbitrary: fc.constantFrom(...BAD_ADDRESS_TEXT) },
);

const editRawArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...EDIT_LITERALS) },
  { weight: 4, arbitrary: fc.constantFrom(...EDIT_GLYPHS) },
  { weight: 3, arbitrary: fc.constantFrom(...EDIT_FORMULAS) },
  // A formula that points at another cell: with two of these a cycle forms.
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 239 }).map((i) => `=${addressOf(i)}`) },
  { weight: 1, arbitrary: fc.constantFrom(...EDIT_INVALID) },
  { weight: 1, arbitrary: fc.integer({ min: 500, max: 600 }).map((n) => 'a'.repeat(n)) },
);

const directionArb = fc.constantFrom('N', 'S', 'E', 'W');

const actionArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: directionArb.map((dir) => ({ kind: 'move', dir })) },
  { weight: 2, arbitrary: fc.constant({ kind: 'wait' }) },
  {
    weight: 6,
    arbitrary: fc
      .tuple(editAddressArb, editRawArb)
      .map(([address, raw]) => ({ kind: 'edit', address, raw })),
  },
  { weight: 3, arbitrary: fc.constant({ kind: 'undo' }) },
  { weight: 1, arbitrary: fc.constantFrom(...MALFORMED) },
);

/** Lists of 0 to 40 actions, including malformed values. */
export const actionListArbitrary: fc.Arbitrary<unknown[]> = fc.array(actionArb, {
  minLength: 0,
  maxLength: 40,
});

// ---------------------------------------------------------------------------
// stateDifference (State_Equality)
// ---------------------------------------------------------------------------

/** The fields of a Run_State that State_Equality reads. Structural, so no game module is needed. */
export interface StateLike {
  readonly hero: unknown;
  readonly hp: unknown;
  readonly ink: unknown;
  readonly turn: unknown;
  readonly status: unknown;
  readonly rngState: unknown;
  readonly valuesHero: unknown;
  readonly valuesRngState: unknown;
  readonly edits: unknown;
  readonly monsters: unknown;
  readonly level?: unknown;
  readonly undoSnapshot?: unknown;
}

/** Reads `[cellRawText, cellValue]` of one address from a state (wired to the read API by callers). */
export type CellReader = (state: StateLike, address: string) => readonly [unknown, unknown];

export interface StateDifferenceOptions {
  /** Skip the Undo_Snapshot (Property 2). */
  readonly ignoreSnapshot?: boolean;
  /** Compares `[raw, value]` of all 240 cells. Without a reader the cells are not compared. */
  readonly readCell?: CellReader;
}

const SCALAR_FIELDS = [
  'hero',
  'hp',
  'ink',
  'turn',
  'status',
  'rngState',
  'valuesHero',
  'valuesRngState',
] as const;

function same(x: unknown, y: unknown): boolean {
  if (Object.is(x, y)) return true;
  if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
  return JSON.stringify(x) === JSON.stringify(y);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * State_Equality. Returns `undefined` when `a` and `b` are equal, otherwise the name of the first
 * field that differs (`undoSnapshot.<field>` inside a snapshot).
 */
export function stateDifference(
  a: StateLike,
  b: StateLike,
  options: StateDifferenceOptions = {},
): string | undefined {
  return compare(a, b, options, '');
}

function compare(
  a: StateLike,
  b: StateLike,
  options: StateDifferenceOptions,
  prefix: string,
): string | undefined {
  for (const field of SCALAR_FIELDS) {
    if (!Object.is(a[field], b[field])) return prefix + field;
  }
  if (!same(a.edits, b.edits)) return `${prefix}edits`;
  if (!same(a.monsters, b.monsters)) return `${prefix}monsters`;
  if (prefix === '') {
    if (a.level !== b.level) return 'level';
    const read = options.readCell;
    if (read !== undefined) {
      for (const address of ALL_ADDRESSES) {
        if (JSON.stringify(read(a, address)) !== JSON.stringify(read(b, address))) {
          return `cell ${address}`;
        }
      }
    }
    if (options.ignoreSnapshot === true) return undefined;
    const sa = a.undoSnapshot ?? null;
    const sb = b.undoSnapshot ?? null;
    if (sa === null || sb === null) return sa === sb ? undefined : 'undoSnapshot';
    if (!isObject(sa) || !isObject(sb)) return 'undoSnapshot';
    const inner = compare(sa as unknown as StateLike, sb as unknown as StateLike, options, 'undoSnapshot.');
    return inner;
  }
  return undefined;
}
