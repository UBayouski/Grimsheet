import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type * as GameModule from '../game/index';
import { applyAction, startRun } from '../game/index';
import type { Direction as GameDirection, RunState, Status as GameStatus } from '../game/index';
import type { LevelDocument } from '../model/index';
import { createInitialState, keyContext, step } from './controller';
import { describeLevels, isTabEnabled } from './progress';
import { STRINGS } from './strings';
import type {
  AppState,
  Direction as UiDirection,
  Effect,
  Env,
  KeyCommand,
  Progress,
  Status as UiStatus,
  UiEvent,
} from './types';

vi.mock('../game/index', async (importOriginal) => {
  const actual = await importOriginal<typeof GameModule>();
  return { ...actual, startRun: vi.fn(actual.startRun) };
});

// Compile-time check: the local unions of types.ts and the game's are mutually assignable.
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const directionsMatch: Mutual<UiDirection, GameDirection> = true;
const statusesMatch: Mutual<UiStatus, GameStatus> = true;

const WALLS = '############';
const OPEN_ROW = '#..........#';

function makeDoc(overrides: Partial<LevelDocument> = {}): LevelDocument {
  return {
    schemaVersion: 1,
    id: '01-first',
    title: 'First',
    hint: 'First hint.',
    startingHp: 7,
    ink: 3,
    seed: 12345,
    hero: { at: 'B2' },
    monsters: [{ id: 'M1', at: 'F6', move: 'MOVE_M1', atk: 'ATK_M1' }],
    map: [
      WALLS,
      '#.X........#',
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      OPEN_ROW,
      WALLS,
    ],
    cells: [
      { address: 'A14', raw: 'Move 1', locked: true },
      { address: 'B14', raw: '="-"', name: 'MOVE_M1' },
      { address: 'A15', raw: 'Attack 1' },
      { address: 'B15', raw: '=0', name: 'ATK_M1' },
      { address: 'A16', raw: 'Hero row' },
      { address: 'B16', raw: '=ROW(HERO)', name: 'ROW_NOW' },
      { address: 'A18', raw: 'Trap' },
      { address: 'B18', raw: '=2', name: 'TRAP', locked: true },
    ],
    ...overrides,
  };
}

const DOC1 = makeDoc();
const DOC2 = makeDoc({ id: '02-second', title: 'Second', hint: 'Second hint.' });
const BAD_DOC = { id: '03-broken' };

const ENV: Env = { entries: describeLevels([DOC1, DOC2, BAD_DOC]) };
const NO_PROGRESS: Progress = { version: 1, cleared: [], current: null };
/** Level one cleared and current: tab two (the first uncleared level) is enabled. */
const SWITCH_PROGRESS: Progress = { version: 1, cleared: ['01-first'], current: '01-first' };

function command(c: KeyCommand): UiEvent {
  return { type: 'command', command: c };
}
const move = (dir: UiDirection): UiEvent => command({ type: 'move', dir });
const WAIT = command({ type: 'wait' });
const UNDO = command({ type: 'undo' });
const RESTART = command({ type: 'restart' });
const CONFIRM = command({ type: 'confirm' });
const CANCEL = command({ type: 'cancel' });
const NEXT = command({ type: 'next-level' });
const tab = (levelIndex: number): UiEvent => ({ type: 'tab', levelIndex });

function runOf(state: AppState): RunState {
  if (state.run === undefined) throw new Error('no run');
  return state.run;
}

function go(state: AppState, ...events: UiEvent[]): AppState {
  let current = state;
  for (const event of events) current = step(current, event, ENV).state;
  return current;
}

function fresh(progress: Progress = NO_PROGRESS): AppState {
  return createInitialState(ENV, progress);
}

function hasEffect(effects: readonly Effect[], type: Effect['type']): boolean {
  return effects.some((e) => e.type === type);
}

function trapEnv(startingHp: number): Env {
  const doc = makeDoc({
    startingHp,
    map: [WALLS, '#.^.......X#', ...Array.from({ length: 9 }, () => OPEN_ROW), WALLS],
  });
  return { entries: describeLevels([doc]) };
}

