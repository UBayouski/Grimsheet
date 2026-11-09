import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PlayInputError,
  dumpSheet,
  levelById,
  levelIds,
  levelInfo,
  parseActions,
  parseActionsText,
  play,
} from './headless';
import { startRun } from '../game/index';

/** Reads a solution file and returns its id, expected ink spend and the action list. */
function solution(id: string): { minimalInk: number; actions: unknown[] } {
  const text = readFileSync(new URL(`../../tests/solutions/${id}.json`, import.meta.url), 'utf8');
  return JSON.parse(text) as { minimalInk: number; actions: unknown[] };
}

// `ink` here is the final ink: starting ink minus the edits the solution spends (minimalInk).
const EXPECTED = [
  { id: '01-the-corridor', hp: 3, ink: 0 },
  { id: '02-the-chaser', hp: 3, ink: 1 },
  { id: '03-the-locked-crypt', hp: 3, ink: 1 },
  { id: '04-the-trap-row', hp: 5, ink: 0 },
  { id: '05-the-lich', hp: 5, ink: 0 },
];

describe('headless play: every stored solution wins', () => {
  for (const { id, hp, ink } of EXPECTED) {
    it(`${id} replays to won with hp ${hp} and ink ${ink}`, () => {
      const file = solution(id);
      const actions = parseActions(file.actions);
      const report = play(id, actions);
      // Every action was accepted and none refused.
      expect(report.refusedAt).toBeUndefined();
      expect(report.steps.every((s) => s.accepted)).toBe(true);
      // The run ends won with the expected hp and ink.
      expect(report.final.status).toBe('won');
      expect(report.final.hp).toBe(hp);
      expect(report.final.ink).toBe(ink);
      // The edit count matches minimalInk, and the starting ink minus spend equals the final ink.
      const edits = report.steps.filter((s) => s.action.kind === 'edit').length;
      expect(edits).toBe(file.minimalInk);
      // Every step report carries the public fields.
      for (const s of report.steps) {
        expect(typeof s.hero).toBe('string');
        expect(typeof s.hp).toBe('number');
        expect(typeof s.turn).toBe('number');
        expect(Array.isArray(s.damage)).toBe(true);
      }
    });
  }
});

describe('headless play: refusals are reported, not thrown', () => {
  it('reports a blocked move with its reason and keeps playing', () => {
    // Level 1 is a corridor; moving north hits a wall.
    const report = play('01-the-corridor', [
      { kind: 'move', dir: 'N' },
      { kind: 'move', dir: 'E' },
    ]);
    expect(report.refusedAt).toBe(0);
    const first = report.steps[0];
    expect(first?.accepted).toBe(false);
    expect(first?.reason).toBe('blocked');
    expect(typeof first?.message).toBe('string');
    // The second action was still attempted and accepted.
    expect(report.steps[1]?.accepted).toBe(true);
    expect(report.steps).toHaveLength(2);
  });

  it('reports a locked-cell edit on level 5 without throwing', () => {
    const report = play('05-the-lich', [{ kind: 'edit', address: 'C6', raw: 'X' }]);
    expect(report.steps[0]?.accepted).toBe(false);
    expect(report.steps[0]?.reason).toBe('locked');
    expect(report.final.status).toBe('playing');
  });

  it('reports a no-ink refusal: a second edit on level 4, which has ink 1', () => {
    const report = play('04-the-trap-row', [
      { kind: 'edit', address: 'B17', raw: '1' },
      { kind: 'edit', address: 'B16', raw: '9' },
    ]);
    expect(report.steps[0]?.accepted).toBe(true);
    expect(report.steps[1]?.accepted).toBe(false);
    expect(report.steps[1]?.reason).toBe('no-ink');
  });
});

describe('headless play: sheet dump and views', () => {
  it('dumps non-empty cells with address, raw, value, locked and name', () => {
    const report = play('01-the-corridor', []);
    const named = report.sheet.find((c) => c.name === 'DIST_TO_EXIT');
    expect(named?.address).toBe('B14');
    expect(named?.raw).toBe('=DIST(HERO,K6)');
    expect(named?.value).toBe('9');
    expect(named?.locked).toBe(true);
    const exit = report.sheet.find((c) => c.address === 'K6');
    expect(exit?.value).toBe('X');
    // No cell in the dump is the empty string with empty raw.
    for (const cell of report.sheet) {
      expect(cell.raw === '' && cell.value === '' && cell.valueKind === 'string').toBe(false);
    }
  });

  it('reports the start view before any action', () => {
    const report = play('05-the-lich', []);
    expect(report.start.hero).toBe('B6');
    expect(report.start.hp).toBe(6);
    expect(report.start.ink).toBe(2);
    expect(report.start.monsters).toEqual([{ id: 'M1', at: 'I6' }]);
    expect(report.steps).toEqual([]);
  });

  it('dumpSheet works on a started run directly', () => {
    const started = startRun(levelById('01-the-corridor'));
    if (!started.ok) throw new Error('level did not start');
    expect(dumpSheet(started.state).some((c) => c.address === 'K6' && c.value === 'X')).toBe(true);
  });
});

describe('headless level info and ids', () => {
  it('lists the five level ids in order', () => {
    expect(levelIds()).toEqual([
      '01-the-corridor',
      '02-the-chaser',
      '03-the-locked-crypt',
      '04-the-trap-row',
      '05-the-lich',
    ]);
  });

  it('returns level info without playing', () => {
    const info = levelInfo('02-the-chaser');
    expect(info.id).toBe('02-the-chaser');
    expect(info.title).toBe('The Chaser');
    expect(info.startingHp).toBe(3);
    expect(info.ink).toBe(2);
    expect(info.seed).toBe(2);
    expect(Array.isArray(info.map)).toBe(true);
    expect((info.map as string[]).length).toBe(12);
  });
});

describe('headless input validation', () => {
  it('throws PlayInputError for an unknown level id', () => {
    expect(() => play('99-nope', [])).toThrow(PlayInputError);
    expect(() => levelInfo('99-nope')).toThrow(/Unknown level id/);
  });

  it('accepts a bare array and a solution-file object', () => {
    const bare = parseActions([{ kind: 'move', dir: 'E' }]);
    expect(bare).toEqual([{ kind: 'move', dir: 'E' }]);
    const wrapped = parseActions({ levelId: 'x', minimalInk: 0, actions: [{ kind: 'wait' }] });
    expect(wrapped).toEqual([{ kind: 'wait' }]);
  });

  it('parses JSON text and treats empty text as no actions', () => {
    expect(parseActionsText('   ')).toEqual([]);
    expect(parseActionsText('[{"kind":"wait"}]')).toEqual([{ kind: 'wait' }]);
  });

  it('throws PlayInputError on bad JSON and bad shapes', () => {
    expect(() => parseActionsText('{not json')).toThrow(PlayInputError);
    expect(() => parseActions(5)).toThrow(/must be a JSON array/);
    expect(() => parseActions([{ kind: 'move' }])).toThrow(/actions\[0\]\.dir/);
    expect(() => parseActions([{ kind: 'jump' }])).toThrow(/actions\[0\]\.kind/);
    expect(() => parseActions([{ kind: 'edit', address: '', raw: 'x' }])).toThrow(/actions\[0\]\.address/);
  });
});
