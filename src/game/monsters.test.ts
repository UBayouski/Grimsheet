import { describe, expect, it } from 'vitest';
import { createSheet, parseAddress, recalculate, setCellName, setRawText } from '../engine/index';
import type { Sheet } from '../engine/index';
import type { LevelDocument } from '../model/index';
import { stepMonsters } from './monsters';
import { createRandom } from './random';
import { startRun } from './run';
import { makeSheet, recalc } from './state';
import { MAX_DAMAGE } from './types';
import type { DamageEntry, MonsterState } from './types';

const COLS = 'ABCDEFGHIJKL';

interface Rules {
  readonly [name: string]: string;
}

/** A 12x12 floor sheet with `overrides` (address -> raw) and named rule cells in row 14+. */
function build(overrides: Readonly<Record<string, string>>, rules: Rules, hero = 'A1'): Sheet {
  const sheet = createSheet();
  for (let r = 1; r <= 12; r += 1) {
    for (const c of COLS) setRawText(sheet, `${c}${r}`, overrides[`${c}${r}`] ?? '.');
  }
  let row = 14;
  for (const [name, raw] of Object.entries(rules)) {
    const address = `A${row}`;
    setRawText(sheet, address, raw);
    setCellName(sheet, address, name);
    row += 1;
  }
  const parsed = parseAddress(hero);
  if (!parsed.ok) throw new Error('bad hero');
  recalculate(sheet, { heroAddress: parsed.point, random: () => 0 });
  return sheet;
}

function monster(id: string, at: string, move = `MOVE_${id}`, atk = `ATK_${id}`): MonsterState {
  return { id, at, move, atk };
}

function step(sheet: Sheet, monsters: readonly MonsterState[], hero = 'A1', hp = 10) {
  return stepMonsters(sheet, hero, monsters, hp, [], createRandom(1));
}

describe('stepMonsters: move', () => {
  it.each([
    ['N', 'E4', 'E5'],
    ['S', 'E6', 'E5'],
    ['E', 'F5', 'E5'],
    ['W', 'D5', 'E5'],
  ])('moves %s', (dir, expected, start) => {
    const sheet = build({}, { MOVE_M1: `="${dir}"`, ATK_M1: '0' });
    expect(step(sheet, [monster('M1', start)]).monsters[0]?.at).toBe(expected);
  });

  it.each([
    ['lower-case', '="n"'],
    ['dash', '="-"'],
    ['number', '3'],
    ['boolean', '=TRUE'],
    ['empty string', '=""'],
    ['error', '=1/0'],
  ])('stays for %s', (_label, raw) => {
    const sheet = build({}, { MOVE_M1: raw, ATK_M1: '0' });
    expect(step(sheet, [monster('M1', 'E5')]).monsters[0]?.at).toBe('E5');
  });

  it.each([
    ['wall', { E4: '#' }],
    ['exit', { E4: 'X' }],
    ['trap', { E4: '^' }],
    ['error cell', { E4: '=1/0' }],
  ])('is blocked by %s', (_label, overrides) => {
    const sheet = build(overrides, { MOVE_M1: '="N"', ATK_M1: '0' });
    expect(step(sheet, [monster('M1', 'E5')]).monsters[0]?.at).toBe('E5');
  });

  it('is blocked by the hero', () => {
    const sheet = build({}, { MOVE_M1: '="N"', ATK_M1: '0' }, 'E4');
    expect(step(sheet, [monster('M1', 'E5')], 'E4').monsters[0]?.at).toBe('E5');
  });

  it('is blocked by another monster', () => {
    const sheet = build({}, { MOVE_M1: '="N"', MOVE_M2: '="-"', ATK_M1: '0', ATK_M2: '0' });
    const result = step(sheet, [monster('M1', 'E5'), monster('M2', 'E4')]);
    expect(result.monsters.map((m) => m.at)).toEqual(['E5', 'E4']);
  });

  it('is blocked by the map edge', () => {
    const sheet = build({}, { MOVE_M1: '="N"', ATK_M1: '0' });
    expect(step(sheet, [monster('M1', 'E1')]).monsters[0]?.at).toBe('E1');
  });

  it('moves out of a cell that is no longer floor', () => {
    const sheet = build({ E5: '#' }, { MOVE_M1: '="N"', ATK_M1: '0' });
    expect(step(sheet, [monster('M1', 'E5')]).monsters[0]?.at).toBe('E4');
  });

  it('sees the live position of an earlier monster in reading order', () => {
    const sheet = build({}, { MOVE_M1: '="E"', MOVE_M2: '="N"', ATK_M1: '0', ATK_M2: '0' });
    // C5 comes first in reading order and moves to D5; M2 at D6 then finds D5 taken.
    const result = step(sheet, [monster('M1', 'C5'), monster('M2', 'D6')]);
    expect(result.monsters.map((m) => m.at)).toEqual(['D5', 'D6']);
  });

  it('gives the earlier monster in reading order the cell even when listed later', () => {
    const sheet = build({}, { MOVE_M1: '="N"', MOVE_M2: '="E"', ATK_M1: '0', ATK_M2: '0' });
    // M2 at D4 comes first in reading order and takes E4 before M1 (E5) can aim there.
    const result = step(sheet, [monster('M1', 'E5'), monster('M2', 'D4')]);
    expect(result.monsters.map((m) => m.at)).toEqual(['E5', 'E4']);
  });
});

