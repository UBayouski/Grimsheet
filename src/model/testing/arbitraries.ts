/**
 * Single owner of every fast-check generator used by the sheet-model tests.
 * Test support only: not exported from `src/model/index.ts`.
 * All randomness here comes from fast-check or from the seeded `seededRandom` source below.
 * This file never imports `serializer.ts`: `normalizeOracle` is a separate implementation.
 */
import * as fc from 'fast-check';
import { printFormula } from '../../engine/index';
import { validAstArbitrary } from '../../engine/testing/arbitraries';
import type { LevelDocument, RandomSource } from '../types';

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

/** Deterministic Fisher-Yates shuffle driven by an integer seed. Returns a new array. */
export function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
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
// Authored document shapes
// ---------------------------------------------------------------------------

export interface AuthoredCell {
  address: string;
  raw: string;
  locked?: boolean;
  name?: string;
}

export interface AuthoredMonster {
  id: string;
  at: string;
  move: string;
  atk: string;
}

/** A Level_Document as an author may write it: lower case allowed, `locked: false` allowed. */
export interface AuthoredDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  hint: string;
  startingHp: number;
  ink: number;
  seed: number;
  hero: { at: string };
  monsters: AuthoredMonster[];
  map: string[];
  cells: AuthoredCell[];
}

/** Read-only view accepted by the oracle: both authored and normalized documents fit it. */
export interface DocumentLike {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly startingHp: number;
  readonly ink: number;
  readonly seed: number;
  readonly hero: { readonly at: string };
  readonly monsters: readonly {
    readonly id: string;
    readonly at: string;
    readonly move: string;
    readonly atk: string;
  }[];
  readonly map: readonly string[];
  readonly cells: readonly {
    readonly address: string;
    readonly raw: string;
    readonly locked?: boolean;
    readonly name?: string;
  }[];
}

const COLUMN_LETTERS = 'ABCDEFGHIJKL';
const TERRAIN = '#.X^';
const SLOT_COUNT = 42; // rows 14-20, six (label, rule) column pairs per row

/** Address text for a 0-based reading-order index (0 to 239). */
function addressOf(index: number, lower = false): string {
  const letter = COLUMN_LETTERS.charAt(index % 12);
  return `${lower ? letter.toLowerCase() : letter}${Math.floor(index / 12) + 1}`;
}

/** Reading-order index of an address in A1..L20 (either case), or -1. */
function indexOfAddress(address: string): number {
  const col = COLUMN_LETTERS.indexOf(address.charAt(0).toUpperCase());
  const row = Number(address.slice(1));
  if (col < 0 || !Number.isInteger(row) || row < 1 || row > 20) return -1;
  return (row - 1) * 12 + col;
}

// ---------------------------------------------------------------------------
// Valid documents
// ---------------------------------------------------------------------------

type LockedChoice = 'true' | 'false' | 'absent';
type SpecKind = 'restate' | 'override-glyph' | 'override-block' | 'formula' | 'literal' | 'blank';

interface SpecPlan {
  readonly index: number;
  readonly kind: SpecKind;
  readonly formula: string;
  readonly literal: string;
  readonly glyph: string;
  readonly block: string;
  readonly locked: LockedChoice;
  readonly named: boolean;
  readonly lowerName: boolean;
  readonly lowerAddress: boolean;
}

interface RulePlan {
  readonly slot: number;
  readonly raw: string;
  readonly label: string;
  readonly locked: LockedChoice;
  readonly lowerAddress: boolean;
}

interface MonsterRefPlan {
  readonly move: number;
  readonly atk: number;
  readonly lowerMove: boolean;
  readonly lowerAtk: boolean;
}

interface ValidPlan {
  readonly idNumber: number;
  readonly slug: string;
  readonly title: string;
  readonly hint: string;
  readonly startingHp: number;
  readonly ink: number;
  readonly seed: number;
  readonly glyphs: readonly string[];
  readonly heroIndex: number;
  readonly heroGlyph: string;
  readonly heroRaw: string;
  readonly monsterIndexes: readonly number[];
  readonly monsterRefs: readonly MonsterRefPlan[];
  readonly rules: readonly RulePlan[];
  readonly specs: readonly SpecPlan[];
  readonly shuffleSeed: number;
}

const glyphArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constant('.') },
  { weight: 2, arbitrary: fc.constant('#') },
  { weight: 1, arbitrary: fc.constant('X') },
  { weight: 1, arbitrary: fc.constant('^') },
);

const formulaTextArb: fc.Arbitrary<string> = validAstArbitrary.map((ast) => {
  const printed = printFormula(ast);
  return printed.ok && printed.text.length <= 500 ? printed.text : '=1+1';
});

const LITERALS = [
  'hello',
  'say "hi"',
  'é日😀',
  '42',
  '-3.5',
  'TRUE',
  'x y',
  "it's",
  'a,b;c',
  '0',
  '"quoted"',
  'ÄÖÜ ß',
];
const BLOCKS = ['=1/0', 'zz', '=NOSUCH(1)', '=A0', '', '7', '=M30'];
const RULE_RAWS = ['="E"', '=TOWARD(HERO)', '=IF(DIST(SELF, HERO) < 3, TOWARD(HERO), "-")', '1', '2', 'wait'];
const LABELS = ['Move rule', 'Attack rule', 'Trap damage', 'Door', 'Speed', 'Key', 'Ghost', 'Lich'];
const TITLES = ['The Corridor', 'The Chaser', 'The Locked Crypt', 'The Trap Row', 'The Lich', 'Café 日本'];
const HINTS = [
  'Walk to the exit.',
  'Edit the formula, not the monster.',
  'A "quoted" hint with Unicode é日.',
  'Ink is short.',
];
const SLUGS = ['the-corridor', 'x', 'a-b-c', 'level2', 'the-trap-row'];

const lockedArb: fc.Arbitrary<LockedChoice> = fc.constantFrom('true', 'false', 'absent');

const specPlanArb: fc.Arbitrary<SpecPlan> = fc.record({
  index: fc.integer({ min: 0, max: 239 }),
  kind: fc.constantFrom<SpecKind>(
    'restate',
    'override-glyph',
    'override-block',
    'formula',
    'literal',
    'blank',
  ),
  formula: formulaTextArb,
  literal: fc.constantFrom(...LITERALS),
  glyph: fc.constantFrom('#', '.', 'X', '^'),
  block: fc.constantFrom(...BLOCKS),
  locked: lockedArb,
  named: fc.boolean(),
  lowerName: fc.boolean(),
  lowerAddress: fc.boolean(),
});

const rulePlanArb: fc.Arbitrary<RulePlan> = fc.record({
  slot: fc.integer({ min: 0, max: SLOT_COUNT - 1 }),
  raw: fc.constantFrom(...RULE_RAWS),
  label: fc.constantFrom(...LABELS),
  locked: lockedArb,
  lowerAddress: fc.boolean(),
});

const monsterRefArb: fc.Arbitrary<MonsterRefPlan> = fc.record({
  move: fc.nat(1000),
  atk: fc.nat(1000),
  lowerMove: fc.boolean(),
  lowerAtk: fc.boolean(),
});

const validPlanArb: fc.Arbitrary<ValidPlan> = fc.record({
  idNumber: fc.integer({ min: 1, max: 99 }),
  slug: fc.constantFrom(...SLUGS),
  title: fc.constantFrom(...TITLES),
  hint: fc.constantFrom(...HINTS),
  startingHp: fc.integer({ min: 1, max: 99 }),
  ink: fc.integer({ min: 0, max: 30 }),
  seed: fc.integer({ min: 0, max: 4294967295 }),
  glyphs: fc.array(glyphArb, { minLength: 144, maxLength: 144 }),
  heroIndex: fc.integer({ min: 0, max: 143 }),
  heroGlyph: fc.constantFrom('.', 'X', '^'),
  heroRaw: fc.constantFrom('.', 'X', '^'),
  monsterIndexes: fc.uniqueArray(fc.integer({ min: 0, max: 143 }), { maxLength: 16 }),
  monsterRefs: fc.array(monsterRefArb, { minLength: 16, maxLength: 16 }),
  rules: fc.uniqueArray(rulePlanArb, {
    minLength: 1,
    maxLength: 10,
    selector: (rule) => rule.slot,
  }),
  specs: fc.uniqueArray(specPlanArb, {
    minLength: 0,
    maxLength: 240,
    selector: (spec) => spec.index,
  }),
  shuffleSeed: fc.integer({ min: 0, max: 4294967295 }),
});

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function lockedFields(choice: LockedChoice): { locked?: boolean } {
  if (choice === 'true') return { locked: true };
  if (choice === 'false') return { locked: false };
  return {};
}

