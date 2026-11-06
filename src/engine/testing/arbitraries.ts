/**
 * Single owner of every fast-check generator used by the engine tests.
 * Test support only: not exported from `src/engine/index.ts`.
 * All randomness here comes from fast-check or from the seeded `mulberry32` source below.
 */
import * as fc from 'fast-check';
import { formatAddress } from '../address';
import type { GridPoint } from '../address';
import type { BinaryOperator, CellNode, Node } from '../ast';
import { FUNCTION_NAMES } from '../names';

// ---------------------------------------------------------------------------
// Seeded Random_Source
// ---------------------------------------------------------------------------

export interface SeededSource {
  /** Returns a number in [0, 1). Counts every call. */
  readonly random: () => number;
  /** Number of calls made to `random` so far. */
  readonly calls: () => number;
}

/** mulberry32 seeded generator that counts its calls. */
export function mulberry32(seed: number): SeededSource {
  let state = seed >>> 0;
  let calls = 0;
  const random = (): number => {
    calls += 1;
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { random, calls: () => calls };
}

/** Deterministic Fisher-Yates shuffle driven by an integer seed. Returns a new array. */
export function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const source = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(source.random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
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
// Valid AST arbitrary (Property 1)
// ---------------------------------------------------------------------------

export const BINARY_OPERATORS: readonly BinaryOperator[] = [
  '+',
  '-',
  '*',
  '/',
  '&',
  '=',
  '<>',
  '<',
  '>',
  '<=',
  '>=',
];

const NUMBER_LEAVES: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, 1, 2, 42, 1e21, 5e-7, Number.MAX_SAFE_INTEGER, 0.1 + 0.2),
  fc.nat(1000),
  fc.double({ min: 0, max: 1e9, noNaN: true, noDefaultInfinity: true }).map((n) => (n === 0 ? 0 : n)),
);

const STRING_CHARS = [
  'a', 'b', 'Z', 'x', '0', '9', '"', '"', ' ', '=', ',', '(', ')', ':', '&', '$', 'é', 'ß', '日', '😀',
];

const stringLeaf: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...STRING_CHARS), { maxLength: 50 })
  .map((chars) => chars.join(''));

const ADDRESS_SHAPED = /^[A-Z][0-9]+$/;

/** Upper-case identifiers that are not TRUE, FALSE, a function name or Address-shaped. */
const plainName: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')),
    fc.array(fc.constantFrom(...'ABCXYZ_019'.split('')), { maxLength: 6 }),
  )
  .map(([head, rest]) => head + rest.join(''))
  .filter(
    (n) =>
      n !== 'TRUE' &&
      n !== 'FALSE' &&
      n !== 'HERO' &&
      n !== 'SELF' &&
      !FUNCTION_NAMES.includes(n) &&
      !ADDRESS_SHAPED.test(n),
  );

const nameLeaf: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom('HERO', 'SELF') },
  { weight: 3, arbitrary: plainName },
);

const cellArb: fc.Arbitrary<CellNode> = fc
  .record({ col: fc.integer({ min: 1, max: 26 }), row: fc.integer({ min: 0, max: 40 }) })
  .map(({ col, row }) => ({ kind: 'cell' as const, col, row }));

const CALL_NAMES: readonly string[] = [...FUNCTION_NAMES, 'FOO', 'NOSUCH', 'F_1'];

/** Valid ASTs: all node kinds, all 11 operators, nesting depth 0 to 8, Ranges only as call arguments. */
export const validAstArbitrary: fc.Arbitrary<Node> = fc.letrec<{ node: Node }>((tie) => {
  const leaf: fc.Arbitrary<Node> = fc.oneof(
    NUMBER_LEAVES.map((value): Node => ({ kind: 'number', value })),
    stringLeaf.map((value): Node => ({ kind: 'string', value })),
    fc.boolean().map((value): Node => ({ kind: 'boolean', value })),
    cellArb,
    nameLeaf.map((name): Node => ({ kind: 'name', name })),
  );
  const range: fc.Arbitrary<Node> = fc
    .tuple(cellArb, cellArb)
    .map(([from, to]): Node => ({ kind: 'range', from, to }));
  const node = tie('node');
  return {
    node: fc.oneof(
      { maxDepth: 8, depthIdentifier: 'formula-ast' },
      leaf,
      node.map((operand): Node => ({ kind: 'negate', operand })),
      fc
        .tuple(fc.constantFrom(...BINARY_OPERATORS), node, node)
        .map(([op, left, right]): Node => ({ kind: 'binary', op, left, right })),
      fc
        .tuple(
          fc.constantFrom(...CALL_NAMES),
          fc.array(fc.oneof({ weight: 3, arbitrary: node }, { weight: 1, arbitrary: range }), {
            maxLength: 4,
          }),
        )
        .map(([name, args]): Node => ({ kind: 'call', name, args })),
    ),
  };
}).node;