function stepIn(env: Env, state: AppState, ...events: UiEvent[]): AppState {
  let current = state;
  for (const event of events) current = step(current, event, env).state;
  return current;
}

function wonState(progress: Progress = NO_PROGRESS): AppState {
  return go(fresh(progress), move('E')); // B2 -> C2 is the exit
}

function lostState(): AppState {
  const env = trapEnv(1);
  return stepIn(env, createInitialState(env, NO_PROGRESS), move('E'));
}

beforeEach(() => {
  vi.mocked(startRun).mockClear();
});

describe('type unions', () => {
  it('Direction and Status match the game', () => {
    expect(directionsMatch).toBe(true);
    expect(statusesMatch).toBe(true);
    expectTypeOf<UiDirection>().toEqualTypeOf<GameDirection>();
    expectTypeOf<UiStatus>().toEqualTypeOf<GameStatus>();
  });
});

describe('createInitialState', () => {
  it('starts the first level and sets Message, selection and progress.current', () => {
    const state = fresh();
    expect(state.levelIndex).toBe(0);
    expect(runOf(state).status).toBe('playing');
    expect(state.message).toBe('First hint.');
    expect(state.selection).toBe('B2');
    expect(state.progress.current).toBe('01-first');
    expect(state.changed.size).toBe(0);
    expect(state.edit).toBeUndefined();
    expect(state.pending).toBeUndefined();
    expect(state.alert).toBe('');
  });

  it('uses the saved current level when its tab is enabled', () => {
    const state = fresh({ version: 1, cleared: ['01-first'], current: '02-second' });
    expect(state.levelIndex).toBe(1);
    expect(state.message).toBe('Second hint.');
  });

  it('uses the first uncleared level when the saved current level is disabled', () => {
    const state = fresh({ version: 1, cleared: [], current: '02-second' });
    expect(state.levelIndex).toBe(0);
  });

  it('gives index 0 when every level is cleared', () => {
    const state = fresh({
      version: 1,
      cleared: ['01-first', '02-second', '03-broken'],
      current: null,
    });
    expect(state.levelIndex).toBe(0);
    expect(state.run).toBeDefined();
  });

  it('gives no run and the load-failed Message for an empty list', () => {
    const state = createInitialState({ entries: [] }, NO_PROGRESS);
    expect(state.run).toBeUndefined();
    expect(state.message).toBe(STRINGS.loadFailed);
  });

  it('gives no run when the start level fails to start', () => {
    const state = fresh({ version: 1, cleared: ['01-first', '02-second'], current: '03-broken' });
    expect(state.levelIndex).toBe(2);
    expect(state.run).toBeUndefined();
    expect(state.message).toBe(STRINGS.loadFailed);
  });
});

describe('move and wait', () => {
  it('accepts a move and shows the level hint after a quiet turn', () => {
    const before = fresh();
    const result = step(before, move('S'), ENV);
    expect(runOf(result.state).hero).toBe('B3');
    expect(runOf(result.state).turn).toBe(1);
    expect(result.state.message).toBe('First hint.');
    expect(result.effects).toEqual([]);
    expect(runOf(before).hero).toBe('B2');
  });

  it('accepts a wait', () => {
    const state = go(fresh(), WAIT);
    expect(runOf(state).turn).toBe(1);
    expect(runOf(state).hero).toBe('B2');
    expect(state.message).toBe('First hint.');
  });

  it('returns the same state object for a blocked move', () => {
    const before = fresh();
    const result = step(before, move('N'), ENV);
    expect(result.state).toBe(before);
    expect(result.effects).toEqual([]);
  });

  it('returns the same state object for an occupied move', () => {
    const doc = makeDoc({ monsters: [{ id: 'M1', at: 'B3', move: 'MOVE_M1', atk: 'ATK_M1' }] });
    const env: Env = { entries: describeLevels([doc]) };
    const before = createInitialState(env, NO_PROGRESS);
    const result = step(before, move('S'), env);
    expect(result.state).toBe(before);
  });

  it('shows the game message for any other refusal', () => {
    const before = fresh();
    const refusal = applyAction(runOf(before), { kind: 'undo' });
    expect(refusal.ok).toBe(false);
    const result = step(before, UNDO, ENV);
    expect(refusal.ok ? '' : result.state.message).toBe(refusal.ok ? '' : refusal.message);
    expect(runOf(result.state)).toBe(runOf(before));
  });

  it('ignores a move on the won screen', () => {
    const won = wonState();
    expect(step(won, move('S'), ENV).state).toBe(won);
    expect(step(won, WAIT, ENV).state).toBe(won);
  });

  it('ignores commands when no run is loaded', () => {
    const state = createInitialState({ entries: [] }, NO_PROGRESS);
    expect(step(state, move('S'), ENV).state).toBe(state);
    expect(step(state, RESTART, ENV).state).toBe(state);
    expect(step(state, command({ type: 'select-move', dir: 'E' }), ENV).state).toBe(state);
  });
});