function buildValidDocument(plan: ValidPlan): AuthoredDocument {
  const glyphs = [...plan.glyphs];
  const heroIndex = plan.heroIndex;
  const monsterIndexes = plan.monsterIndexes.filter((i) => i !== heroIndex);
  for (const i of monsterIndexes) glyphs[i] = '.';
  glyphs[heroIndex] = plan.heroGlyph;
  const monsterSet = new Set(monsterIndexes);

  // Rules panel: label in the left column, named rule cell to its right.
  const cells: AuthoredCell[] = [];
  const reserved = new Set<number>();
  plan.rules.forEach((rule, n) => {
    const row = 14 + Math.floor(rule.slot / 6);
    const labelIndex = (row - 1) * 12 + (rule.slot % 6) * 2;
    const ruleIndex = labelIndex + 1;
    reserved.add(labelIndex);
    reserved.add(ruleIndex);
    cells.push({ address: addressOf(labelIndex, rule.lowerAddress), raw: rule.label });
    cells.push({
      address: addressOf(ruleIndex, rule.lowerAddress),
      raw: rule.raw,
      ...lockedFields(rule.locked),
      name: `RULE_${n}`,
    });
  });

  // Generic specs.
  for (const spec of plan.specs) {
    const row = Math.floor(spec.index / 12) + 1;
    if (row === 13 || reserved.has(spec.index)) continue;
    const inMap = row <= 12;
    let raw: string;
    if (spec.index === heroIndex && inMap) {
      raw = plan.heroRaw;
    } else if (monsterSet.has(spec.index)) {
      raw = '.';
    } else if (inMap) {
      switch (spec.kind) {
        case 'restate':
          raw = glyphs[spec.index] as string;
          break;
        case 'override-glyph':
          raw = spec.glyph;
          break;
        case 'override-block':
          raw = spec.block;
          break;
        case 'formula':
          raw = spec.formula;
          break;
        case 'literal':
          raw = spec.literal;
          break;
        case 'blank':
          raw = '';
          break;
      }
    } else {
      raw = spec.kind === 'formula' ? spec.formula : spec.kind === 'literal' ? spec.literal : '';
    }
    const cell: AuthoredCell = { address: addressOf(spec.index, spec.lowerAddress), raw };
    Object.assign(cell, lockedFields(spec.locked));
    // Extra names go only in the Map_Area, where a name needs no label (Requirement 5.13).
    // A named Rules_Panel cell needs a text label on its left (5.11, 5.12), so those come only
    // from the labelled rule slots above.
    if (spec.named && inMap) {
      const name = `N_${spec.index}`;
      cell.name = spec.lowerName ? name.toLowerCase() : name;
    }
    cells.push(cell);
  }

  const monsters: AuthoredMonster[] = monsterIndexes.map((index, i) => {
    const ref = plan.monsterRefs[i] as MonsterRefPlan;
    const move = `RULE_${ref.move % plan.rules.length}`;
    const atk = `RULE_${ref.atk % plan.rules.length}`;
    return {
      id: `M${i + 1}`,
      at: addressOf(index),
      move: ref.lowerMove ? move.toLowerCase() : move,
      atk: ref.lowerAtk ? atk.toLowerCase() : atk,
    };
  });

  const map: string[] = [];
  for (let r = 0; r < 12; r++) map.push(glyphs.slice(r * 12, r * 12 + 12).join(''));

  return {
    schemaVersion: 1,
    id: `${pad2(plan.idNumber)}-${plan.slug}`,
    title: plan.title,
    hint: plan.hint,
    startingHp: plan.startingHp,
    ink: plan.ink,
    seed: plan.seed,
    hero: { at: addressOf(heroIndex) },
    monsters,
    map,
    cells: deterministicShuffle(cells, plan.shuffleSeed),
  };
}

