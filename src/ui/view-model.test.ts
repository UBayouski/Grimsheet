import { describe, expect, it } from 'vitest';
import { applyAction, describeCellError, startRun } from '../game/index';
import type { Action, RunState } from '../game/index';
import type { LevelDocument } from '../model/index';
import { changedAddresses, moveSelection, viewOf } from './view-model';
import type { Env, LevelEntry, Progress } from './types';

const WALLS = '############';

function makeDoc(overrides: Partial<LevelDocument> = {}): LevelDocument {
  return {
    schemaVersion: 1,
    id: '01-test-level',
    title: 'Test level',
    hint: 'A hint.',
    startingHp: 7,
    ink: 3,
    seed: 12345,
    hero: { at: 'B2' },
    monsters: [{ id: 'M1', at: 'F6', move: 'MOVE_M1', atk: 'ATK_M1' }],
    map: [
      WALLS,
      '#.X........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      WALLS,
    ],
    cells: [
      { address: 'G3', raw: '=1/0' },
      { address: 'A14', raw: 'Move 1', locked: true },
      { address: 'B14', raw: '="-"', name: 'MOVE_M1' },
      { address: 'A15', raw: 'Attack 1' },
      { address: 'B15', raw: '=0', name: 'ATK_M1' },
      { address: 'A18', raw: 'Trap' },
      { address: 'B18', raw: '=2', name: 'TRAP', locked: true },
    ],
    ...overrides,
  };
}

function start(doc: LevelDocument = makeDoc()): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error(`start failed: ${JSON.stringify(result.errors)}`);
  return result.state;
}

function act(state: RunState, action: Action): RunState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.state;
}

function entries(count = 3): LevelEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `0${i + 1}-level`,
    title: `Level ${i + 1}`,
    label: `Sheet${i + 1}: Level ${i + 1}`,
    doc: undefined,
  }));
}

const EMPTY_PROGRESS: Progress = { version: 1, cleared: [], current: null };

interface TestState {
  levelIndex: number;
  run: RunState | undefined;
  selection: string;
  edit: { readonly text: string } | undefined;
  message: string;
  alert: string;
  changed: ReadonlySet<string>;
  progress: Progress;
}

function stateOf(overrides: Partial<TestState> = {}): TestState {
  return {
    levelIndex: 0,
    run: start(),
    selection: 'B2',
    edit: undefined,
    message: 'A hint.',
    alert: '',
    changed: new Set<string>(),
    progress: EMPTY_PROGRESS,
    ...overrides,
  };
}

const ENV: Env = { entries: entries() };

function cellAt(vm: ReturnType<typeof viewOf>, address: string) {
  for (const row of vm.rows) {
    for (const cell of row) if (cell.address === address) return cell;
  }
  throw new Error(`no cell ${address}`);
}

function wonRun(): RunState {
  return act(start(), { kind: 'move', dir: 'E' }); // B2 -> C2 is the exit
}

function lostRun(): RunState {
  const doc = makeDoc({
    startingHp: 1,
    map: [WALLS, '#.^.......X#', ...Array.from({ length: 9 }, () => '#..........#'), WALLS],
  });
  return act(start(doc), { kind: 'move', dir: 'E' });
}