// ---------------------------------------------------------------------------
// Random Sheet definitions (Property 2)
// ---------------------------------------------------------------------------

export interface CellDefinition {
  readonly address: string;
  readonly rawText: string;
  readonly name?: string;
}

export interface EditStep {
  readonly address: string;
  readonly text: string;
  /** Recalculate (with its own fresh seeded source) after applying this step. */
  readonly recalculateAfter: boolean;
}

export interface SheetCase {
  readonly definitions: readonly CellDefinition[];
  readonly randomSeed: number;
  readonly hero: GridPoint;
  readonly permutationSeed: number;
  readonly editScript: readonly EditStep[];
}

export function addressOfIndex(index: number): string {
  return formatAddress({ col: (index % 12) + 1, row: Math.floor(index / 12) + 1 });
}

const ALL_ADDRESSES: readonly string[] = Array.from({ length: 240 }, (_, i) => addressOfIndex(i));

function cellTemplate(
  pool: readonly string[],
  self: string,
  position: number,
): fc.Arbitrary<string> {
  const poolRef = fc.constantFrom(...pool);
  const ref = fc.oneof(
    { weight: 8, arbitrary: poolRef },
    { weight: 1, arbitrary: fc.constantFrom('HERO', 'M30') },
  );
  const range = fc.tuple(poolRef, poolRef).map(([a, b]) => `${a}:${b}`);
  const nameRef = fc.integer({ min: 0, max: pool.length - 1 }).map((j) => `C_${j}`);
  return fc.oneof(
    fc.integer({ min: -50, max: 50 }).map(String),
    fc.constantFrom('hello', '', 'x y'),
    fc
      .tuple(ref, fc.constantFrom('+', '-', '*', '/', '&', '=', '<'), ref)
      .map(([a, op, b]) => `=${a} ${op} ${b}`),
    fc.tuple(fc.constantFrom('SUM', 'MIN', 'MAX'), range).map(([f, r]) => `=${f}(${r})`),
    nameRef.map((n) => `=${n} + 1`),
    ref.map((r) => `=RAND() * ${r}`),
    fc.constant('=RAND()'),
    fc.tuple(ref, ref, ref).map(([c, a, b]) => `=IF(${c} > 0, ${a}, ${b})`),
    fc.constantFrom(
      '=TOWARD(HERO)',
      '=IF(DIST(SELF, HERO) < 3, TOWARD(HERO), "-")',
      '=DIST(SELF, HERO)',
    ),
    ref.map((r) => `=TOWARD(${r})`),
    fc.constant(`=${self} + ${position}`),
    ref.map((r) => `=${r}`),
  );
}

const invalidOrPlainEditTexts = fc.constantFrom(
  '=1+',
  '=SUM(A1:A3+1)',
  '=)',
  '=A1:A3',
  '="open',
  '=$A$1',
  'plain text',
  '7',
  '',
);

const editStepArb: fc.Arbitrary<EditStep> = fc
  .record({
    index: fc.integer({ min: 0, max: 239 }),
    other: fc.tuple(fc.integer({ min: 0, max: 239 }), fc.integer({ min: 0, max: 239 })),
    text: fc.oneof(
      invalidOrPlainEditTexts,
      fc.constantFrom('=RAND()', '=TOWARD(HERO)'),
    ),
    useRefs: fc.boolean(),
    recalculateAfter: fc.boolean(),
  })
  .map(({ index, other, text, useRefs, recalculateAfter }): EditStep => ({
    address: addressOfIndex(index),
    text: useRefs ? `=${addressOfIndex(other[0])} + ${addressOfIndex(other[1])}` : text,
    recalculateAfter,
  }));

const heroArb: fc.Arbitrary<GridPoint> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ col: fc.integer({ min: 1, max: 12 }), row: fc.integer({ min: 1, max: 20 }) }) },
  { weight: 1, arbitrary: fc.record({ col: fc.integer({ min: -2, max: 30 }), row: fc.integer({ min: -2, max: 40 }) }) },
);