describe('damage messages', () => {
  it('shows the damage summary, then the hint after a quiet turn', () => {
    const env = trapEnv(7);
    const start = createInitialState(env, NO_PROGRESS);
    const hit = stepIn(env, start, move('E'));
    expect(runOf(hit).hp).toBe(5);
    expect(hit.message).toBe('-2 HP: trap');
    const quiet = stepIn(env, hit, move('E'));
    expect(quiet.message).toBe('First hint.');
  });

  it('keeps the damage summary on a loss', () => {
    const lost = lostState();
    expect(runOf(lost).status).toBe('lost');
    expect(lost.message).toBe('-2 HP: trap');
  });

  it('ignores moves on the lost screen', () => {
    const lost = lostState();
    expect(step(lost, move('W'), trapEnv(1)).state).toBe(lost);
  });
});

describe('undo', () => {
  it('reverts the last turn and sets Undone.', () => {
    const moved = go(fresh(), move('S'));
    const undone = go(moved, UNDO);
    expect(runOf(undone).hero).toBe('B2');
    expect(runOf(undone).turn).toBe(0);
    expect(undone.message).toBe(STRINGS.undone);
  });

  it('is ignored on the won screen', () => {
    const won = wonState();
    expect(step(won, UNDO, ENV).state).toBe(won);
  });
});

describe('win', () => {
  it('shows the won message, enables the next tab and emits save-progress', () => {
    const result = step(fresh(), move('E'), ENV);
    expect(runOf(result.state).status).toBe('won');
    expect(result.state.message).toBe(STRINGS.won);
    expect(result.state.progress.cleared).toEqual(['01-first']);
    expect(isTabEnabled(ENV.entries, result.state.progress.cleared, 1)).toBe(true);
    const save = result.effects.find((e) => e.type === 'save-progress');
    expect(save).toEqual({ type: 'save-progress', progress: result.state.progress });
  });

  it('uses the last-level message on the last level', () => {
    const single: Env = { entries: describeLevels([DOC1]) };
    const won = stepIn(single, createInitialState(single, NO_PROGRESS), move('E'));
    expect(won.message).toBe(STRINGS.wonLast);
  });

  it('does not duplicate a cleared id', () => {
    const won = wonState({ version: 1, cleared: ['01-first'], current: '01-first' });
    expect(won.progress.cleared).toEqual(['01-first']);
  });
});

describe('selection', () => {
  it('select-move moves the selection and clears alert', () => {
    const base: AppState = { ...fresh(), alert: 'Col 1: bad.' };
    const next = go(base, command({ type: 'select-move', dir: 'E' }));
    expect(next.selection).toBe('C2');
    expect(next.alert).toBe('');
  });

  it('select-move skips row 13', () => {
    const base: AppState = { ...fresh(), selection: 'B12' };
    const next = go(base, command({ type: 'select-move', dir: 'S' }));
    expect(next.selection).toBe('B14');
  });

  it('cell-click selects a valid cell and canonicalises it', () => {
    const next = go(fresh(), { type: 'cell-click', address: 'b15' });
    expect(next.selection).toBe('B15');
  });

  it('cell-click ignores row 13 and bad addresses', () => {
    const before = fresh();
    for (const address of ['B13', 'A13', 'M1', 'A21', '', 'zz', 'A0']) {
      expect(step(before, { type: 'cell-click', address }, ENV).state).toBe(before);
    }
  });
});

