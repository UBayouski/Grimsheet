import { describe, expect, it } from 'vitest';
import { TITLE } from '../title';
import { STRINGS } from './strings';

function collect(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (typeof value === 'function') {
    out.push([`${path}()`, String((value as (x: never) => unknown)('x' as never))]);
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) collect(v, `${path}.${k}`, out);
  }
}

describe('STRINGS', () => {
  it('titleBar equals the TITLE constant', () => {
    expect(STRINGS.titleBar).toBe(TITLE);
  });

  it('has the exact confirmation texts', () => {
    expect(STRINGS.confirmRestart).toBe(
      'Restart this level? Press R or Enter to confirm, Escape to cancel.',
    );
    expect(STRINGS.confirmSwitch('Sheet2: The Chaser')).toBe(
      'Switch to Sheet2: The Chaser? Press Enter to confirm, Escape to cancel.',
    );
  });

  it('has the exact message texts', () => {
    expect(STRINGS.lockedText).toBe('This cell is locked and cannot be edited.');
    expect(STRINGS.loadFailed).toBe('This level could not be loaded.');
    expect(STRINGS.somethingWrong).toBe('Something went wrong.');
    expect(STRINGS.edited).toBe('Edited.');
    expect(STRINGS.undone).toBe('Undone.');
    expect(STRINGS.won).toBe('Changes saved.');
    expect(STRINGS.wonLast).toBe('Workbook saved. Your soul was not.');
    expect(STRINGS.lostTitle).toBe('#REF! of the Dead');
    expect(STRINGS.lostBody).toBe('GRIMSHEET.XLS has stopped responding');
    expect(STRINGS.panelTitle).toBe('NECRONOMICELL');
  });

  it('padlock is the single code point U+1F512', () => {
    expect([...STRINGS.padlock]).toHaveLength(1);
    expect(STRINGS.padlock.codePointAt(0)).toBe(0x1f512);
  });

  it('formats the damage and entity helpers', () => {
    expect(STRINGS.damage.total(3)).toBe('-3 HP');
    expect(STRINGS.damage.monster('M1')).toBe('M1 hit you');
    expect(STRINGS.entity.monster('M1')).toBe('Monster M1');
  });

  it('has no empty string anywhere', () => {
    const found: [string, string][] = [];
    collect(STRINGS, 'STRINGS', found);
    expect(found.length).toBeGreaterThan(20);
    for (const [path, text] of found) {
      expect(text, path).not.toBe('');
    }
  });
});
