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

  it('has the title texts and new button labels', () => {
    expect(STRINGS.title.tagline).toBe('A roguelike where every monster is a formula.');
    expect(STRINGS.title.premise).toBe(
      "A workbook found on a dead accountant's floppy disk. Its formulas are alive.",
    );
    expect(STRINGS.title.controls).not.toBe('');
    expect(STRINGS.buttons.ok).not.toBe('');
    expect(STRINGS.buttons.sound).not.toBe('');
    expect(STRINGS.buttons.start).not.toBe('');
  });

  it('has no padlock string; the padlock is drawn by CSS', () => {
    expect('padlock' in STRINGS).toBe(false);
  });

  it('formats the damage and entity helpers', () => {
    expect(STRINGS.damage.total(3)).toBe('-3 HP');
    expect(STRINGS.damage.monster('M1')).toBe('M1 hit you');
    expect(STRINGS.entity.monster('M1')).toBe('Monster M1');
  });

  it('formats the ghost note for one cell and for many', () => {
    expect(STRINGS.ghostNote(1)).toBe('A ghost haunts the one cell of a circular reference.');
    expect(STRINGS.ghostNote(2)).toBe('A ghost drifts along 2 cells of a circular reference.');
  });

  it('has a non-empty error cause fallback', () => {
    expect(STRINGS.errorCauseFallback).not.toBe('');
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