describe('changed set', () => {
  it('is kept across selection moves and replaced on the next accepted Action', () => {
    const moved = go(fresh(), move('S'));
    expect([...moved.changed]).toEqual(['B16']);
    const selected = go(
      moved,
      command({ type: 'select-move', dir: 'E' }),
      { type: 'cell-click', address: 'D4' },
    );
    expect(selected.changed).toBe(moved.changed);
    const waited = go(selected, WAIT);
    expect(waited.changed.size).toBe(0);
  });

  it('is emptied on a level start', () => {
    const moved = go(fresh(), move('S'));
    expect(moved.changed.size).toBe(1);
    const restarted = go(moved, RESTART, RESTART);
    expect(restarted.changed.size).toBe(0);
  });
});

describe('restart confirmation', () => {
  it('prompts on the first restart and remembers the Message', () => {
    const before = go(fresh(), move('S'));
    const result = step(before, RESTART, ENV);
    expect(result.state.pending).toEqual({
      kind: 'restart',
      levelIndex: 0,
      restoreMessage: before.message,
    });
    expect(result.state.message).toBe(STRINGS.confirmRestart);
    expect(result.effects).toEqual([]);
    expect(runOf(result.state)).toBe(runOf(before));
  });

  it('restarts on the same command repeated', () => {
    const prompted = go(fresh(), move('S'), RESTART);
    const result = step(prompted, RESTART, ENV);
    expect(result.state.pending).toBeUndefined();
    expect(runOf(result.state).turn).toBe(0);
    expect(runOf(result.state).hero).toBe('B2');
    expect(result.state.message).toBe('First hint.');
    expect(hasEffect(result.effects, 'save-progress')).toBe(true);
    expect(result.effects).toContainEqual({ type: 'focus', target: 'grid' });
  });

  it('restarts on confirm', () => {
    const state = go(fresh(), move('S'), RESTART, CONFIRM);
    expect(runOf(state).turn).toBe(0);
    expect(state.pending).toBeUndefined();
  });

  it('restarts when the current tab is clicked while the restart prompt shows', () => {
    const state = go(fresh(), move('S'), RESTART, tab(0));
    expect(runOf(state).turn).toBe(0);
    expect(state.pending).toBeUndefined();
  });

  it('a tab click on the current level is a restart prompt', () => {
    const state = go(fresh(), move('S'), tab(0));
    expect(state.pending?.kind).toBe('restart');
    expect(state.message).toBe(STRINGS.confirmRestart);
  });

  it('cancel restores the Message', () => {
    const before = go(fresh(), move('S'));
    const cancelled = go(before, RESTART, CANCEL);
    expect(cancelled.pending).toBeUndefined();
    expect(cancelled.message).toBe(before.message);
    expect(runOf(cancelled)).toBe(runOf(before));
  });

  it('another key clears the prompt and applies no Action', () => {
    const before = go(fresh(), move('S'));
    const after = go(before, RESTART, move('S'));
    expect(after.pending).toBeUndefined();
    expect(after.message).toBe(before.message);
    expect(runOf(after)).toBe(runOf(before));
  });

  it('dismiss-pending restores the Message', () => {
    const before = go(fresh(), move('S'));
    const after = go(before, RESTART, { type: 'dismiss-pending' });
    expect(after.pending).toBeUndefined();
    expect(after.message).toBe(before.message);
  });

  it('dismiss-pending without a prompt changes nothing', () => {
    const before = fresh();
    expect(step(before, { type: 'dismiss-pending' }, ENV).state).toBe(before);
  });

  it('a click on Undo while a prompt shows clears the prompt without undoing', () => {
    const before = go(fresh(), move('S'));
    const after = go(before, RESTART, UNDO);
    expect(after.pending).toBeUndefined();
    expect(after.message).toBe(before.message);
    expect(runOf(after)).toBe(runOf(before));
    expect(runOf(after).turn).toBe(1);
  });

  it('a cell click clears the prompt and still selects', () => {
    const before = go(fresh(), move('S'));
    const after = go(before, RESTART, { type: 'cell-click', address: 'D5' });
    expect(after.pending).toBeUndefined();
    expect(after.message).toBe(before.message);
    expect(after.selection).toBe('D5');
  });

  it('confirm without a prompt does nothing', () => {
    const before = fresh();
    expect(step(before, CONFIRM, ENV).state).toBe(before);
    expect(step(before, CANCEL, ENV).state).toBe(before);
  });
});

