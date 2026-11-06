import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellRawText, cellValue, startRun } from '../game/index';
import type { RunState } from '../game/index';
import { serializeLevelText, tabLabel } from '../model/index';
import { LEVEL_IDS, loadLevelFile, lockReport } from './helpers';
import { LEVELS } from './index';

const TAB_LABELS: readonly string[] = [
  'Sheet1: The Corridor',
  'Sheet2: The Chaser',
  'Sheet3: The Locked Crypt',
  'Sheet4: The Trap Row',
  'Sheet5: The Lich',
];

/** Requirement 2.5: every alternative in a group is acceptable; the check passes if any one is in the hint. */
const HINT_WORDS: readonly (readonly (readonly string[])[])[] = [
  [['DIST_TO_EXIT'], ['rules panel']],
  [['MOVE_M1']],
  [['KEY'], ['RUNE_ASH', 'RUNE_SALT']],
  [['#DIV/0!'], ['RATIO']],
  [['LICH_HP'], ['HEX_A', 'HEX_B']],
];

const EDITABLE: readonly (readonly string[])[] = [
  [],
  ['ATK_M1', 'MOVE_M1'],
  ['RUNE_ASH', 'RUNE_DUST', 'RUNE_SALT'],
  ['DIVISOR', 'LOAD'],
  ['HEX_A', 'HEX_B', 'LICH_HP'],
];

const MONSTER_COUNTS: readonly number[] = [0, 1, 0, 0, 1];

/** Built from fragments so this file never holds the word whole. */
const BANNED_FRAGMENT = ['ra', 'nd'].join('');

function started(id: string): RunState {
  const result = startRun(loadLevelFile(id).doc);
  if (!result.ok) throw new Error(`startRun refused ${id}`);
  return result.state;
}

/** The index and kind of the first carriage return or byte order mark, or undefined. */
function firstBadChar(text: string): { index: number; kind: string } | undefined {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x0d) return { index, kind: 'carriage return' };
    if (code === 0xfeff) return { index, kind: 'byte order mark' };
  }
  return undefined;
}

describe('level files, all five', () => {
  it('lists five ids in numeric order that match LEVELS', () => {
    expect(LEVEL_IDS).toHaveLength(5);
    expect(new Set(LEVEL_IDS).size).toBe(5);
    expect(LEVELS).toHaveLength(5);
  });

  it('has the two required lines in .gitattributes', () => {
    const text = readFileSync(new URL('../../.gitattributes', import.meta.url), 'utf8');
    const lines = text.split('\n').map((line) => line.trim());
    expect(lines).toContain('src/levels/*.json text eol=lf');
    expect(lines).toContain('tests/solutions/*.json text eol=lf');
  });

  LEVEL_IDS.forEach((id, index) => {
    const number = index + 1;

    describe(id, () => {
      const file = loadLevelFile(id);

      it('loads and starts a run', () => {
        const result = startRun(file.doc);
        expect(result.ok).toBe(true);
        const state = started(id);
        expect(state.status).toBe('playing');
        expect(state.hp).toBe(file.level.startingHp);
        expect(state.ink).toBe(file.level.ink);
      });

      it('has file text equal to its serialized level, with no CR and no BOM', () => {
        expect(file.text).toBe(serializeLevelText(file.level));
        expect(firstBadChar(file.text)).toBeUndefined();
      });

      it('has an id that matches its file name and position', () => {
        expect(file.level.id).toBe(id);
        expect(id.slice(0, 2)).toBe(String(number).padStart(2, '0'));
        expect(JSON.stringify(LEVELS[index])).toBe(JSON.stringify(JSON.parse(file.text)));
        expect((LEVELS[index] as { id: string }).id).toBe(id);
      });

      it('has the expected tab label', () => {
        expect(tabLabel(file.level)).toBe(TAB_LABELS[index]);
      });

      it('has a one-line hint of 1 to 120 characters with the required words', () => {
        const hint = file.level.hint;
        expect(hint.length).toBeGreaterThanOrEqual(1);
        expect(hint.length).toBeLessThanOrEqual(120);
        expect(hint).not.toMatch(/[\r\n]/);
        for (const group of HINT_WORDS[index] ?? []) {
          const found = group.some((word) => hint.toLowerCase().includes(word.toLowerCase()));
          expect(found, `hint of ${id} needs one of ${group.join(' or ')}`).toBe(true);
        }
      });

      it('has a label of 1 to 24 characters left of every named panel cell', () => {
        const state = started(id);
        let named = 0;
        for (const cell of file.level.cells) {
          if (cell.name === undefined) continue;
          const row = Number(cell.address.slice(1));
          if (row < 14 || row > 20) continue;
          named += 1;
          const left = `${String.fromCharCode(cell.address.charCodeAt(0) - 1)}${row}`;
          const label = cellRawText(state, left) ?? '';
          expect(label.length, `label of ${cell.name}`).toBeGreaterThanOrEqual(1);
          expect(label.length, `label of ${cell.name}`).toBeLessThanOrEqual(24);
        }
        expect(named).toBeGreaterThan(0);
      });

      it('locks every map and label cell, leaving only the editable cells open', () => {
        const report = lockReport(started(id));
        expect(report.openMapCells).toEqual([]);
        expect(report.openLabelCells).toEqual([]);
        expect([...report.openCells].sort()).toEqual([...(EDITABLE[index] ?? [])]);
        const unlockedNames = file.level.cells
          .filter((cell) => cell.locked !== true)
          .map((cell) => cell.name ?? cell.address)
          .sort();
        expect(unlockedNames).toEqual([...(EDITABLE[index] ?? [])]);
      });

      it('has no source of randomness in any raw text', () => {
        for (const cell of file.level.cells) {
          expect(cell.raw.toLowerCase(), cell.address).not.toContain(BANNED_FRAGMENT);
        }
      });

      it('has a seed equal to its level number', () => {
        expect(file.level.seed).toBe(number);
      });

      it('has the expected monsters', () => {
        const monsters = file.level.monsters;
        expect(monsters).toHaveLength(MONSTER_COUNTS[index] ?? -1);
        for (const monster of monsters) {
          expect(monster.id).toBe('M1');
          expect(monster.move).toBe('MOVE_M1');
          expect(monster.atk).toBe('ATK_M1');
        }
      });

      it('has an exit, or the level 5 gate', () => {
        const state = started(id);
        if (number < 5) {
          let exits = 0;
          for (let row = 1; row <= 12; row += 1) {
            for (const letter of 'ABCDEFGHIJKL') {
              const value = cellValue(state, `${letter}${row}`);
              if (value !== undefined && value.kind === 'string' && value.value === 'X') exits += 1;
            }
          }
          expect(exits).toBeGreaterThanOrEqual(1);
        } else {
          const gate = file.level.cells.find((cell) => cell.address === 'K4');
          expect(gate?.raw).toBe('=IF(LICH_HP<=0,"X","#")');
          const value = cellValue(state, 'K4');
          expect(value?.kind).toBe('string');
          expect(value !== undefined && value.kind === 'string' ? value.value : undefined).toBe('#');
        }
      });
    });
  });

  it('has five distinct tab labels', () => {
    const labels = LEVEL_IDS.map((id) => tabLabel(loadLevelFile(id).level));
    expect(labels).toEqual([...TAB_LABELS]);
    expect(new Set(labels).size).toBe(5);
  });
});
