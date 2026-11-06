import { describe, expect, it } from 'vitest';
import { formatValue } from '../engine/index';
import { applyAction, cellName, cellRawText, cellValue, isCellLocked, startRun } from '../game/index';
import type { Action, DamageLog, RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import { describeStep, loadLevelFile, lockReport, manhattan, readSolution, replay, walkableCount } from './helpers';

const ID = '05-the-lich';
const COLUMNS = 'ABCDEFGHIJKL';

function started(doc: unknown = loadLevelFile(ID).doc): RunState {
  const result = startRun(doc);
  if (!result.ok) throw new Error('startRun refused level 5');
  return result.state;
}

function step(state: RunState, action: Action): { state: RunState; damage: DamageLog } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  return { state: result.state, damage: result.damage };
}

function shown(state: RunState, address: string): string {
  const value = cellValue(state, address);
  return value === undefined ? '-' : formatValue(value);
}

const NAMED: readonly { address: string; name: string; raw: string; locked: boolean }[] = [
  { address: 'B14', name: 'MOVE_M1', raw: '=IF(DIST(HERO,SELF)<4,TOWARD(HERO),"-")', locked: true },
  { address: 'B15', name: 'ATK_M1', raw: '=IF(DIST(HERO,SELF)<=2,LICH_HP,0)', locked: true },
  { address: 'B16', name: 'LICH_HP', raw: '=MAX(1,PHYLACTERY)', locked: false },
  { address: 'B17', name: 'PHYLACTERY', raw: '4', locked: true },
  { address: 'B18', name: 'HEX_A', raw: '=HEX_B+1', locked: false },
  { address: 'B19', name: 'HEX_B', raw: '=HEX_A+1', locked: false },
];

/** Loss_Variant as data: four moves east, then both edits. */
const LOSS_VARIANT: readonly Action[] = [
  { kind: 'move', dir: 'E' },
  { kind: 'move', dir: 'E' },
  { kind: 'move', dir: 'E' },
  { kind: 'move', dir: 'E' },
  { kind: 'edit', address: 'B16', raw: '0' },
  { kind: 'edit', address: 'B19', raw: '0' },
];