/** Valid documents that the loader must accept (Property 1 to 3 and 7). */
export const validDocumentArbitrary: fc.Arbitrary<AuthoredDocument> =
  validPlanArb.map(buildValidDocument);

// ---------------------------------------------------------------------------
// Invalid documents (exactly one fault each)
// ---------------------------------------------------------------------------

export type FaultKind =
  | 'hero-wall'
  | 'hero-error'
  | 'monster-wall'
  | 'monster-exit'
  | 'monster-trap'
  | 'monster-error'
  | 'bad-glyph'
  | 'duplicate-name'
  | 'unknown-rule'
  | 'rule-outside-panel'
  | 'missing-label'
  | 'label-number-literal'
  | 'label-number-formula';

export const FAULT_KINDS: readonly FaultKind[] = [
  'hero-wall',
  'hero-error',
  'monster-wall',
  'monster-exit',
  'monster-trap',
  'monster-error',
  'bad-glyph',
  'duplicate-name',
  'unknown-rule',
  'rule-outside-panel',
  'missing-label',
  'label-number-literal',
  'label-number-formula',
];

export interface InvalidCase {
  readonly fault: FaultKind;
  /** The valid document the fault was applied to. */
  readonly base: AuthoredDocument;
  readonly doc: AuthoredDocument;
}

function entityIndexes(doc: AuthoredDocument): Set<number> {
  const out = new Set<number>([indexOfAddress(doc.hero.at)]);
  for (const m of doc.monsters) out.add(indexOfAddress(m.at));
  return out;
}

function freeMapIndex(pick: number, avoid: ReadonlySet<number>): number {
  for (let step = 0; step < 144; step++) {
    const index = (pick + step) % 144;
    if (!avoid.has(index)) return index;
  }
  return pick % 144;
}

function removeCellsAt(doc: AuthoredDocument, index: number): void {
  doc.cells = doc.cells.filter((c) => indexOfAddress(c.address) !== index);
}

function setGlyph(doc: AuthoredDocument, index: number, glyph: string): void {
  removeCellsAt(doc, index);
  const r = Math.floor(index / 12);
  const c = index % 12;
  const row = doc.map[r] as string;
  doc.map[r] = row.slice(0, c) + glyph + row.slice(c + 1);
}

function setRaw(doc: AuthoredDocument, index: number, raw: string, name?: string): void {
  removeCellsAt(doc, index);
  const cell: AuthoredCell = { address: addressOf(index), raw };
  if (name !== undefined) cell.name = name;
  doc.cells.push(cell);
}

function firstRuleName(doc: AuthoredDocument): string {
  const found = doc.cells.find((c) => c.name !== undefined && /^rule_\d+$/i.test(c.name));
  return (found?.name ?? 'RULE_0').toUpperCase();
}

/** Adds a monster on a free cell (replacing the last one when 16 exist) and returns it. */
function addMonster(doc: AuthoredDocument, pick: number): { monster: AuthoredMonster; index: number } {
  if (doc.monsters.length >= 16) doc.monsters.pop();
  const index = freeMapIndex(pick, entityIndexes(doc));
  const rule = firstRuleName(doc);
  const monster: AuthoredMonster = { id: 'M99', at: addressOf(index), move: rule, atk: rule };
  doc.monsters.push(monster);
  return { monster, index };
}

function freeSlotIndexes(doc: AuthoredDocument, pick: number): { label: number; rule: number } {
  const used = new Set<number>();
  for (const c of doc.cells) {
    if (c.name !== undefined && /^rule_\d+$/i.test(c.name)) used.add(indexOfAddress(c.address));
  }
  for (let step = 0; step < SLOT_COUNT; step++) {
    const slot = (pick + step) % SLOT_COUNT;
    const row = 14 + Math.floor(slot / 6);
    const label = (row - 1) * 12 + (slot % 6) * 2;
    if (!used.has(label + 1)) return { label, rule: label + 1 };
  }
  return { label: 13 * 12, rule: 13 * 12 + 1 };
}

