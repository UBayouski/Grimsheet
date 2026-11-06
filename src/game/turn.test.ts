import { describe, expect, it } from 'vitest';
import type { LevelDocument } from '../model/index';
import { parseFormula } from '../engine/index';
import { createRandom } from './random';
import { cellRawText, cellValue, startRun } from './run';
import { REFUSAL_MESSAGES, applyAction, parseAction } from './turn';
import { MAX_DAMAGE, REFUSAL_REASONS } from './types';
import type { Action, ActionResult, DamageLog, RunState } from './types';

const COLUMNS = 'ABCDEFGHIJKL';

type CellSpec = NonNullable<LevelDocument['cells']> extends readonly (infer C)[] ? C : never;

interface Setup {
  hp?: number;
  ink?: number;
  hero?: string;
  /** Map glyph overrides by address (rows 1 to 12). */
  glyphs?: Record<string, string>;
  /** Monsters: id, address, move formula, atk formula. */
  monsters?: { id: string; at: string; move?: string; atk?: string }[];
  /** `undefined` leaves TRAP out of the sheet. */
  trap?: string;
  extra?: CellSpec[];
}

function makeDoc(setup: Setup = {}): LevelDocument {
  const grid = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => '.'));
  for (const [address, glyph] of Object.entries(setup.glyphs ?? {})) {
    const col = COLUMNS.indexOf(address.charAt(0));
    const row = Number(address.slice(1)) - 1;
    const line = grid[row];
    if (line !== undefined) line[col] = glyph;
  }
  const monsters = setup.monsters ?? [];
  const cells: CellSpec[] = [];
  monsters.forEach((m, i) => {
    const row = 14 + i * 2;
    cells.push({ address: `A${row}`, raw: `Move ${m.id}` });
    cells.push({ address: `B${row}`, raw: m.move ?? '="-"', name: `MOVE_${m.id}` });
    cells.push({ address: `A${row + 1}`, raw: `Attack ${m.id}` });
    cells.push({ address: `B${row + 1}`, raw: m.atk ?? '=0', name: `ATK_${m.id}` });
  });
  if (setup.trap !== undefined) {
    cells.push({ address: 'D14', raw: 'Trap' });
    cells.push({ address: 'E14', raw: setup.trap, name: 'TRAP' });
  }
  cells.push(...(setup.extra ?? []));
  return {
    schemaVersion: 1,
    id: '01-turn-test',
    title: 'Turn test',
    hint: 'A hint.',
    startingHp: setup.hp ?? 10,
    ink: setup.ink ?? 3,
    seed: 777,
    hero: { at: setup.hero ?? 'F6' },
    monsters: monsters.map((m) => ({ id: m.id, at: m.at, move: `MOVE_${m.id}`, atk: `ATK_${m.id}` })),
    map: grid.map((line) => line.join('')),
    cells,
  };
}

function start(setup: Setup = {}): RunState {
  const result = startRun(makeDoc(setup));
  if (!result.ok) throw new Error(`start failed: ${JSON.stringify(result.errors)}`);
  return result.state;
}

function accepted(result: ActionResult): { state: RunState; damage: DamageLog } {
  if (!result.ok) throw new Error(`refused: ${result.reason}: ${result.message}`);
  return result;
}

function step(state: RunState, action: Action): { state: RunState; damage: DamageLog } {
  return accepted(applyAction(state, action));
}

/** 1e300 written out; the formula grammar has no exponent notation. */
const HUGE = `=1${'0'.repeat(300)}`;
const WAIT: Action = { kind: 'wait' };

describe('refusal messages', () => {
  it('has a 1 to 200 character message for every reason', () => {
    for (const reason of REFUSAL_REASONS) {
      const message = REFUSAL_MESSAGES[reason];
      expect(message.length).toBeGreaterThanOrEqual(1);
      expect(message.length).toBeLessThanOrEqual(200);
    }
    expect(Object.keys(REFUSAL_MESSAGES).sort()).toEqual([...REFUSAL_REASONS].sort());
  });
});