describe('viewOf rows', () => {
  it('has 19 rows in order: 1 to 12 then 14 to 20, 12 cells each', () => {
    const vm = viewOf(stateOf(), ENV);
    expect(vm.rows).toHaveLength(19);
    const rowNumbers = vm.rows.map((row) => row[0]?.row);
    expect(rowNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20]);
    for (const row of vm.rows) {
      expect(row.map((c) => c.col)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
    expect(vm.rows[0]?.[0]?.address).toBe('A1');
    expect(vm.rows[12]?.[0]?.address).toBe('A14');
    expect(vm.rows[0]?.[0]?.region).toBe('map');
    expect(vm.rows[12]?.[0]?.region).toBe('rules');
  });

  it('puts entity data and labels on the hero and monster cells only', () => {
    const vm = viewOf(stateOf(), ENV);
    const hero = cellAt(vm, 'B2');
    expect(hero.entity).toEqual({ type: 'hero' });
    expect(hero.ariaLabel).toBe('Hero at B2 on floor');
    const monster = cellAt(vm, 'F6');
    expect(monster.entity).toEqual({ type: 'monster', id: 'M1' });
    expect(monster.ariaLabel).toBe('Monster M1 at F6 on floor');
    const plain = vm.rows.flat().filter((c) => c.entity === undefined);
    expect(plain).toHaveLength(228 - 2);
    expect(plain.every((c) => c.ariaLabel === undefined)).toBe(true);
  });

  it('shows locked cells and names', () => {
    const vm = viewOf(stateOf(), ENV);
    expect(cellAt(vm, 'A14').locked).toBe(true);
    expect(cellAt(vm, 'B18').locked).toBe(true);
    expect(cellAt(vm, 'B14').locked).toBe(false);
    expect(cellAt(vm, 'B14').name).toBe('MOVE_M1');
    expect(cellAt(vm, 'C3').name).toBeUndefined();
  });

  it('sets errorKind for an error Value only', () => {
    const vm = viewOf(stateOf(), ENV);
    const bad = cellAt(vm, 'G3');
    expect(bad.errorKind).toBe('#DIV/0!');
    expect(bad.text).toBe('#DIV/0!');
    expect(cellAt(vm, 'C3').errorKind).toBeUndefined();
    expect(cellAt(vm, 'C3').text).toBe('.');
  });

  it('sets cause to describeCellError for an error cell and undefined otherwise', () => {
    const run = start();
    const vm = viewOf(stateOf({ run }), ENV);
    const bad = cellAt(vm, 'G3');
    expect(bad.errorKind).toBe('#DIV/0!');
    expect(bad.cause).toBe(describeCellError(run, 'G3'));
    expect(bad.cause).toBeTruthy();
    expect(cellAt(vm, 'C3').cause).toBeUndefined();
  });
});

/** A doc where J9 and K9 form a two-cell cycle and L9 is a downstream #CYCLE!. */
function cycleDoc(): LevelDocument {
  return makeDoc({
    cells: [
      { address: 'J9', raw: '=K9' },
      { address: 'K9', raw: '=J9' },
      { address: 'L9', raw: '=K9+1' },
      { address: 'A14', raw: 'Move 1', locked: true },
      { address: 'B14', raw: '="-"', name: 'MOVE_M1' },
      { address: 'A15', raw: 'Attack 1' },
      { address: 'B15', raw: '=0', name: 'ATK_M1' },
      { address: 'A18', raw: 'Trap' },
      { address: 'B18', raw: '=2', name: 'TRAP', locked: true },
    ],
  });
}

describe('viewOf explanation', () => {
  it('is set when the selected cell is an error and undefined otherwise', () => {
    const run = start();
    const selected = viewOf(stateOf({ run, selection: 'G3' }), ENV);
    expect(selected.explanation).toEqual({
      text: describeCellError(run, 'G3'),
      kind: '#DIV/0!',
    });
    expect(viewOf(stateOf({ run, selection: 'C3' }), ENV).explanation).toBeUndefined();
  });
});

describe('viewOf ghostCells', () => {
  it('lists Cycle_Cells in reading order and excludes a downstream #CYCLE!', () => {
    const run = start(cycleDoc());
    const vm = viewOf(stateOf({ run }), ENV);
    expect(vm.ghostCells).toEqual(['J9', 'K9']);
  });

  it('marks exactly one cell as selected', () => {
    const vm = viewOf(stateOf({ selection: 'C3' }), ENV);
    const selected = vm.rows.flat().filter((c) => c.selected);
    expect(selected.map((c) => c.address)).toEqual(['C3']);
    expect(vm.activeCell).toBe('C3');
  });

  it('marks changed cells from the state set', () => {
    const vm = viewOf(stateOf({ changed: new Set(['D4']) }), ENV);
    expect(cellAt(vm, 'D4').changed).toBe(true);
    expect(cellAt(vm, 'D5').changed).toBe(false);
  });
});

describe('viewOf name box and formula', () => {
  it('shows the address with a Cell_Name', () => {
    expect(viewOf(stateOf({ selection: 'B14' }), ENV).nameBox).toBe('B14 MOVE_M1');
  });

  it('shows only the address without a Cell_Name', () => {
    expect(viewOf(stateOf({ selection: 'C3' }), ENV).nameBox).toBe('C3');
  });

  it('is writable on an unlocked cell while playing', () => {
    const vm = viewOf(stateOf({ selection: 'B14' }), ENV);
    expect(vm.formula.text).toBe('="-"');
    expect(vm.formula.readOnly).toBe(false);
    expect(vm.formula.locked).toBe(false);
  });

  it('is read-only and locked on a locked cell', () => {
    const vm = viewOf(stateOf({ selection: 'B18' }), ENV);
    expect(vm.formula.readOnly).toBe(true);
    expect(vm.formula.locked).toBe(true);
  });

  it('is read-only but not locked when the run is not playing', () => {
    for (const run of [wonRun(), lostRun()]) {
      const vm = viewOf(stateOf({ run, selection: 'B14' }), ENV);
      expect(vm.formula.readOnly).toBe(true);
      expect(vm.formula.locked).toBe(false);
    }
  });

  it('shows the pending edit text and the alert', () => {
    const vm = viewOf(stateOf({ selection: 'B14', edit: { text: '=1+' }, alert: 'Col 4: bad.' }), ENV);
    expect(vm.formula.text).toBe('=1+');
    expect(vm.formula.alert).toBe('Col 4: bad.');
  });
});

describe('viewOf status, screen and buttons', () => {
  it('shows label, HP, ink and turn', () => {
    const vm = viewOf(stateOf(), ENV);
    expect(vm.status).toEqual({
      label: 'Sheet1: Test level',
      hp: 'HP 7/7',
      ink: 'Ink 3/3',
      turn: 'Turn 0',
    });
    expect(vm.screen).toBe('playing');
    expect(vm.banner).toBeUndefined();
    expect(vm.message).toBe('A hint.');
  });

  it('clamps HP at 0 on the lost screen and shows the banner', () => {
    const run = lostRun();
    expect(run.hp).toBeLessThanOrEqual(0);
    const vm = viewOf(stateOf({ run }), ENV);
    expect(vm.status.hp).toBe('HP 0/1');
    expect(vm.screen).toBe('lost');
    expect(vm.banner?.kind).toBe('lost');
    expect(vm.banner?.body).toBe('GRIMSHEET.XLS has stopped responding');
  });

  it('shows a banner only on the lost screen', () => {
    expect(viewOf(stateOf({ run: wonRun() }), ENV).banner).toBeUndefined();
  });

  it('enables Undo only after a turn while playing', () => {
    expect(viewOf(stateOf(), ENV).buttons.undoEnabled).toBe(false);
    const moved = act(start(), { kind: 'wait' });
    expect(viewOf(stateOf({ run: moved }), ENV).buttons.undoEnabled).toBe(true);
  });

  it('disables Undo on won and lost', () => {
    expect(viewOf(stateOf({ run: wonRun() }), ENV).buttons.undoEnabled).toBe(false);
    expect(viewOf(stateOf({ run: lostRun() }), ENV).buttons.undoEnabled).toBe(false);
  });

  it('shows Next only on won with a next level', () => {
    expect(viewOf(stateOf({ run: wonRun() }), ENV).buttons.nextVisible).toBe(true);
    expect(viewOf(stateOf({ run: wonRun(), levelIndex: 2 }), ENV).buttons.nextVisible).toBe(false);
    expect(viewOf(stateOf(), ENV).buttons.nextVisible).toBe(false);
  });

  it('keeps Recover enabled with a run', () => {
    expect(viewOf(stateOf(), ENV).buttons.recoverEnabled).toBe(true);
  });
});

describe('viewOf tabs', () => {
  it('enables cleared levels and the first uncleared level only', () => {
    const progress: Progress = { version: 1, cleared: ['01-level'], current: null };
    const vm = viewOf(stateOf({ progress }), ENV);
    expect(vm.tabs.map((t) => t.enabled)).toEqual([true, true, false]);
    expect(vm.tabs.map((t) => t.label)).toEqual([
      'Sheet1: Level 1',
      'Sheet2: Level 2',
      'Sheet3: Level 3',
    ]);
  });

  it('enables only the first tab with no progress', () => {
    expect(viewOf(stateOf(), ENV).tabs.map((t) => t.enabled)).toEqual([true, false, false]);
  });

  it('marks exactly one tab as current', () => {
    const vm = viewOf(stateOf({ levelIndex: 1 }), ENV);
    expect(vm.tabs.map((t) => t.current)).toEqual([false, true, false]);
  });
});

describe('viewOf without a run', () => {
  it('gives empty cells and disabled Undo and Recover', () => {
    const vm = viewOf(stateOf({ run: undefined }), ENV);
    expect(vm.rows.flat()).toHaveLength(228);
    expect(vm.rows.flat().every((c) => c.text === '' && c.entity === undefined)).toBe(true);
    expect(vm.rows.flat().every((c) => !c.locked && c.errorKind === undefined)).toBe(true);
    expect(vm.buttons.undoEnabled).toBe(false);
    expect(vm.buttons.recoverEnabled).toBe(false);
    expect(vm.screen).toBe('playing');
    expect(vm.formula.readOnly).toBe(true);
    expect(vm.status.label).toBe('Sheet1: Level 1');
  });

  it('gives empty ghostCells and undefined explanation', () => {
    const vm = viewOf(stateOf({ run: undefined, selection: 'G3' }), ENV);
    expect(vm.ghostCells).toEqual([]);
    expect(vm.explanation).toBeUndefined();
  });
});

describe('viewOf equality', () => {
  it('gives equal view models for equal states', () => {
    const run = start();
    const a = viewOf(stateOf({ run }), ENV);
    const b = viewOf(stateOf({ run }), ENV);
    expect(a).toEqual(b);
    expect(viewOf(stateOf({ run: start() }), ENV)).toEqual(a);
  });
});

describe('changedAddresses', () => {
  it('is empty when prev is undefined', () => {
    expect(changedAddresses(undefined, start()).size).toBe(0);
  });

  it('marks a changed terrain Value', () => {
    const prev = start();
    const next = act(prev, { kind: 'edit', address: 'D4', raw: '#' });
    expect([...changedAddresses(prev, next)]).toEqual(['D4']);
  });

  it('marks an error kind change', () => {
    const prev = act(start(), { kind: 'edit', address: 'D4', raw: '=1/0' });
    const next = act(prev, { kind: 'edit', address: 'D4', raw: '=NOPE()' });
    expect(cellKind(prev, 'D4')).toBe('#DIV/0!');
    expect(cellKind(next, 'D4')).toBe('#NAME?');
    expect([...changedAddresses(prev, next)]).toContain('D4');
  });

  it('does not mark a same-Value Raw_Text change', () => {
    const prev = start();
    const next = act(prev, { kind: 'edit', address: 'D4', raw: '="."' });
    expect(cellAt(viewOf(stateOf({ run: next }), ENV), 'D4').text).toBe('.');
    expect(changedAddresses(prev, next).has('D4')).toBe(false);
  });
});

function cellKind(run: RunState, address: string): string {
  const vm = viewOf(stateOf({ run }), ENV);
  return cellAt(vm, address).errorKind ?? '';
}

describe('moveSelection', () => {
  it('clamps at all four edges', () => {
    expect(moveSelection('A5', 'W')).toBe('A5');
    expect(moveSelection('L5', 'E')).toBe('L5');
    expect(moveSelection('C1', 'N')).toBe('C1');
    expect(moveSelection('C20', 'S')).toBe('C20');
  });

  it('moves one step inside the grid', () => {
    expect(moveSelection('C5', 'W')).toBe('B5');
    expect(moveSelection('C5', 'E')).toBe('D5');
    expect(moveSelection('C5', 'N')).toBe('C4');
    expect(moveSelection('C5', 'S')).toBe('C6');
  });

  it('skips row 13 in both directions', () => {
    expect(moveSelection('C12', 'S')).toBe('C14');
    expect(moveSelection('C14', 'N')).toBe('C12');
  });
});