describe('level 5, The Lich', () => {
  const file = loadLevelFile(ID);

  it('loads, starts and matches its serialized text', () => {
    const state = started();
    expect(state.hp).toBe(6);
    expect(state.ink).toBe(2);
    expect(state.status).toBe('playing');
    expect(file.text).toBe(serializeLevelText(file.level));
  });

  it('has the raw text, name and lock flag of every named cell', () => {
    const state = started();
    for (const cell of NAMED) {
      expect(cellRawText(state, cell.address), cell.name).toBe(cell.raw);
      expect(cellName(state, cell.address), cell.address).toBe(cell.name);
      expect(isCellLocked(state, cell.address), cell.name).toBe(cell.locked);
    }
    expect(cellRawText(state, 'K4')).toBe('=IF(LICH_HP<=0,"X","#")');
    expect(isCellLocked(state, 'K4')).toBe(true);
  });

  it('has a locked label of 1 to 24 characters beside each panel row', () => {
    const state = started();
    for (let row = 14; row <= 19; row += 1) {
      const label = cellRawText(state, `A${row}`) ?? '';
      expect(label.length, `A${row}`).toBeGreaterThanOrEqual(1);
      expect(label.length, `A${row}`).toBeLessThanOrEqual(24);
      expect(isCellLocked(state, `A${row}`), `A${row}`).toBe(true);
    }
  });

  it('has exactly LICH_HP, HEX_A and HEX_B editable', () => {
    const editable = file.level.cells.filter((c) => c.locked !== true);
    expect(editable.map((c) => c.name).sort()).toEqual(['HEX_A', 'HEX_B', 'LICH_HP']);
  });

  it('starts with LICH_HP at 4, the gate shut and the hex cycle live', () => {
    const state = started();
    expect(shown(state, 'B16')).toBe('4');
    expect(shown(state, 'K4')).toBe('#');
    expect(shown(state, 'B18')).toBe('#CYCLE!');
    expect(shown(state, 'B19')).toBe('#CYCLE!');
  });

  it('has one monster M1 with MOVE_M1 and ATK_M1', () => {
    expect(file.level.monsters).toHaveLength(1);
    const state = started();
    expect(state.monsters).toHaveLength(1);
    expect(state.monsters[0]?.id).toBe('M1');
    expect(state.monsters[0]?.at).toBe('I6');
    expect(state.monsters[0]?.move).toBe('MOVE_M1');
    expect(state.monsters[0]?.atk).toBe('ATK_M1');
  });

  it('keeps the walkable area small', () => {
    const count = walkableCount(started());
    expect(count).toBe(49);
    expect(count).toBeLessThanOrEqual(60);
  });

  it('has the title, tab label and hint', () => {
    expect(file.level.title).toBe('The Lich');
    expect(tabLabel(file.level)).toBe('Sheet5: The Lich');
    expect(file.level.hint).toContain('LICH_HP');
    expect(file.level.hint.includes('HEX_A') || file.level.hint.includes('HEX_B')).toBe(true);
    expect(file.level.seed).toBe(5);
    expect(file.level.hero.at).toBe('B6');
  });

  it('puts the lich 7 cells from the hero on a straight line of floor', () => {
    const state = started();
    expect(manhattan(state.hero, 'I6')).toBe(7);
    for (const letter of 'CDEFGH') expect(shown(state, `${letter}6`), `${letter}6`).toBe('.');
  });

  it('needs at least 6 moves to reach the gate once it is open', () => {
    const opened = step(started(), { kind: 'edit', address: 'B16', raw: '0' }).state;
    expect(shown(opened, 'K4')).toBe('X');
    const walkable = (address: string): boolean => '.X^'.includes(shown(opened, address)) && shown(opened, address).length === 1;
    const dist = new Map<string, number>([[opened.hero, 0]]);
    const queue: string[] = [opened.hero];
    while (queue.length > 0) {
      const at = queue.shift() as string;
      const col = COLUMNS.indexOf(at.charAt(0));
      const row = Number(at.slice(1));
      const next = [
        [col - 1, row],
        [col + 1, row],
        [col, row - 1],
        [col, row + 1],
      ];
      for (const [c, r] of next) {
        if (c === undefined || r === undefined || c < 0 || c > 11 || r < 1 || r > 12) continue;
        const address = `${COLUMNS.charAt(c)}${r}`;
        if (dist.has(address) || !walkable(address)) continue;
        dist.set(address, (dist.get(at) ?? 0) + 1);
        queue.push(address);
      }
    }
    const route = dist.get('K4');
    expect(route).toBeDefined();
    expect(route ?? 0).toBeGreaterThanOrEqual(6);
    expect(route).toBe(11);
  });

  it('costs more HP to leave the cycle alone than the level gives', () => {
    const run = replay(file.doc, readSolution(ID).actions);
    const haunting = run.steps.filter((s) => s.result.ok && s.result.damage.some((d) => d.source.kind === 'haunt'));
    expect(haunting).toHaveLength(1);
    // Never breaking the cycle: one haunting turn now, plus one for each of the 6 moves still needed.
    expect(haunting.length + 6).toBeGreaterThanOrEqual(7);
    expect(haunting.length + 6).toBeGreaterThan(file.level.startingHp);
  });

  it('haunts the hero on each of the first three moves east', () => {
    let state = started();
    const expectedHp = [5, 4, 3];
    for (const hp of expectedHp) {
      const result = step(state, { kind: 'move', dir: 'E' });
      state = result.state;
      expect(state.status).toBe('playing');
      expect(state.monsters[0]?.at).toBe('I6');
      expect(result.damage).toEqual([{ source: { kind: 'haunt' }, amount: 1 }]);
      expect(state.hp).toBe(hp);
    }
  });

  it('loses when the hero walks up to the lich and edits too late', () => {
    let state = started();
    for (const action of LOSS_VARIANT.slice(0, 4)) {
      const result = step(state, action);
      state = result.state;
      if (action === LOSS_VARIANT[3]) {
        expect(state.status).toBe('lost');
        expect(result.damage).toContainEqual({ source: { kind: 'monster', id: 'M1' }, amount: 4 });
      }
    }
    for (const action of LOSS_VARIANT.slice(4)) {
      const result = applyAction(state, action);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not-playing');
    }
  });

  it('accepts the LICH_HP edit as the first action while the lich is far', () => {
    const state = started();
    expect(manhattan(state.hero, 'I6')).toBeGreaterThan(2);
    const result = applyAction(state, { kind: 'edit', address: 'B16', raw: '0' });
    expect(result.ok).toBe(true);
  });

  it('refuses the stored solution at the second edit with one ink', () => {
    const doc = JSON.parse(JSON.stringify(file.doc)) as { ink: number };
    doc.ink = 1;
    const run = replay(doc, readSolution(ID).actions);
    expect(run.refusedAt).toBe(1);
    const refused = run.steps[1]?.result;
    expect(refused?.ok).toBe(false);
    if (refused !== undefined && !refused.ok) expect(refused.reason).toBe('no-ink');
  });

  it('locks every map cell and every panel label; only the editable cells are open (Decision 7)', () => {
    const report = lockReport(started());
    expect(report.openMapCells).toEqual([]);
    expect(report.openLabelCells).toEqual([]);
    expect([...report.openCells].sort()).toEqual(['HEX_A', 'HEX_B', 'LICH_HP']);
  });

  it('refuses typing an exit next to the hero, so the level cannot be won for 1 ink', () => {
    const result = applyAction(started(), { kind: 'edit', address: 'C6', raw: 'X' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('locked');
  });

  it('replays the stored solution to a win', () => {
    const solution = readSolution(ID);
    expect(solution.levelId).toBe(ID);
    expect(solution.minimalInk).toBe(2);
    expect(solution.actions).toHaveLength(13);
    const run = replay(file.doc, solution.actions);
    const lines = run.steps.map((s) => describeStep(ID, s)).join('\n');
    expect(run.refusedAt, lines).toBeUndefined();
    expect(run.steps.every((s) => s.result.ok)).toBe(true);
    const beforeLast = run.steps[run.steps.length - 2];
    expect(beforeLast?.state.hp ?? 0).toBeGreaterThan(0);
    expect(run.final.status).toBe('won');
    expect(run.final.hp).toBe(5);
    expect(run.final.ink).toBe(0);
    expect(run.final.turn).toBe(13);
    const hauntTurns = run.steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.result.ok && s.result.damage.some((d) => d.source.kind === 'haunt'))
      .map(({ i }) => i + 1);
    expect(hauntTurns).toEqual([1]);
  });
});