describe('tab switch confirmation', () => {
  it('prompts, then switches on the repeated tab click', () => {
    const base = fresh(SWITCH_PROGRESS);
    expect(base.levelIndex).toBe(0);
    const prompted = step(base, tab(1), ENV);
    expect(prompted.state.pending).toEqual({
      kind: 'switch',
      levelIndex: 1,
      restoreMessage: base.message,
    });
    expect(prompted.state.message).toBe(STRINGS.confirmSwitch(ENV.entries[1]?.label ?? ''));
    const switched = step(prompted.state, tab(1), ENV);
    expect(switched.state.levelIndex).toBe(1);
    expect(switched.state.pending).toBeUndefined();
    expect(switched.state.message).toBe('Second hint.');
    expect(switched.state.progress.current).toBe('02-second');
    expect(hasEffect(switched.effects, 'save-progress')).toBe(true);
  });

  it('switches on confirm', () => {
    const state = go(fresh(SWITCH_PROGRESS), tab(1), CONFIRM);
    expect(state.levelIndex).toBe(1);
  });

  it('a restart command while a switch prompt shows clears it and applies no Action', () => {
    const base = fresh(SWITCH_PROGRESS);
    const after = go(base, tab(1), RESTART);
    expect(after.pending).toBeUndefined();
    expect(after.levelIndex).toBe(0);
    expect(after.message).toBe(base.message);
  });

  it('another tab while a switch prompt shows clears it', () => {
    const base = fresh(SWITCH_PROGRESS);
    const after = go(base, tab(1), tab(0));
    expect(after.pending).toBeUndefined();
    expect(after.levelIndex).toBe(0);
    expect(runOf(after)).toBe(runOf(base));
  });

  it('Escape restores the Message', () => {
    const base = fresh(SWITCH_PROGRESS);
    const after = go(base, tab(1), CANCEL);
    expect(after.pending).toBeUndefined();
    expect(after.message).toBe(base.message);
  });

  it('ignores a disabled tab with no startRun call and no state change', () => {
    const base = fresh();
    vi.mocked(startRun).mockClear();
    for (const levelIndex of [1, 2, 3, -1]) {
      const result = step(base, tab(levelIndex), ENV);
      expect(result.state).toBe(base);
      expect(result.effects).toEqual([]);
    }
    expect(startRun).not.toHaveBeenCalled();
  });

  it('keeps the old run when the new level fails to start', () => {
    const base = fresh({ version: 1, cleared: ['01-first', '02-second'], current: '01-first' });
    expect(base.levelIndex).toBe(0);
    const prompted = go(base, tab(2));
    const after = step(prompted, tab(2), ENV);
    expect(after.state.run).toBe(base.run);
    expect(after.state.levelIndex).toBe(0);
    expect(after.state.selection).toBe(base.selection);
    expect(after.state.progress).toBe(base.progress);
    expect(after.state.pending).toBeUndefined();
    expect(after.state.message).toBe(STRINGS.loadFailed);
    expect(after.effects).toEqual([]);
  });
});

describe('won and lost screens', () => {
  it('restart happens at once on the won screen', () => {
    const won = wonState();
    const result = step(won, RESTART, ENV);
    expect(result.state.pending).toBeUndefined();
    expect(runOf(result.state).status).toBe('playing');
    expect(runOf(result.state).turn).toBe(0);
    expect(hasEffect(result.effects, 'focus')).toBe(true);
  });

  it('restart happens at once on the lost screen', () => {
    const env = trapEnv(1);
    const lost = lostState();
    const result = step(lost, RESTART, env);
    expect(result.state.pending).toBeUndefined();
    expect(runOf(result.state).status).toBe('playing');
    expect(runOf(result.state).hp).toBe(1);
  });

  it('a switch happens at once on the won screen', () => {
    const won = wonState();
    const result = step(won, tab(1), ENV);
    expect(result.state.levelIndex).toBe(1);
    expect(result.state.pending).toBeUndefined();
  });

  it('the current tab restarts at once on the lost screen', () => {
    const env = trapEnv(1);
    const result = step(lostState(), tab(0), env);
    expect(runOf(result.state).status).toBe('playing');
  });
});

