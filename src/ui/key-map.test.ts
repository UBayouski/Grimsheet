import { describe, expect, it } from 'vitest';
import { mapKey } from './key-map';
import type { KeyCommand, KeyContext, KeyInput } from './types';

type Dir = 'N' | 'S' | 'E' | 'W';

function input(key: string, extra: Partial<KeyInput> = {}): KeyInput {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, composing: false, ...extra };
}

function ctx(extra: Partial<KeyContext> = {}): KeyContext {
  return { screen: 'playing', focus: 'other', editing: false, pending: undefined, hasNext: false, ...extra };
}

interface Case {
  readonly name: string;
  readonly input: KeyInput;
  readonly context: KeyContext;
  readonly command: KeyCommand | undefined;
  readonly preventDefault: boolean;
}

/** A key that must be handled: command plus preventDefault. */
function hit(name: string, i: KeyInput, c: KeyContext, command: KeyCommand, preventDefault = true): Case {
  return { name, input: i, context: c, command, preventDefault };
}

/** A key that must be ignored: no result, so the browser keeps it. */
function miss(name: string, i: KeyInput, c: KeyContext): Case {
  return { name, input: i, context: c, command: undefined, preventDefault: false };
}

const arrows: readonly (readonly [string, Dir])[] = [
  ['ArrowUp', 'N'],
  ['ArrowDown', 'S'],
  ['ArrowLeft', 'W'],
  ['ArrowRight', 'E'],
];
const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
const screens = ['playing', 'won', 'lost'] as const;