/** Definition list of 1 to 50 Cells with dense references, plus seeds, hero and an edit script. */
export const sheetCaseArbitrary: fc.Arbitrary<SheetCase> = fc
  .uniqueArray(fc.integer({ min: 0, max: 239 }), { minLength: 1, maxLength: 50 })
  .chain((indexes) => {
    const pool = indexes.map(addressOfIndex);
    const cells = indexes.map((_, position) =>
      fc.record({
        rawText: cellTemplate(pool, pool[position] as string, position),
        named: fc.boolean(),
      }),
    );
    return fc.record({
      definitions: fc.tuple(...cells).map((items) =>
        items.map(
          ({ rawText, named }, position): CellDefinition =>
            named
              ? { address: pool[position] as string, rawText, name: `C_${position}` }
              : { address: pool[position] as string, rawText },
        ),
      ),
      randomSeed: fc.integer({ min: 0, max: 0xffffffff }),
      hero: heroArb,
      permutationSeed: fc.integer({ min: 0, max: 0xffffffff }),
      editScript: fc.array(editStepArb, { maxLength: 12 }),
    });
  });

// ---------------------------------------------------------------------------
// Evaluation_Context (Property 3)
// ---------------------------------------------------------------------------

export type HeroSpec = GridPoint | 'missing' | 'nan' | 'fraction' | 'non-object';
export type RandomKind = 'seeded' | 'missing' | 'throws' | 'nan' | 'two' | 'string';

export interface ContextSpec {
  readonly hero: HeroSpec;
  readonly self: GridPoint | 'absent';
  readonly random: RandomKind;
  readonly seed: number;
}

/** True when `buildContext(spec)` is a context the engine must accept. */
export function isValidContextSpec(spec: ContextSpec): boolean {
  return typeof spec.hero === 'object' && spec.random !== 'missing';
}

/** Turns a spec into the (possibly invalid) value handed to the engine. */
export function buildContext(spec: ContextSpec): unknown {
  if (spec.hero === 'non-object') return 5;
  const context: Record<string, unknown> = {};
  if (spec.hero === 'nan') context['heroAddress'] = { col: Number.NaN, row: 1 };
  else if (spec.hero === 'fraction') context['heroAddress'] = { col: 1.5, row: 2 };
  else if (spec.hero !== 'missing') context['heroAddress'] = spec.hero;
  if (spec.self !== 'absent') context['selfAddress'] = spec.self;
  switch (spec.random) {
    case 'seeded':
      context['random'] = mulberry32(spec.seed).random;
      break;
    case 'throws':
      context['random'] = (): number => {
        throw new Error('random source failure');
      };
      break;
    case 'nan':
      context['random'] = (): number => Number.NaN;
      break;
    case 'two':
      context['random'] = (): number => 2;
      break;
    case 'string':
      context['random'] = (): unknown => 'x';
      break;
    case 'missing':
      break;
  }
  return context;
}

const pointArb: fc.Arbitrary<GridPoint> = fc.record({
  col: fc.integer({ min: -3, max: 30 }),
  row: fc.integer({ min: -3, max: 45 }),
});

/** Valid and invalid context specs, including misbehaving `random` functions. */
export const contextSpecArbitrary: fc.Arbitrary<ContextSpec> = fc.record({
  hero: fc.oneof(
    { weight: 6, arbitrary: pointArb },
    { weight: 1, arbitrary: fc.constantFrom<HeroSpec>('missing', 'nan', 'fraction', 'non-object') },
  ),
  self: fc.oneof(
    { weight: 2, arbitrary: pointArb },
    { weight: 2, arbitrary: fc.constant<'absent'>('absent') },
  ),
  random: fc.oneof(
    { weight: 5, arbitrary: fc.constant<RandomKind>('seeded') },
    { weight: 1, arbitrary: fc.constantFrom<RandomKind>('missing', 'throws', 'nan', 'two', 'string') },
  ),
  seed: fc.integer({ min: 0, max: 0xffffffff }),
});

// ---------------------------------------------------------------------------
// Totality scenarios (Property 3)
// ---------------------------------------------------------------------------

export type ChainKind =
  | 'ref-chain-forward'
  | 'ref-chain-reverse'
  | 'whole-sheet-sum'
  | 'self-reference'
  | 'long-cycle'
  | 'long-range-formulas';