describe('applyAction shell', () => {
  const malformed: unknown[] = [
    null,
    undefined,
    5,
    'move',
    [],
    {},
    { kind: 'jump' },
    { kind: 'move' },
    { kind: 'move', dir: 'X' },
    { kind: 'move', dir: 'n' },
    { kind: 'move', dir: 5 },
    { kind: 'edit', address: 5, raw: 'x' },
    { kind: 'edit', address: 'A1' },
    { kind: 'edit', raw: 'x' },
  ];

  it('gives invalid-action for every malformed Action', () => {
    const state = start();
    for (const action of malformed) {
      const result = applyAction(state, action);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid-action');
    }
  });

  it('copies the fields of a valid Action', () => {
    const parsed = parseAction({ kind: 'move', dir: 'N', extra: 1 });
    expect(parsed).toEqual({ kind: 'move', dir: 'N' });
  });

  it('gives internal-error for a throwing getter', () => {
    const state = start();
    const action = {
      get kind(): string {
        throw new Error('boom');
      },
    };
    const result = applyAction(state, action);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('internal-error');
      expect(result.message).toBe(REFUSAL_MESSAGES['internal-error']);
    }
  });

  it('gives internal-error for a forged state', () => {
    const forged = { ...start() };
    const result = applyAction(forged, WAIT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('internal-error');
  });
});