function applyFault(base: AuthoredDocument, fault: FaultKind, pick: number): AuthoredDocument {
  const doc = structuredClone(base);
  switch (fault) {
    case 'hero-wall':
    case 'hero-error': {
      const monsterCells = new Set(doc.monsters.map((m) => indexOfAddress(m.at)));
      const index = freeMapIndex(pick, monsterCells);
      if (fault === 'hero-wall') setGlyph(doc, index, '#');
      else setRaw(doc, index, '=1/0');
      doc.hero.at = addressOf(index);
      break;
    }
    case 'monster-wall':
    case 'monster-exit':
    case 'monster-trap':
    case 'monster-error': {
      const { index } = addMonster(doc, pick);
      if (fault === 'monster-wall') setGlyph(doc, index, '#');
      else if (fault === 'monster-exit') setGlyph(doc, index, 'X');
      else if (fault === 'monster-trap') setGlyph(doc, index, '^');
      else setRaw(doc, index, '=1/0');
      break;
    }
    case 'bad-glyph': {
      const index = pick % 144;
      const r = Math.floor(index / 12);
      const c = index % 12;
      const row = doc.map[r] as string;
      doc.map[r] = row.slice(0, c) + 'Q' + row.slice(c + 1);
      break;
    }
    case 'duplicate-name': {
      const avoid = entityIndexes(doc);
      const first = freeMapIndex(pick, avoid);
      avoid.add(first);
      const second = freeMapIndex(pick + 1, avoid);
      setRaw(doc, first, '1', 'DUPE');
      setRaw(doc, second, '1', 'dupe');
      break;
    }
    case 'unknown-rule': {
      const { monster } = addMonster(doc, pick);
      monster.move = 'NO_SUCH_RULE';
      break;
    }
    case 'rule-outside-panel': {
      const { monster } = addMonster(doc, pick);
      const index = freeMapIndex(pick + 7, entityIndexes(doc));
      setRaw(doc, index, '1', 'OUTSIDE_RULE');
      monster.atk = 'OUTSIDE_RULE';
      break;
    }
    case 'missing-label':
    case 'label-number-literal':
    case 'label-number-formula': {
      const slot = freeSlotIndexes(doc, pick);
      removeCellsAt(doc, slot.label);
      removeCellsAt(doc, slot.rule);
      if (fault === 'label-number-literal') {
        doc.cells.push({ address: addressOf(slot.label), raw: '5' });
      } else if (fault === 'label-number-formula') {
        doc.cells.push({ address: addressOf(slot.label), raw: '=2+3' });
      }
      doc.cells.push({ address: addressOf(slot.rule), raw: '="N"', name: 'FAULTY_RULE' });
      break;
    }
  }
  return doc;
}

/** A valid document plus one targeted fault (Property 8). */
export const invalidDocumentArbitrary: fc.Arbitrary<InvalidCase> = fc
  .record({
    base: validDocumentArbitrary,
    fault: fc.constantFrom(...FAULT_KINDS),
    pick: fc.nat(100000),
  })
  .map(({ base, fault, pick }): InvalidCase => ({
    fault,
    base,
    doc: applyFault(base, fault, pick),
  }));

// ---------------------------------------------------------------------------
// Mutated documents (Property 4)
// ---------------------------------------------------------------------------

export type MutationKind =
  | 'remove-field'
  | 'retype'
  | 'replace-value'
  | 'add-unknown-field'
  | 'change-address'
  | 'change-map-char';

export const MUTATION_KINDS: readonly MutationKind[] = [
  'remove-field',
  'retype',
  'replace-value',
  'add-unknown-field',
  'change-address',
  'change-map-char',
];

const ROOT_FIELDS = [
  'schemaVersion',
  'id',
  'title',
  'hint',
  'startingHp',
  'ink',
  'seed',
  'hero',
  'monsters',
  'map',
  'cells',
];

const RETYPE_VALUES: readonly unknown[] = [
  null,
  0,
  -1,
  5.5,
  'text',
  '',
  true,
  false,
  [],
  {},
  [1, 2, 3],
  { at: 'A1' },
];

const REPLACEMENTS: readonly (readonly [string, unknown])[] = [
  ['schemaVersion', 2],
  ['id', 'BAD ID'],
  ['title', ''],
  ['hint', 'two\nlines'],
  ['startingHp', 0],
  ['ink', -1],
  ['seed', 4294967296],
  ['seed', -5],
];

const BAD_ADDRESSES = ['Z99', 'A13', '', 'M1', 'A0', 'a1x', 'B21', '1A'];
const BAD_CHARS = ['Q', '', ' ', 'é', '@'];