describe('stepMonsters: atk', () => {
  function dmg(raw: string, hp = 10) {
    const sheet = build({}, { MOVE_M1: '="-"', ATK_M1: raw });
    return step(sheet, [monster('M1', 'E5')], 'A1', hp);
  }

  it('deals a whole number', () => {
    const r = dmg('2');
    expect(r.hp).toBe(8);
    expect(r.log).toEqual([{ source: { kind: 'monster', id: 'M1' }, amount: 2 }]);
  });

  it('floors 1.5 to 1', () => {
    const r = dmg('1.5');
    expect(r.hp).toBe(9);
    expect(r.log).toEqual([{ source: { kind: 'monster', id: 'M1' }, amount: 1 }]);
  });

  it.each(['0.9', '0', '-1', 'text', '=TRUE', '=1/0'])('deals nothing for %s', (raw) => {
    const r = dmg(raw);
    expect(r.hp).toBe(10);
    expect(r.log).toEqual([]);
  });

  it('caps huge damage at MAX_DAMAGE', () => {
    const r = dmg('=1000000000*1000000000');
    expect(r.log[0]?.amount).toBe(MAX_DAMAGE);
    expect(r.hp).toBe(10 - MAX_DAMAGE);
  });

  it('evaluates atk at the position after the move', () => {
    const sheet = build({}, { MOVE_M1: '="N"', ATK_M1: '=ROW(SELF)' });
    const r = step(sheet, [monster('M1', 'E5')]);
    expect(r.monsters[0]?.at).toBe('E4');
    expect(r.log[0]?.amount).toBe(4);
  });

  it('keeps acting at hp 0 and below', () => {
    const r = dmg('3', 0);
    expect(r.hp).toBe(-3);
    expect(r.log).toHaveLength(1);
  });

  it('appends one entry per damaging monster to the given log', () => {
    const sheet = build({}, { MOVE_M1: '="-"', MOVE_M2: '="-"', ATK_M1: '1', ATK_M2: '2' });
    const prior: readonly DamageEntry[] = [{ source: { kind: 'trap' }, amount: 1 }];
    const r = stepMonsters(
      sheet,
      'A1',
      [monster('M1', 'E5'), monster('M2', 'F5')],
      10,
      prior,
      createRandom(1),
    );
    expect(r.log.map((e) => e.amount)).toEqual([1, 1, 2]);
    expect(r.hp).toBe(7);
  });

  it('does nothing and does not throw for an unknown rule cell', () => {
    const sheet = build({}, {});
    const r = step(sheet, [monster('M1', 'E5', 'NOPE', 'NOPE2')]);
    expect(r.monsters[0]?.at).toBe('E5');
    expect(r.hp).toBe(10);
  });
});

describe('breaking a rule is a legal strategy', () => {
  const walls = '############';
  const doc: LevelDocument = {
    schemaVersion: 1,
    id: '01-test-level',
    title: 'Test level',
    hint: 'A hint.',
    startingHp: 7,
    ink: 3,
    seed: 5,
    hero: { at: 'B2' },
    monsters: [{ id: 'M1', at: 'C2', move: 'MOVE_M1', atk: 'ATK_M1' }],
    map: [
      walls,
      '#..#.......#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.........X#',
      walls,
    ],
    cells: [
      { address: 'A14', raw: 'move', locked: true },
      { address: 'B14', raw: '="E"', name: 'MOVE_M1' },
      { address: 'A15', raw: 'atk', locked: true },
      { address: 'B15', raw: '1', name: 'ATK_M1' },
    ],
  };

  function sheetWith(edits: readonly { address: string; raw: string }[]) {
    const started = startRun(doc);
    if (!started.ok) throw new Error('level failed to load');
    const sheet = makeSheet(started.state.level, edits);
    if (sheet === undefined) throw new Error('sheet failed');
    expect(recalc(sheet, 'B2', createRandom(1))).toBe(true);
    return { sheet, monsters: started.state.monsters };
  }

  it('a move cell that is an error leaves the monster in place', () => {
    const { sheet, monsters } = sheetWith([{ address: 'B14', raw: '=1/0' }]);
    expect(step(sheet, monsters, 'B2').monsters[0]?.at).toBe('C2');
  });

  it('an atk cell that is an error deals no damage', () => {
    const { sheet, monsters } = sheetWith([{ address: 'B15', raw: '=1/0' }]);
    const r = step(sheet, monsters, 'B2');
    expect(r.hp).toBe(10);
    expect(r.log).toEqual([]);
  });

  it('a wall edited into floor opens a move that was refused before', () => {
    const before = sheetWith([]);
    expect(step(before.sheet, before.monsters, 'B2').monsters[0]?.at).toBe('C2');
    const after = sheetWith([{ address: 'D2', raw: '.' }]);
    expect(step(after.sheet, after.monsters, 'B2').monsters[0]?.at).toBe('D2');
  });
});