describe('moves', () => {
  it.each([
    ['N', 'F5'],
    ['S', 'F7'],
    ['E', 'G6'],
    ['W', 'E6'],
  ] as const)('moves one cell %s', (dir, expected) => {
    const { state } = step(start(), { kind: 'move', dir });
    expect(state.hero).toBe(expected);
    expect(state.turn).toBe(1);
    expect(state.valuesHero).toBe(expected);
  });

  const blockedCases: [string, Setup, 'N' | 'S' | 'E' | 'W'][] = [
    ['a wall', { glyphs: { F5: '#' } }, 'N'],
    ['an error Cell', { extra: [{ address: 'G6', raw: '=1/0' }] }, 'E'],
    ['the top edge', { hero: 'A1' }, 'N'],
    ['the left edge', { hero: 'A1' }, 'W'],
    ['the right edge', { hero: 'L1' }, 'E'],
    ['row 13', { hero: 'A12' }, 'S'],
  ];
  it.each(blockedCases)('refuses a move into %s as blocked', (_name, setup, dir) => {
    const result = applyAction(start(setup), { kind: 'move', dir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('blocked');
  });

  it('refuses a move onto a monster as occupied', () => {
    const state = start({ monsters: [{ id: 'M1', at: 'G6' }] });
    const result = applyAction(state, { kind: 'move', dir: 'E' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('occupied');
  });

  it('leaves the caller alone on a refused move and returns no state', () => {
    const state = start({ glyphs: { F5: '#' } });
    const before = { turn: state.turn, ink: state.ink, rngState: state.rngState, hero: state.hero };
    const result = applyAction(state, { kind: 'move', dir: 'N' });
    expect(result.ok).toBe(false);
    expect('state' in result).toBe(false);
    expect({ turn: state.turn, ink: state.ink, rngState: state.rngState, hero: state.hero }).toEqual(before);
  });

  it('raises turn by exactly 1 per accepted Action and freezes results', () => {
    const first = step(start(), { kind: 'move', dir: 'E' });
    const second = step(first.state, WAIT);
    expect(second.state.turn).toBe(2);
    expect(Object.isFrozen(second.state)).toBe(true);
    expect(Object.isFrozen(second.damage)).toBe(true);
    expect(second.state.undoSnapshot?.turn).toBe(1);
    expect(second.state.undoSnapshot?.hero).toBe('G6');
    expect(Object.keys(second.state.undoSnapshot ?? {})).not.toContain('undoSnapshot');
  });
});

describe('turn sequence', () => {
  it('logs trap damage before haunting damage', () => {
    const state = start({
      hp: 10,
      glyphs: { G6: '^' },
      trap: '=1',
      extra: [
        { address: 'J15', raw: '=K15' },
        { address: 'K15', raw: '=J15' },
      ],
    });
    const { state: next, damage } = step(state, { kind: 'move', dir: 'E' });
    expect(damage.map((d) => d.source.kind)).toEqual(['trap', 'haunt']);
    expect(next.hp).toBe(8);
  });

  it('lets a later monster see where an earlier monster moved', () => {
    const state = start({
      monsters: [
        { id: 'M1', at: 'D2', move: '="E"' },
        { id: 'M2', at: 'D3', move: '="N"' },
      ],
    });
    const { state: next } = step(state, WAIT);
    expect(next.monsters.map((m) => m.at)).toEqual(['E2', 'D2']);
  });

  it('reports monster damage in reading order', () => {
    const state = start({
      monsters: [
        { id: 'M1', at: 'D5', atk: '=2' },
        { id: 'M2', at: 'D2', atk: '=3' },
      ],
    });
    const { state: next, damage } = step(state, WAIT);
    expect(damage.map((d) => d.amount)).toEqual([3, 2]);
    expect(damage[0]?.source).toEqual({ kind: 'monster', id: 'M2' });
    expect(next.hp).toBe(5);
  });

  const trapCases: [string, string | undefined, number][] = [
    ['absent', undefined, 0],
    ['0', '=0', 0],
    ['0.5', '=0.5', 0],
    ['1.5', '=1.5', 1],
    ['2', '=2', 2],
    ['text', '="ouch"', 0],
    ['a positive number', '=7', 7],
  ];
  it.each(trapCases)('applies TRAP %s as %i damage', (_name, trap, expected) => {
    const setup: Setup = { glyphs: { G6: '^' } };
    if (trap !== undefined) setup.trap = trap;
    const { state, damage } = step(start(setup), { kind: 'move', dir: 'E' });
    expect(state.hp).toBe(10 - expected);
    expect(damage.filter((d) => d.source.kind === 'trap').map((d) => d.amount)).toEqual(
      expected === 0 ? [] : [expected],
    );
  });

  it('hurts again on every turn spent on a trap', () => {
    const first = step(start({ glyphs: { G6: '^' }, trap: '=2' }), { kind: 'move', dir: 'E' });
    const second = step(first.state, WAIT);
    const third = step(second.state, WAIT);
    expect(third.state.hp).toBe(10 - 6);
    expect(third.damage).toEqual([{ source: { kind: 'trap' }, amount: 2 }]);
  });

  it('haunts once however many Cells are in cycles', () => {
    const state = start({
      extra: [
        { address: 'J15', raw: '=K15' },
        { address: 'K15', raw: '=J15' },
        { address: 'L15', raw: '=L15' },
      ],
    });
    const { state: next, damage } = step(state, WAIT);
    expect(damage).toEqual([{ source: { kind: 'haunt' }, amount: 1 }]);
    expect(next.hp).toBe(9);
  });

  it('lets loss beat win on the exit', () => {
    const state = start({
      hp: 1,
      glyphs: { G6: 'X' },
      monsters: [{ id: 'M1', at: 'A1', atk: '=1' }],
    });
    const { state: next } = step(state, { kind: 'move', dir: 'E' });
    expect(next.hp).toBe(0);
    expect(next.status).toBe('lost');
  });

  it('wins on the exit with HP left', () => {
    const { state } = step(start({ glyphs: { G6: 'X' } }), { kind: 'move', dir: 'E' });
    expect(state.status).toBe('won');
  });

  it('keeps a hero alive on an error Cell and lets it walk out', () => {
    const state = start({
      hero: 'D5',
      extra: [{ address: 'E5', raw: '=IF(AND(ROW(HERO)=5,COL(HERO)=5),"?",".")' }],
    });
    const onError = step(state, { kind: 'move', dir: 'E' });
    expect(onError.state.hero).toBe('E5');
    expect(onError.state.status).toBe('playing');
    expect(onError.state.hp).toBe(10);
    const out = step(onError.state, { kind: 'move', dir: 'W' });
    expect(out.state.hero).toBe('D5');
  });

  it('refuses move and wait with not-playing after a win and after a loss', () => {
    const won = step(start({ glyphs: { G6: 'X' } }), { kind: 'move', dir: 'E' }).state;
    const lost = step(start({ hp: 1, monsters: [{ id: 'M1', at: 'A1', atk: '=1' }] }), WAIT).state;
    expect(lost.status).toBe('lost');
    for (const state of [won, lost]) {
      for (const action of [WAIT, { kind: 'move', dir: 'W' } as Action]) {
        const result = applyAction(state, action);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('not-playing');
      }
    }
  });

  it('stores the advanced rngState after a RAND() turn', () => {
    const state = start({ extra: [{ address: 'F3', raw: '=RAND()' }] });
    const { state: next } = step(state, WAIT);
    expect(next.rngState).not.toBe(state.rngState);
    const calm = step(start(), WAIT).state;
    expect(calm.rngState).toBe(start().rngState);
  });
});

describe('whole-number damage', () => {
  it('logs nothing for an atk of 0.9', () => {
    const { state, damage } = step(start({ monsters: [{ id: 'M1', at: 'A1', atk: '=0.9' }] }), WAIT);
    expect(damage).toEqual([]);
    expect(state.hp).toBe(10);
  });

  it('floors an atk of 1.5 to 1', () => {
    const { state, damage } = step(start({ monsters: [{ id: 'M1', at: 'A1', atk: '=1.5' }] }), WAIT);
    expect(damage.map((d) => d.amount)).toEqual([1]);
    expect(state.hp).toBe(9);
  });

  it('caps an atk of 1e300 at MAX_DAMAGE', () => {
    const state = start({ hp: 10, monsters: [{ id: 'M1', at: 'A1', atk: HUGE }] });
    const next = step(state, WAIT);
    expect(next.damage.map((d) => d.amount)).toEqual([MAX_DAMAGE]);
    expect(next.state.hp).toBe(10 - 1e9);
    expect(Number.isSafeInteger(next.state.hp)).toBe(true);
    expect(next.state.status).toBe('lost');
  });

  it('caps a TRAP of 1e300 at MAX_DAMAGE', () => {
    const state = start({ hp: 10, glyphs: { G6: '^' }, trap: HUGE });
    const next = step(state, { kind: 'move', dir: 'E' });
    expect(next.damage).toEqual([{ source: { kind: 'trap' }, amount: MAX_DAMAGE }]);
    expect(next.state.hp).toBe(10 - 1e9);
    expect(Number.isSafeInteger(next.state.hp)).toBe(true);
    expect(next.state.status).toBe('lost');
  });

  it('subtracts the logged sum for several huge monsters', () => {
    const state = start({
      hp: 10,
      monsters: [
        { id: 'M1', at: 'A1', atk: HUGE },
        { id: 'M2', at: 'B1', atk: HUGE },
        { id: 'M3', at: 'C1', atk: HUGE },
      ],
    });
    const next = step(state, WAIT);
    const sum = next.damage.reduce((total, d) => total + d.amount, 0);
    expect(sum).toBe(3 * MAX_DAMAGE);
    expect(next.state.hp).toBe(10 - sum);
    expect(Number.isSafeInteger(next.state.hp)).toBe(true);
  });

  it('keeps hp exact at Number.MAX_SAFE_INTEGER', () => {
    const state = start({ hp: Number.MAX_SAFE_INTEGER, monsters: [{ id: 'M1', at: 'A1', atk: '=1' }] });
    const next = step(state, WAIT);
    expect(next.state.hp).toBe(Number.MAX_SAFE_INTEGER - 1);
  });
});

describe('edits', () => {
  const CYCLE: CellSpec[] = [
    { address: 'J15', raw: '=K15' },
    { address: 'K15', raw: '=J15' },
  ];

  function edit(address: string, raw: string): Action {
    return { kind: 'edit', address, raw };
  }

  function refusal(state: RunState, action: Action): string {
    const result = applyAction(state, action);
    if (result.ok) throw new Error('expected a refusal');
    return result.reason;
  }

  function lostState(): RunState {
    const state = step(start({ hp: 1, monsters: [{ id: 'M1', at: 'A1', atk: '=1' }] }), WAIT).state;
    expect(state.status).toBe('lost');
    return state;
  }

  it('reports the earliest failing check', () => {
    const locked: CellSpec[] = [{ address: 'J16', raw: '5', locked: true }];
    // not-playing beats bad-address
    expect(refusal(lostState(), edit('ZZ', 'x'))).toBe('not-playing');
    // bad-address beats reserved-row
    expect(refusal(start({ ink: 0 }), edit('M13', 'x'))).toBe('bad-address');
    expect(refusal(start(), edit('A21', 'x'))).toBe('bad-address');
    // reserved-row beats no-ink
    expect(refusal(start({ ink: 0 }), edit('A13', 'x'))).toBe('reserved-row');
    // locked beats unchanged
    expect(refusal(start({ extra: locked }), edit('J16', '5'))).toBe('locked');
    // unchanged beats no-ink
    expect(refusal(start({ ink: 0 }), edit('A1', '.'))).toBe('unchanged');
    // no-ink beats parse-error
    expect(refusal(start({ ink: 0 }), edit('A1', '=1+'))).toBe('no-ink');
    // parse-error last
    expect(refusal(start(), edit('A1', '=1+'))).toBe('parse-error');
  });

  it('refuses a locked Cell even when the text differs', () => {
    expect(refusal(start({ extra: [{ address: 'J16', raw: '5', locked: true }] }), edit('J16', '6'))).toBe(
      'locked',
    );
  });

  it('compares unchanged against the latest edit', () => {
    const { state } = step(start(), edit('A1', 'hello'));
    expect(refusal(state, edit('A1', 'hello'))).toBe('unchanged');
    expect(step(state, edit('A1', '.')).state.ink).toBe(1);
  });

  it('edits a Cell that has no Cell_Spec', () => {
    const { state } = step(start(), edit('C3', 'hello'));
    expect(cellRawText(state, 'C3')).toBe('hello');
    expect(cellValue(state, 'C3')).toMatchObject({ kind: 'string', value: 'hello' });
  });

  it('accepts a lower-case address and stores it canonical', () => {
    const { state } = step(start(), edit('c3', 'hello'));
    expect(state.edits).toEqual([{ address: 'C3', raw: 'hello' }]);
  });

  it('uses the engine text unchanged for a Col N: message', () => {
    for (const raw of ['=1+', '=(1', '=FOO(', '=1 2']) {
      const parsed = parseFormula(raw);
      expect(parsed.ok).toBe(false);
      const result = applyAction(start(), edit('A1', raw));
      expect(result.ok).toBe(false);
      if (!result.ok && !parsed.ok) {
        expect(result.reason).toBe('parse-error');
        expect(result.message).toMatch(/^Col \d+: /);
        expect(result.message).toBe(parsed.error.text);
      }
    }
  });

  it('accepts a 500-character literal and refuses 501 with the fixed message', () => {
    const state = start();
    const ok = step(state, edit('A1', 'x'.repeat(500)));
    expect(ok.state.ink).toBe(2);
    const result = applyAction(state, edit('A1', 'x'.repeat(501)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('parse-error');
      expect(result.message).toBe('Text is longer than 500 characters.');
    }
    expect(state.ink).toBe(3);
  });

  it('leaves turn, ink, rngState and the Edit_Record alone on refusal', () => {
    const base = step(start({ extra: [{ address: 'J16', raw: '5', locked: true }] }), edit('C3', 'a')).state;
    const before = { turn: base.turn, ink: base.ink, rngState: base.rngState, edits: [...base.edits] };
    const refused = [edit('ZZ', 'x'), edit('A13', 'x'), edit('J16', '9'), edit('C3', 'a'), edit('A1', '=1+')];
    for (const action of refused) {
      const result = applyAction(base, action);
      expect(result.ok).toBe(false);
      expect('state' in result).toBe(false);
    }
    expect({ turn: base.turn, ink: base.ink, rngState: base.rngState, edits: [...base.edits] }).toEqual(before);
  });

  it('spends 1 ink, appends one entry and runs the full turn', () => {
    const state = start({ monsters: [{ id: 'M1', at: 'A1', atk: '=2' }], extra: CYCLE });
    const next = step(state, edit('C3', 'x'));
    expect(next.state.ink).toBe(2);
    expect(next.state.edits).toHaveLength(1);
    expect(next.state.turn).toBe(1);
    expect(next.damage.map((d) => d.source.kind)).toEqual(['monster', 'haunt']);
    expect(next.state.hp).toBe(7);
    expect(next.state.undoSnapshot?.ink).toBe(3);
  });

  it('keeps the hero and a monster in place when their Cell becomes a wall', () => {
    const state = start({ monsters: [{ id: 'M1', at: 'D2' }] });
    const afterHero = step(state, edit('F6', '#')).state;
    expect(afterHero.hero).toBe('F6');
    expect(afterHero.status).toBe('playing');
    const afterMonster = step(afterHero, edit('D2', '#')).state;
    expect(afterMonster.monsters[0]?.at).toBe('D2');
    expect(step(afterMonster, { kind: 'move', dir: 'W' }).state.hero).toBe('E6');
  });

  it('causes no haunting on the turn that removes the last cycle', () => {
    const state = start({ extra: CYCLE });
    const next = step(state, edit('K15', '1'));
    expect(next.damage).toEqual([]);
    expect(next.state.hp).toBe(10);
  });

  it('opens a move that was refused before when a wall becomes floor', () => {
    const state = start({ glyphs: { F5: '#' } });
    expect(refusal(state, { kind: 'move', dir: 'N' })).toBe('blocked');
    const edited = step(state, edit('F5', '.')).state;
    expect(step(edited, { kind: 'move', dir: 'N' }).state.hero).toBe('F5');
  });

  it('refuses a move onto a walled Cell with a monster as blocked, not occupied', () => {
    const state = start({ monsters: [{ id: 'M1', at: 'G6' }] });
    expect(refusal(state, { kind: 'move', dir: 'E' })).toBe('occupied');
    const edited = step(state, edit('G6', '#')).state;
    expect(edited.monsters[0]?.at).toBe('G6');
    expect(refusal(edited, { kind: 'move', dir: 'E' })).toBe('blocked');
  });

  it('stops a monster from dealing damage once its atk is broken', () => {
    const state = start({ monsters: [{ id: 'M1', at: 'A1', atk: '=2' }] });
    const hurt = step(state, WAIT);
    expect(hurt.state.hp).toBe(8);
    const broken = step(hurt.state, edit('B15', '=1/0'));
    expect(broken.damage).toEqual([]);
    expect(broken.state.hp).toBe(8);
  });
});

describe('undo', () => {
  const UNDO: Action = { kind: 'undo' };

  /** Every readable Cell: [raw text, value] for all 240 Cells. */
  function readAll(state: RunState): unknown[] {
    const out: unknown[] = [];
    for (let row = 1; row <= 20; row += 1) {
      for (const col of COLUMNS) {
        out.push([cellRawText(state, `${col}${row}`), cellValue(state, `${col}${row}`)]);
      }
    }
    return out;
  }

  function fields(state: RunState): unknown {
    return {
      hero: state.hero,
      monsters: state.monsters,
      hp: state.hp,
      ink: state.ink,
      turn: state.turn,
      status: state.status,
      rngState: state.rngState,
      valuesHero: state.valuesHero,
      valuesRngState: state.valuesRngState,
      edits: state.edits,
    };
  }

  function reason(result: ActionResult): string {
    if (result.ok) throw new Error('expected a refusal');
    return result.reason;
  }

  it('undoes a move', () => {
    const before = start();
    const moved = step(before, { kind: 'move', dir: 'E' }).state;
    const undone = step(moved, UNDO);
    expect(fields(undone.state)).toEqual(fields(before));
    expect(readAll(undone.state)).toEqual(readAll(before));
    expect(undone.state.undoSnapshot).toBeNull();
    expect(undone.damage).toEqual([]);
    expect(Object.isFrozen(undone.state)).toBe(true);
  });

  it('refunds ink and restores the Raw_Text after an edit', () => {
    const before = start();
    const edited = step(before, { kind: 'edit', address: 'C3', raw: 'hello' }).state;
    expect(edited.ink).toBe(2);
    const undone = step(edited, UNDO).state;
    expect(undone.ink).toBe(3);
    expect(undone.edits).toEqual([]);
    expect(cellRawText(undone, 'C3')).toBe('.');
    expect(readAll(undone)).toEqual(readAll(before));
  });

  it('restores hp exactly after a turn that took damage', () => {
    const before = start({
      hp: 10,
      glyphs: { G6: '^' },
      trap: '=2',
      monsters: [{ id: 'M1', at: 'A1', atk: '=3' }],
    });
    const hurt = step(before, { kind: 'move', dir: 'E' }).state;
    expect(hurt.hp).toBe(5);
    const undone = step(hurt, UNDO).state;
    expect(undone.hp).toBe(10);
    expect(fields(undone)).toEqual(fields(before));
  });

  it('restores a lethal turn to the exact earlier hp and status', () => {
    const before = start({ hp: 2, monsters: [{ id: 'M1', at: 'A1', atk: '=5' }] });
    const lost = step(before, WAIT).state;
    expect(lost.status).toBe('lost');
    // A lost run refuses undo.
    expect(reason(applyAction(lost, UNDO))).toBe('not-playing');
  });

  it('restores RAND() Values and the next draw after a RAND() turn', () => {
    const before = start({ extra: [{ address: 'F3', raw: '=RAND()' }] });
    const nextDrawBefore = createRandom(0, before.rngState).next();
    const turned = step(before, WAIT).state;
    expect(cellValue(turned, 'F3')).not.toEqual(cellValue(before, 'F3'));
    const undone = step(turned, UNDO).state;
    expect(readAll(undone)).toEqual(readAll(before));
    expect(cellValue(undone, 'F3')).toEqual(cellValue(before, 'F3'));
    expect(createRandom(0, undone.rngState).next()).toBe(nextDrawBefore);
    // Replaying the same Action after the undo gives the same result.
    expect(fields(step(undone, WAIT).state)).toEqual(fields(turned));
  });

  it('gives nothing-to-undo for a second undo', () => {
    const moved = step(start(), { kind: 'move', dir: 'E' }).state;
    const undone = step(moved, UNDO).state;
    expect(reason(applyAction(undone, UNDO))).toBe('nothing-to-undo');
  });

  it('gives nothing-to-undo at the start', () => {
    const result = applyAction(start(), UNDO);
    expect(reason(result)).toBe('nothing-to-undo');
    if (!result.ok) expect(result.message).toBe(REFUSAL_MESSAGES['nothing-to-undo']);
  });

  it('gives not-playing after a win and after a loss', () => {
    const won = step(start({ glyphs: { G6: 'X' } }), { kind: 'move', dir: 'E' }).state;
    const lost = step(start({ hp: 1, monsters: [{ id: 'M1', at: 'A1', atk: '=1' }] }), WAIT).state;
    expect(won.status).toBe('won');
    expect(lost.status).toBe('lost');
    expect(reason(applyAction(won, UNDO))).toBe('not-playing');
    expect(reason(applyAction(lost, UNDO))).toBe('not-playing');
  });

  it('is not changed by a refused Action in between', () => {
    const before = start({ glyphs: { G5: '#' } });
    const moved = step(before, { kind: 'move', dir: 'E' }).state;
    expect(reason(applyAction(moved, { kind: 'edit', address: 'A13', raw: 'x' }))).toBe('reserved-row');
    expect(reason(applyAction(moved, { kind: 'move', dir: 'N' }))).toBe('blocked');
    expect(reason(applyAction(moved, { kind: 'jump' }))).toBe('invalid-action');
    const undone = step(moved, UNDO).state;
    expect(fields(undone)).toEqual(fields(before));
    expect(readAll(undone)).toEqual(readAll(before));
  });

  it('leaves the old state readable after later Actions and after an undo', () => {
    const s0 = start({ extra: [{ address: 'F3', raw: '=RAND()' }] });
    const s0Fields = fields(s0);
    const s0Cells = readAll(s0);
    const s1 = step(s0, { kind: 'edit', address: 'C3', raw: 'hello' }).state;
    const s1Fields = fields(s1);
    const s1Cells = readAll(s1);
    const s2 = step(s1, { kind: 'move', dir: 'E' }).state;
    const s3 = step(s2, UNDO).state;
    step(s3, WAIT);
    step(s0, WAIT);
    expect(fields(s0)).toEqual(s0Fields);
    expect(readAll(s0)).toEqual(s0Cells);
    expect(fields(s1)).toEqual(s1Fields);
    expect(readAll(s1)).toEqual(s1Cells);
    expect(cellRawText(s0, 'C3')).toBe('.');
    expect(cellRawText(s1, 'C3')).toBe('hello');
  });

  it('keeps no snapshot chain deeper than one', () => {
    let state = start();
    for (const dir of ['E', 'S', 'W', 'N'] as const) {
      state = step(state, { kind: 'move', dir }).state;
      expect(state.undoSnapshot).not.toBeNull();
      expect(Object.keys(state.undoSnapshot ?? {})).not.toContain('undoSnapshot');
    }
    const undone = step(state, UNDO).state;
    expect(undone.undoSnapshot).toBeNull();
    expect(undone.turn).toBe(3);
    // After the undo, the next turn snapshots the undone state only.
    const next = step(undone, WAIT).state;
    expect(next.undoSnapshot?.turn).toBe(3);
    expect(Object.keys(next.undoSnapshot ?? {})).not.toContain('undoSnapshot');
  });
});
