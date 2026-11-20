import { describe, expect, it } from 'vitest';
import { formatValue } from '../engine/index';
import { applyAction, cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { Action, RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import {
  describeLimit,
  describeStep,
  finalSnapshot,
  loadLevelFile,
  lockReport,
  manhattan,
  readSolution,
  replay,
  searchEditFree,
  stateKey,
  walkableCount,
} from './helpers';
import type { SearchLimits } from './helpers';

const ID = '06-the-audit';

function started(doc: unknown = loadLevelFile(ID).doc): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error('startRun refused level 6');
  return result.state;
}

function shown(state: RunState, address: string): string {
  const value = cellValue(state, address);
  return value === undefined ? '-' : formatValue(value);
}

function edit(state: RunState, address: string, raw: string): RunState {
  const result = applyAction(state, { kind: 'edit', address, raw });
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  return result.state;
}

const NAMED: readonly { address: string; name: string; raw: string; locked: boolean }[] = [
  { address: 'B14', name: 'MOVE_M1', raw: '=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")', locked: true },
  { address: 'B15', name: 'ATK_M1', raw: '=SUM(B16:B17)', locked: true },
  { address: 'B16', name: 'BASE_CHARGE', raw: '1', locked: true },
  { address: 'B17', name: 'LIVE_CHARGE', raw: '2', locked: false },
  { address: 'B18', name: 'UNFILED_CHARGE', raw: '2', locked: false },
];

const SEARCH_LIMITS: SearchLimits = { maxDepth: 100, maxStates: 1000 };
const MOVES: readonly Action[] = [
  { kind: 'move', dir: 'N' },
  { kind: 'move', dir: 'S' },
  { kind: 'move', dir: 'E' },
  { kind: 'move', dir: 'W' },
  { kind: 'wait' },
];

/** Breadth-first search over moves and waits from an already edited state. */
function searchAfterEdit(
  start: RunState,
  limits: SearchLimits,
): { outcome: 'exhausted' | 'won' | 'limit'; states: number; expansions: number } {
  const seen = new Set<string>([stateKey(start)]);
  let frontier: RunState[] = [start];
  let depth = 0;
  let expansions = 0;
  while (frontier.length > 0) {
    if (depth >= limits.maxDepth) return { outcome: 'limit', states: seen.size, expansions };
    const next: RunState[] = [];
    for (const state of frontier) {
      if (state.status !== 'playing') continue;
      expansions += 1;
      for (const action of MOVES) {
        const result = applyAction(state, action);
        if (!result.ok) continue;
        if (result.state.status === 'won') return { outcome: 'won', states: seen.size, expansions };
        const key = stateKey(result.state);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > limits.maxStates) return { outcome: 'limit', states: seen.size, expansions };
        next.push(result.state);
      }
    }
    frontier = next;
    depth += 1;
  }
  return { outcome: 'exhausted', states: seen.size, expansions };
}