const cases: Case[] = [
  // Row 1
  miss('row 1: composing ignores a game key', input('ArrowUp', { composing: true }), ctx()),
  miss('row 1: composing ignores Enter in the text field', input('Enter', { composing: true }), ctx({ focus: 'text', editing: true })),
  // Row 2
  miss('row 2: screen none ignores arrows', input('ArrowUp'), ctx({ screen: 'none' })),
  miss('row 2: screen none ignores r', input('r'), ctx({ screen: 'none' })),
  // Row 3
  hit('row 3: Enter in text while editing commits', input('Enter'), ctx({ focus: 'text', editing: true }), { type: 'edit-commit' }),
  miss('row 3: Ctrl+Enter in text does not commit', input('Enter', { ctrlKey: true }), ctx({ focus: 'text', editing: true })),
  miss('row 3: Alt+Enter in text does not commit', input('Enter', { altKey: true }), ctx({ focus: 'text', editing: true })),
  miss('row 3: Enter in text when not editing is typing', input('Enter'), ctx({ focus: 'text' })),
  // Row 4
  hit('row 4: Escape in text while editing cancels', input('Escape'), ctx({ focus: 'text', editing: true }), { type: 'edit-cancel' }),
  // Row 5
  miss('row 5: letter in text is typing', input('r'), ctx({ focus: 'text', editing: true })),
  miss('row 5: Ctrl+Z in text stays native', input('z', { ctrlKey: true }), ctx({ focus: 'text', editing: true })),
  miss('row 5: Ctrl+Arrow in text stays native', input('ArrowLeft', { ctrlKey: true }), ctx({ focus: 'text', editing: true })),
  miss('row 5: plain arrow in text is the caret', input('ArrowRight'), ctx({ focus: 'text' })),
  miss('row 5: Escape in text when not editing does nothing', input('Escape'), ctx({ focus: 'text' })),
  miss('row 5: text focus beats pending', input('x'), ctx({ focus: 'text', pending: 'restart' })),
  // Row 6
  hit('row 6: Escape with pending restart cancels', input('Escape'), ctx({ pending: 'restart' }), { type: 'cancel' }),
  hit('row 6: Escape with pending switch on a button cancels', input('Escape'), ctx({ pending: 'switch', focus: 'button' }), { type: 'cancel' }),
  // Row 7
  hit('row 7: r confirms pending restart', input('r'), ctx({ pending: 'restart' }), { type: 'confirm' }),
  hit('row 7: R confirms pending restart', input('R', { shiftKey: true }), ctx({ pending: 'restart' }), { type: 'confirm' }),
  hit('row 7: Enter confirms pending restart', input('Enter'), ctx({ pending: 'restart' }), { type: 'confirm' }),
  hit('row 7: Ctrl+R with pending restart cancels (row 10)', input('r', { ctrlKey: true }), ctx({ pending: 'restart' }), { type: 'cancel' }),
  // Row 8
  hit('row 8: Enter confirms pending switch', input('Enter'), ctx({ pending: 'switch' }), { type: 'confirm' }),
  hit('row 8: r cancels pending switch (row 10)', input('r'), ctx({ pending: 'switch' }), { type: 'cancel' }),
  // Row 9
  miss('row 9: Enter on a button with pending is native', input('Enter'), ctx({ pending: 'restart', focus: 'button' })),
  miss('row 9: Space on a button with pending is native', input(' '), ctx({ pending: 'switch', focus: 'button' })),
  // Row 10
  hit('row 10: arrow with pending cancels and is prevented', input('ArrowDown'), ctx({ pending: 'restart' }), { type: 'cancel' }),
  hit('row 10: Space with pending cancels and is prevented', input(' '), ctx({ pending: 'switch' }), { type: 'cancel' }),
  hit('row 10: u with pending cancels and is prevented', input('u'), ctx({ pending: 'restart' }), { type: 'cancel' }),
  hit('row 10: Tab with pending cancels, not prevented', input('Tab'), ctx({ pending: 'restart' }), { type: 'cancel' }, false),
  hit('row 10: unknown letter with pending cancels, not prevented', input('q'), ctx({ pending: 'switch' }), { type: 'cancel' }, false),
  hit('row 10: arrow on a button with pending cancels', input('ArrowLeft'), ctx({ pending: 'restart', focus: 'button' }), { type: 'cancel' }),
  ...modifierKeys.map((k) => miss(`modifier-only ${k} with pending never cancels`, input(k), ctx({ pending: 'restart' }))),
  ...modifierKeys.map((k) => miss(`modifier-only ${k} while playing is ignored`, input(k), ctx())),
  // Rows 11 to 14, per arrow
  ...arrows.flatMap(([key, dir]): Case[] => [
    hit(`row 11: Ctrl+${key} selects ${dir}`, input(key, { ctrlKey: true }), ctx(), { type: 'select-move', dir }),
    hit(`row 11: Command+${key} selects ${dir}`, input(key, { metaKey: true }), ctx(), { type: 'select-move', dir }),
    hit(`row 11: Ctrl+${key} selects ${dir} on a button`, input(key, { ctrlKey: true }), ctx({ focus: 'button' }), { type: 'select-move', dir }),
    hit(`row 11: Ctrl+${key} selects ${dir} when won`, input(key, { ctrlKey: true }), ctx({ screen: 'won' }), { type: 'select-move', dir }),
    hit(`row 11: Ctrl+${key} selects ${dir} when lost`, input(key, { ctrlKey: true }), ctx({ screen: 'lost' }), { type: 'select-move', dir }),
    miss(`Alt+${key} is never handled`, input(key, { altKey: true }), ctx()),
    miss(`Shift+${key} is never handled`, input(key, { shiftKey: true }), ctx()),
    miss(`Ctrl+Shift+${key} is never handled`, input(key, { ctrlKey: true, shiftKey: true }), ctx()),
    miss(`Ctrl+Alt+${key} is never handled`, input(key, { ctrlKey: true, altKey: true }), ctx()),
    miss(`row 13: ${key} on a button is native`, input(key), ctx({ focus: 'button' })),
    hit(`row 14: ${key} moves ${dir} while playing`, input(key), ctx(), { type: 'move', dir }),
    miss(`row 14: ${key} does nothing when won`, input(key), ctx({ screen: 'won' })),
    miss(`row 14: ${key} does nothing when lost`, input(key), ctx({ screen: 'lost' })),
  ]),
  // Row 12
  miss('row 12: Enter on a button is native', input('Enter'), ctx({ focus: 'button' })),
  miss('row 12: Space on a button is native', input(' '), ctx({ focus: 'button' })),
  // Row 13
  ...['u', 'r', 'n'].map((k) => miss(`row 13: ${k} on a button is native`, input(k), ctx({ focus: 'button', screen: 'won', hasNext: true }))),
  // Row 15
  hit('row 15: Space waits while playing', input(' '), ctx(), { type: 'wait' }),
  miss('row 15: Space does nothing when won', input(' '), ctx({ screen: 'won' })),
  miss('row 15: Space does nothing when lost', input(' '), ctx({ screen: 'lost' })),
  miss('row 15: Shift+Space does nothing', input(' ', { shiftKey: true }), ctx()),
  // Row 16
  hit('row 16: u undoes while playing', input('u'), ctx(), { type: 'undo' }),
  hit('row 16: U undoes while playing', input('U', { shiftKey: true }), ctx(), { type: 'undo' }),
  miss('row 16: u does nothing when won', input('u'), ctx({ screen: 'won' })),
  miss('row 16: u does nothing when lost', input('u'), ctx({ screen: 'lost' })),
  miss('row 16: Ctrl+U is left to the browser', input('u', { ctrlKey: true }), ctx()),
  // Row 17
  hit('row 17: Ctrl+Z undoes while playing', input('z', { ctrlKey: true }), ctx(), { type: 'undo' }),
  hit('row 17: Command+Z undoes while playing', input('z', { metaKey: true }), ctx(), { type: 'undo' }),
  miss('row 17: Ctrl+Shift+Z is not undo', input('Z', { ctrlKey: true, shiftKey: true }), ctx()),
  miss('row 17: Ctrl+Z when won does nothing', input('z', { ctrlKey: true }), ctx({ screen: 'won' })),
  miss('row 17: Ctrl+Z on a button does nothing', input('z', { ctrlKey: true }), ctx({ focus: 'button' })),
  // Row 18
  ...screens.flatMap((screen): Case[] => [
    hit(`row 18: r restarts (${screen})`, input('r'), ctx({ screen }), { type: 'restart' }),
    hit(`row 18: R restarts (${screen})`, input('R', { shiftKey: true }), ctx({ screen }), { type: 'restart' }),
    miss(`row 18: Ctrl+R reloads the page (${screen})`, input('r', { ctrlKey: true }), ctx({ screen })),
    miss(`row 18: Command+R reloads the page (${screen})`, input('r', { metaKey: true }), ctx({ screen })),
  ]),
  // Row 19
  hit('row 19: n goes next when won and a next level exists', input('n'), ctx({ screen: 'won', hasNext: true }), { type: 'next-level' }),
  hit('row 19: N goes next when won and a next level exists', input('N', { shiftKey: true }), ctx({ screen: 'won', hasNext: true }), { type: 'next-level' }),
  miss('row 19: n does nothing when won without a next level', input('n'), ctx({ screen: 'won' })),
  miss('row 19: n does nothing while playing', input('n'), ctx({ hasNext: true })),
  miss('row 19: n does nothing when lost', input('n'), ctx({ screen: 'lost', hasNext: true })),
  miss('row 19: Ctrl+N is left to the browser', input('n', { ctrlKey: true }), ctx({ screen: 'won', hasNext: true })),
  // Row 20
  hit('row 20: Enter on the grid starts an edit', input('Enter'), ctx(), { type: 'edit-start' }),
  hit('row 20: F2 on the grid starts an edit', input('F2'), ctx(), { type: 'edit-start' }),
  hit('row 20: F2 on a button starts an edit', input('F2'), ctx({ focus: 'button' }), { type: 'edit-start' }),
  miss('row 20: Enter when won does nothing', input('Enter'), ctx({ screen: 'won' })),
  miss('row 20: F2 when lost does nothing', input('F2'), ctx({ screen: 'lost' })),
  miss('row 20: Shift+Enter does not start an edit', input('Enter', { shiftKey: true }), ctx()),
  // Row 21
  miss('row 21: an unrelated letter does nothing', input('q'), ctx()),
  miss('row 21: Tab does nothing', input('Tab'), ctx()),
  miss('row 21: Escape without edit or pending does nothing', input('Escape'), ctx()),
];

describe('mapKey', () => {
  it.each(cases)('$name', (c) => {
    const out = mapKey(c.input, c.context);
    if (c.command === undefined) {
      expect(out).toBeUndefined();
    } else {
      expect(out).toEqual({ command: c.command, preventDefault: c.preventDefault });
    }
  });

  it('is pure: the same input gives the same result', () => {
    expect(mapKey(input('ArrowUp'), ctx())).toEqual(mapKey(input('ArrowUp'), ctx()));
  });
});
