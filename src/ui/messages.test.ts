import { describe, expect, it } from 'vitest';
import { REFUSAL_REASONS } from '../game/index';
import type { DamageLog, Refusal } from '../game/index';
import { STRINGS } from './strings';
import { cellLabel, damageSummary, endMessage, refusalMessage, terrainWord } from './messages';

describe('damageSummary', () => {
  it('is empty for an empty log', () => {
    expect(damageSummary([])).toBe('');
  });

  it('reads a single trap', () => {
    const log: DamageLog = [{ source: { kind: 'trap' }, amount: 2 }];
    expect(damageSummary(log)).toBe('-2 HP: trap');
  });

  it('joins a monster hit and a trap in log order', () => {
    const log: DamageLog = [
      { source: { kind: 'monster', id: 'M1' }, amount: 2 },
      { source: { kind: 'trap' }, amount: 1 },
    ];
    expect(damageSummary(log)).toBe('-3 HP: M1 hit you; trap');
  });

  it('reads haunting', () => {
    const log: DamageLog = [{ source: { kind: 'haunt' }, amount: 1 }];
    expect(damageSummary(log)).toBe('-1 HP: haunted');
  });

  it('reads two monsters', () => {
    const log: DamageLog = [
      { source: { kind: 'monster', id: 'M1' }, amount: 1 },
      { source: { kind: 'monster', id: 'M2' }, amount: 1 },
    ];
    expect(damageSummary(log)).toBe('-2 HP: M1 hit you; M2 hit you');
  });

  it('prints a large total without an exponent', () => {
    const log: DamageLog = [
      { source: { kind: 'monster', id: 'M1' }, amount: 1_000_000_000 },
      { source: { kind: 'monster', id: 'M2' }, amount: 1_000_000_000 },
      { source: { kind: 'trap' }, amount: 1_000_000_000 },
    ];
    const text = damageSummary(log);
    expect(text).toBe('-3000000000 HP: M1 hit you; M2 hit you; trap');
    expect(text).not.toMatch(/\d[eE][+-]?\d/);
  });
});

describe('refusalMessage', () => {
  for (const reason of REFUSAL_REASONS) {
    it(`handles ${reason}`, () => {
      const refusal: Refusal = { ok: false, reason, message: `msg for ${reason}` };
      const move = { kind: 'move' };
      const edit = { kind: 'edit' };
      if (reason === 'blocked' || reason === 'occupied') {
        expect(refusalMessage(refusal, move)).toBeUndefined();
        expect(refusalMessage(refusal, edit)).toBe(refusal.message);
      } else if (reason === 'locked') {
        expect(refusalMessage(refusal, move)).toBe(STRINGS.lockedText);
        expect(refusalMessage(refusal, edit)).toBe(STRINGS.lockedText);
      } else {
        expect(refusalMessage(refusal, move)).toBe(refusal.message);
        expect(refusalMessage(refusal, edit)).toBe(refusal.message);
      }
    });
  }
});

describe('endMessage', () => {
  it('reads the middle level', () => {
    expect(endMessage('won', false)).toBe('Changes saved.');
  });

  it('reads the last level', () => {
    expect(endMessage('won', true)).toBe('Workbook saved. Your soul was not.');
  });
});

describe('terrainWord', () => {
  it('names terrain glyphs', () => {
    expect(terrainWord('.')).toBe('floor');
    expect(terrainWord('#')).toBe('wall');
    expect(terrainWord('X')).toBe('exit');
    expect(terrainWord('^')).toBe('trap');
  });

  it('names an empty cell', () => {
    expect(terrainWord('')).toBe('empty');
  });

  it('passes other text through', () => {
    expect(terrainWord('#REF!')).toBe('#REF!');
  });
});

describe('cellLabel', () => {
  it('labels the hero', () => {
    expect(cellLabel({ kind: 'hero' }, 'B3', '.')).toBe('Hero at B3 on floor');
  });

  it('labels a monster', () => {
    expect(cellLabel({ kind: 'monster', id: 'M1' }, 'C4', '.')).toBe('Monster M1 at C4 on floor');
  });
});