export type TotalityScenario =
  | { readonly tag: 'text'; readonly text: string }
  | {
      readonly tag: 'sheet';
      readonly definitions: readonly CellDefinition[];
      readonly context: ContextSpec;
    }
  | { readonly tag: 'chain'; readonly kind: ChainKind };

const FORMULA_TOKENS = [
  '1', '2.5', '"a"', '""', 'A1', 'M30', 'A0', '$A$1', '(', ')', ',', ':', '+', '-', '*', '/', '&',
  '=', '<>', '<=', 'SUM', 'IF', 'FOO', 'NOSUCH', 'HERO', 'SELF', 'TRUE', ' ', '.', '"',
];

const FIXED_BAD_FORMULAS = [
  '=M30',
  '=A0',
  '=Z99',
  '=A21',
  '=SUM(A1:M30)',
  '=NOSUCH',
  '=NOSUCH(1)',
  '=FOO(1, 2)',
  '=1/0',
  '=SELF',
  '=TOWARD(SELF)',
];

type NestingForm = 'paren' | 'minus' | 'call' | 'chain';

/** Deeply nested formula text, up to 100,000 levels. */
export function nestedFormula(form: NestingForm, depth: number): string {
  switch (form) {
    case 'paren':
      return `=${'('.repeat(depth)}1${')'.repeat(depth)}`;
    case 'minus':
      return `=${'-'.repeat(depth)}1`;
    case 'call':
      return `=${'ABS('.repeat(depth)}1${')'.repeat(depth)}`;
    case 'chain':
      return `=1${'+1'.repeat(depth)}`;
  }
}

const textArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.string({ unit: 'binary', maxLength: 10_000 }) },
  {
    weight: 3,
    arbitrary: fc
      .array(fc.constantFrom(...FORMULA_TOKENS), { maxLength: 60 })
      .map((tokens) => `=${tokens.join('')}`),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(
        fc.constantFrom<NestingForm>('paren', 'minus', 'call', 'chain'),
        fc.oneof(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 100_000 })),
      )
      .map(([form, depth]) => nestedFormula(form, depth)),
  },
  { weight: 1, arbitrary: fc.constantFrom(...FIXED_BAD_FORMULAS) },
);

/** Definitions for a `chain` scenario. */
export function chainDefinitions(kind: ChainKind): CellDefinition[] {
  const forward = ALL_ADDRESSES.map((address, i): CellDefinition => ({
    address,
    rawText: i === 0 ? '1' : `=${ALL_ADDRESSES[i - 1]} + 1`,
  }));
  switch (kind) {
    case 'ref-chain-forward':
      return forward;
    case 'ref-chain-reverse':
      return [...forward].reverse();
    case 'whole-sheet-sum':
      return [
        { address: 'A1', rawText: '=SUM(A2:L20)' },
        ...ALL_ADDRESSES.slice(1).map((address): CellDefinition => ({ address, rawText: '1' })),
      ];
    case 'self-reference':
      return [{ address: 'A1', rawText: '=A1 + 1' }];
    case 'long-cycle':
      return ALL_ADDRESSES.map((address, i): CellDefinition => ({
        address,
        rawText: `=${ALL_ADDRESSES[(i + 1) % 240]} + 1`,
      }));
    case 'long-range-formulas': {
      const args = Array.from({ length: Math.floor(9_990 / 7) }, () => 'A1:C4').join(', ');
      const rawText = `=SUM(${args})`;
      return ALL_ADDRESSES.map((address): CellDefinition => ({ address, rawText }));
    }
  }
}

export const totalityScenarioArbitrary: fc.Arbitrary<TotalityScenario> = fc.oneof(
  textArb.map((text): TotalityScenario => ({ tag: 'text', text })),
  fc
    .tuple(sheetCaseArbitrary, contextSpecArbitrary)
    .map(([sheet, context]): TotalityScenario => ({
      tag: 'sheet',
      definitions: sheet.definitions,
      context,
    })),
  fc
    .constantFrom<ChainKind>(
      'ref-chain-forward',
      'ref-chain-reverse',
      'whole-sheet-sum',
      'self-reference',
      'long-cycle',
      'long-range-formulas',
    )
    .map((kind): TotalityScenario => ({ tag: 'chain', kind })),
);