function mutate(base: AuthoredDocument, kind: MutationKind, pick: number, pick2: number): unknown {
  const doc = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  const clone = (v: unknown): unknown => structuredClone(v);
  switch (kind) {
    case 'remove-field': {
      delete doc[ROOT_FIELDS[pick % ROOT_FIELDS.length] as string];
      break;
    }
    case 'retype': {
      doc[ROOT_FIELDS[pick % ROOT_FIELDS.length] as string] = clone(
        RETYPE_VALUES[pick2 % RETYPE_VALUES.length],
      );
      break;
    }
    case 'replace-value': {
      const [key, value] = REPLACEMENTS[pick % REPLACEMENTS.length] as readonly [string, unknown];
      doc[key] = value;
      break;
    }
    case 'add-unknown-field': {
      const targets: Record<string, unknown>[] = [doc, doc['hero'] as Record<string, unknown>];
      const cells = doc['cells'] as Record<string, unknown>[];
      const monsters = doc['monsters'] as Record<string, unknown>[];
      if (cells[0] !== undefined) targets.push(cells[0]);
      if (monsters[0] !== undefined) targets.push(monsters[0]);
      const target = targets[pick % targets.length] as Record<string, unknown>;
      target['lokced'] = true;
      break;
    }
    case 'change-address': {
      const bad = BAD_ADDRESSES[pick2 % BAD_ADDRESSES.length] as string;
      const cells = doc['cells'] as Record<string, unknown>[];
      const monsters = doc['monsters'] as Record<string, unknown>[];
      const choices: (() => void)[] = [() => ((doc['hero'] as Record<string, unknown>)['at'] = bad)];
      if (cells.length > 0) {
        const cell = cells[pick % cells.length] as Record<string, unknown>;
        choices.push(() => (cell['address'] = bad));
      }
      if (monsters.length > 0) {
        const monster = monsters[pick % monsters.length] as Record<string, unknown>;
        choices.push(() => (monster['at'] = bad));
      }
      (choices[pick2 % choices.length] as () => void)();
      break;
    }
    case 'change-map-char': {
      const map = doc['map'] as string[];
      const r = pick % map.length;
      const row = map[r] as string;
      const c = pick2 % Math.max(row.length, 1);
      map[r] = row.slice(0, c) + (BAD_CHARS[(pick + pick2) % BAD_CHARS.length] as string) + row.slice(c + 1);
      break;
    }
  }
  return doc;
}

/** A valid document with one random mutation. Returned as `unknown`, like loader input. */
export const mutatedDocumentArbitrary: fc.Arbitrary<unknown> = fc
  .record({
    base: validDocumentArbitrary,
    kind: fc.constantFrom(...MUTATION_KINDS),
    pick: fc.nat(100000),
    pick2: fc.nat(100000),
  })
  .map(({ base, kind, pick, pick2 }) => mutate(base, kind, pick, pick2));

// ---------------------------------------------------------------------------
// JSON values, strings, deep nesting (Property 4 to 6)
// ---------------------------------------------------------------------------

/** Any JSON-compatible value. */
export const jsonValueArbitrary: fc.Arbitrary<unknown> = fc.jsonValue({ maxDepth: 6 });

const REPEAT_CHARS = ['{', '[', 'x', ' ', '"', '9', '\\', '\u0000'];

/** Arbitrary strings, JSON-like strings and repeated-character strings of up to 300,000 characters. */
export const anyStringArbitrary: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.string({ unit: 'binary', maxLength: 2000 }) },
  { weight: 3, arbitrary: fc.jsonValue({ maxDepth: 5 }).map((v) => JSON.stringify(v)) },
  { weight: 2, arbitrary: mutatedDocumentArbitrary.map((v) => JSON.stringify(v)) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.constantFrom(...REPEAT_CHARS), fc.integer({ min: 0, max: 300000 }))
      .map(([ch, n]) => ch.repeat(n)),
  },
);

export interface DeepNesting {
  readonly form: 'array' | 'object';
  /** Number of nested containers, root included. The root is always a plain object. */
  readonly depth: number;
  readonly value: unknown;
  readonly text: string;
}