describe('level 6, The Audit', () => {
  const file = loadLevelFile(ID);

  it('loads, starts with 6 HP and 1 ink, and matches its serialized text', () => {
    const state = started();
    expect(state.hp).toBe(6);
    expect(state.ink).toBe(1);
    expect(state.status).toBe('playing');
    expect(file.text).toBe(serializeLevelText(file.level));
    expect(file.text.includes('\r')).toBe(false);
    expect(file.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('has the raw text, name and lock flag of every named cell', () => {
    const state = started();
    for (const cell of NAMED) {
      expect(cellRawText(state, cell.address), cell.name).toBe(cell.raw);
      expect(cellName(state, cell.address), cell.address).toBe(cell.name);
      expect(isCellLocked(state, cell.address), cell.name).toBe(cell.locked);
    }
    const report = lockReport(state);
    expect(report.openMapCells).toEqual([]);
    expect(report.openLabelCells).toEqual([]);
    expect([...report.openCells].sort()).toEqual(['LIVE_CHARGE', 'UNFILED_CHARGE']);
  });

  it('has one monster M1 at J7, the hero at B8 and the exit at J4', () => {
    const state = started();
    expect(file.level.monsters).toHaveLength(1);
    expect(state.monsters).toHaveLength(1);
    expect(state.monsters[0]?.id).toBe('M1');
    expect(state.monsters[0]?.at).toBe('J7');
    expect(state.monsters[0]?.move).toBe('MOVE_M1');
    expect(state.monsters[0]?.atk).toBe('ATK_M1');
    expect(state.hero).toBe('B8');
    expect(shown(state, 'J4')).toBe('X');
  });

  it('has the title, tab label, hint, seed and short panel labels', () => {
    const state = started();
    expect(file.level.title).toBe('The Audit');
    expect(tabLabel(file.level)).toBe('Sheet6: The Audit');
    expect(file.level.hint).toContain('ATK_M1');
    expect(file.level.hint).toContain('SUM');
    expect(file.level.hint.length).toBeGreaterThanOrEqual(1);
    expect(file.level.hint.length).toBeLessThanOrEqual(120);
    expect(file.level.seed).toBe(6);
    for (let row = 14; row <= 18; row += 1) {
      const label = cellRawText(state, `A${row}`) ?? '';
      expect(label.length, `A${row}`).toBeGreaterThanOrEqual(1);
      expect(label.length, `A${row}`).toBeLessThanOrEqual(24);
    }
  });

  it('uses no RAND and keeps the walkable area small', () => {
    const state = started();
    for (const cell of file.level.cells) expect(cell.raw.toUpperCase(), cell.address).not.toContain('RAND');
    const count = walkableCount(state);
    expect(count).toBe(41);
    expect(count).toBeLessThanOrEqual(60);
  });

  it('bills 3 at load; only LIVE_CHARGE changes it; movement ignores both edits', () => {
    const state = started();
    expect(shown(state, 'B15')).toBe('3');
    const live = edit(state, 'B17', '-1');
    expect(shown(live, 'B15')).toBe('0');
    expect(shown(live, 'B14')).toBe(shown(state, 'B14'));
    const decoy = edit(state, 'B18', '-1');
    expect(shown(decoy, 'B15')).toBe('3');
    expect(shown(decoy, 'B14')).toBe(shown(state, 'B14'));
  });

  it('replays the stored solution to a win and replays deterministically', () => {
    const solution = readSolution(ID);
    expect(solution.levelId).toBe(ID);
    expect(solution.minimalInk).toBe(1);
    expect(solution.actions).toHaveLength(13);
    const run = replay(file.doc, solution.actions);
    const lines = run.steps.map((s) => describeStep(ID, s)).join('\n');
    expect(run.refusedAt, lines).toBeUndefined();
    for (const step of run.steps) {
      expect(step.result.ok).toBe(true);
      expect(step.state.hp).toBeGreaterThan(0);
      expect(step.state.ink).toBeGreaterThanOrEqual(0);
    }
    expect(run.final.status).toBe('won');
    expect(run.final.hero).toBe('J4');
    expect(run.final.ink).toBe(0);
    expect(run.final.hp).toBe(6);
    expect(finalSnapshot(replay(file.doc, solution.actions).final)).toEqual(finalSnapshot(run.final));
  });

  it('keeps M1 off the stored route and on J7 through the first twelve actions', () => {
    const run = replay(file.doc, readSolution(ID).actions);
    const route = [run.start.hero, ...run.steps.map((s) => s.state.hero)];
    run.steps.forEach((step, i) => {
      const monster = step.state.monsters[0]?.at;
      expect(monster, `after action ${i + 1}`).not.toBe(route[i + 1]);
      if (i < 12) expect(monster, `after action ${i + 1}`).toBe('J7');
      if (step.action.kind === 'move') expect(step.state.hero, `action ${i + 1}`).not.toBe(route[i]);
    });
  });

  it('refuses the first action with no ink and changes nothing', () => {
    const doc = JSON.parse(JSON.stringify(file.doc)) as { ink: number };
    doc.ink = 0;
    const run = replay(doc, readSolution(ID).actions);
    expect(run.refusedAt).toBe(0);
    const refused = run.steps[0]?.result;
    expect(refused?.ok).toBe(false);
    if (refused !== undefined && !refused.ok) expect(refused.reason).toBe('no-ink');
    expect(run.final.turn).toBe(0);
    expect(run.final.hp).toBe(6);
    expect(run.final.hero).toBe('B8');
  });

  it('cannot be won without an edit', () => {
    const result = searchEditFree(file.doc);
    if (result.outcome === 'limit') throw new Error(describeLimit(result, ID));
    expect(result.outcome).toBe('exhausted');
    expect(result.states).toBeGreaterThan(1);
    // Two accepted waits cost 3 + 3 against 6 HP, and the exit is 12 moves away.
    let state = started();
    for (let i = 0; i < 2; i += 1) {
      const next = applyAction(state, { kind: 'wait' });
      if (!next.ok) throw new Error('wait refused');
      state = next.state;
    }
    expect(state.status).toBe('lost');
    expect(manhattan('B8', 'J4')).toBe(12);
  });

  describe('candidate edits', () => {
    const CANDIDATES: readonly { address: 'B17' | 'B18'; raw: string; atk: string; wins: boolean }[] = [
      { address: 'B17', raw: '-1', atk: '0', wins: true },
      { address: 'B17', raw: '0', atk: '1', wins: false },
      { address: 'B17', raw: '1', atk: '2', wins: false },
      { address: 'B17', raw: '=1/0', atk: '#DIV/0!', wins: true },
      { address: 'B17', raw: '=MISSING', atk: '#REF!', wins: true },
      { address: 'B18', raw: '-1', atk: '3', wins: false },
      { address: 'B18', raw: '0', atk: '3', wins: false },
      { address: 'B18', raw: '1', atk: '3', wins: false },
      { address: 'B18', raw: '=1/0', atk: '3', wins: false },
      { address: 'B18', raw: '=MISSING', atk: '3', wins: false },
    ];
    for (const c of CANDIDATES) {
      it(
        `${c.address} = ${c.raw} ${c.wins ? 'wins' : 'does not win'}`,
        () => {
          const start = started();
          const edited = applyAction(start, { kind: 'edit', address: c.address, raw: c.raw });
          expect(edited.ok).toBe(true);
          if (!edited.ok) return;
          expect(shown(edited.state, 'B15')).toBe(c.atk);
          if (c.wins) {
            const actions = readSolution(ID).actions.map((a, i) => (i === 0 ? { ...a, raw: c.raw } : a)) as Action[];
            const run = replay(file.doc, actions);
            const lines = run.steps.map((s) => describeStep(ID, s)).join('\n');
            expect(run.refusedAt, lines).toBeUndefined();
            expect(run.final.status).toBe('won');
          } else {
            const result = searchAfterEdit(edited.state, SEARCH_LIMITS);
            if (result.outcome === 'limit') throw new Error(`inconclusive search for ${c.address} = ${c.raw}`);
            expect(result.outcome).toBe('exhausted');
          }
        },
        60_000,
      );
    }
  });
});