describe('next-level', () => {
  it('starts the next level from the won screen', () => {
    const next = go(wonState(), NEXT);
    expect(next.levelIndex).toBe(1);
    expect(runOf(next).status).toBe('playing');
    expect(next.message).toBe('Second hint.');
    expect(next.progress.cleared).toEqual(['01-first']);
    expect(next.progress.current).toBe('02-second');
  });

  it('is ignored when the screen is not won', () => {
    const before = fresh();
    expect(step(before, NEXT, ENV).state).toBe(before);
    const lost = lostState();
    expect(step(lost, NEXT, trapEnv(1)).state).toBe(lost);
  });

  it('is ignored on the last level', () => {
    const single: Env = { entries: describeLevels([DOC1]) };
    const won = stepIn(single, createInitialState(single, NO_PROGRESS), move('E'));
    expect(step(won, NEXT, single).state).toBe(won);
  });
});

describe('edit fields', () => {
  it('part A leaves edit fields untouched', () => {
    const base: AppState = { ...fresh(), edit: { text: 'abc' } };
    const after = go(base, command({ type: 'select-move', dir: 'E' }), WAIT);
    expect(after.edit).toEqual({ text: 'abc' });
  });
});

describe('keyContext', () => {
  it('describes a playing level', () => {
    expect(keyContext(fresh(), ENV, 'other')).toEqual({
      screen: 'playing',
      focus: 'other',
      editing: false,
      pending: undefined,
      hasNext: true,
    });
  });

  it('describes the won and lost screens', () => {
    expect(keyContext(wonState(), ENV, 'button').screen).toBe('won');
    expect(keyContext(wonState(), ENV, 'button').focus).toBe('button');
    expect(keyContext(lostState(), trapEnv(1), 'other')).toMatchObject({
      screen: 'lost',
      hasNext: false,
    });
  });

  it('describes no run', () => {
    const empty = createInitialState({ entries: [] }, NO_PROGRESS);
    expect(keyContext(empty, { entries: [] }, 'other')).toMatchObject({
      screen: 'none',
      hasNext: false,
    });
  });

  it('describes a pending prompt and Edit_Mode', () => {
    const prompted = go(fresh(), move('S'), RESTART);
    expect(keyContext(prompted, ENV, 'other').pending).toBe('restart');
    const switching = go(fresh(SWITCH_PROGRESS), tab(1));
    expect(keyContext(switching, ENV, 'other').pending).toBe('switch');
    const editing: AppState = { ...fresh(), edit: { text: 'x' } };
    expect(keyContext(editing, ENV, 'text').editing).toBe(true);
  });

  it('hasNext is false on the last level', () => {
    const last = fresh({ version: 1, cleared: ['01-first', '02-second'], current: null });
    expect(keyContext(fresh(), ENV, 'other').hasNext).toBe(true);
    expect(keyContext(last, ENV, 'other').hasNext).toBe(false);
  });
});

describe('purity', () => {
  it('never mutates a received Run_State or state', () => {
    const start = fresh();
    const run = runOf(start);
    const snapshot = structuredClone(run);
    const events: UiEvent[] = [
      move('S'),
      move('N'),
      WAIT,
      UNDO,
      RESTART,
      CONFIRM,
      CANCEL,
      NEXT,
      tab(0),
      tab(1),
      { type: 'cell-click', address: 'C3' },
      command({ type: 'select-move', dir: 'S' }),
      { type: 'dismiss-pending' },
    ];
    let state = start;
    for (const event of events) {
      step(state, event, ENV);
      state = step(state, event, ENV).state;
    }
    expect(run).toEqual(snapshot);
    expect(runOf(start)).toBe(run);
    expect(start.selection).toBe('B2');
    expect(start.changed.size).toBe(0);
  });
});