/** Builds a value nested `depth` containers deep (root object, then `form` containers), iteratively. */
export function buildDeepNesting(form: 'array' | 'object', depth: number): DeepNesting {
  let value: unknown = form === 'array' ? [] : {};
  for (let i = 2; i < depth; i++) value = form === 'array' ? [value] : { k: value };
  value = { k: value };
  const open = form === 'array' ? '[' : '{"k":';
  const close = form === 'array' ? ']' : '}';
  const inner = form === 'array' ? '[]' : '{}';
  const text = `{"k":${open.repeat(Math.max(depth - 2, 0))}${inner}${close.repeat(Math.max(depth - 2, 0))}}`;
  return { form, depth, value, text };
}

/** Measures container nesting depth with an explicit stack (no recursion). */
export function measureDepth(value: unknown): number {
  let max = 0;
  const stack: { v: unknown; d: number }[] = [{ v: value, d: 1 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop() as { v: unknown; d: number };
    if (typeof v !== 'object' || v === null) continue;
    if (d > max) max = d;
    const children = Array.isArray(v) ? v : Object.values(v);
    for (const child of children) stack.push({ v: child, d: d + 1 });
  }
  return max;
}

/** Arrays and objects nested 101 to 5,000 levels deep, as a value and as JSON text. */
export const deepNestingArbitrary: fc.Arbitrary<DeepNesting> = fc
  .tuple(fc.constantFrom<'array' | 'object'>('array', 'object'), fc.integer({ min: 101, max: 5000 }))
  .map(([form, depth]) => buildDeepNesting(form, depth));

// ---------------------------------------------------------------------------
// Independent normalization oracle
// ---------------------------------------------------------------------------

interface OracleEntry {
  readonly row: number;
  readonly col: number;
  readonly address: string;
  readonly raw: string;
  readonly locked: boolean;
  readonly name: string | undefined;
}

/**
 * Normalizes a document by its own rules, written without `serializer.ts`: specs go into a `Map`
 * keyed by upper-case address, the map is rebuilt from effective text, redundant specs are dropped,
 * the rest are sorted by (row, column) and the output is built key by key.
 */
export function normalizeOracle(doc: DocumentLike): LevelDocument {
  const specs = new Map<string, { raw: string; locked: boolean; name: string | undefined }>();
  for (const cell of doc.cells) {
    specs.set(cell.address.toUpperCase(), {
      raw: cell.raw,
      locked: cell.locked === true,
      name: cell.name === undefined ? undefined : cell.name.toUpperCase(),
    });
  }

  const glyphAt = new Map<string, string>();
  const rows: string[] = [];
  for (let row = 1; row <= 12; row++) {
    let line = '';
    for (let col = 1; col <= 12; col++) {
      const key = `${COLUMN_LETTERS.charAt(col - 1)}${row}`;
      const spec = specs.get(key);
      const effective = spec !== undefined ? spec.raw : (doc.map[row - 1] ?? '').charAt(col - 1);
      const glyph = effective.length === 1 && TERRAIN.includes(effective) ? effective : '.';
      glyphAt.set(key, glyph);
      line += glyph;
    }
    rows.push(line);
  }

  const kept: OracleEntry[] = [];
  for (const [address, spec] of specs) {
    const col = COLUMN_LETTERS.indexOf(address.charAt(0)) + 1;
    const row = Number(address.slice(1));
    const reference = row <= 12 ? (glyphAt.get(address) ?? '.') : '';
    const removable = !spec.locked && spec.name === undefined && spec.raw === reference;
    if (removable) continue;
    kept.push({ row, col, address, raw: spec.raw, locked: spec.locked, name: spec.name });
  }
  kept.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));

  const cells = kept.map((entry) => {
    const out: { address: string; raw: string; locked?: true; name?: string } = {
      address: entry.address,
      raw: entry.raw,
    };
    if (entry.locked) out.locked = true;
    if (entry.name !== undefined) out.name = entry.name;
    return out;
  });

  const monsters = doc.monsters.map((m) => ({
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
    startingHp: doc.startingHp,
    ink: doc.ink,
    seed: doc.seed,
    hero: { at: doc.hero.at.toUpperCase() },
    monsters,
    map: rows,
    cells,
  };
}
