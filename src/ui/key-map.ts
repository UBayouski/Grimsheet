import type { Direction, KeyCommand, KeyContext, KeyInput } from './types';

export interface KeyResult {
  readonly command: KeyCommand;
  readonly preventDefault: boolean;
}

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

const ARROW_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'N',
  ArrowDown: 'S',
  ArrowLeft: 'W',
  ArrowRight: 'E',
};

// Keys named in rows 5 to 20 of the key table (letters are compared in lower case).
const GAME_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Escape',
  'F2',
  ' ',
  'u',
  'r',
  'n',
  'z',
]);

function result(command: KeyCommand, preventDefault: boolean): KeyResult {
  return { command, preventDefault };
}

/**
 * Decide what a key press means. Rows follow the Key_Map table in the grid-ui
 * design, top to bottom; the first match wins. Pure: no DOM, no globals.
 */
export function mapKey(input: KeyInput, context: KeyContext): KeyResult | undefined {
  const { key } = input;
  if (MODIFIER_KEYS.has(key)) return undefined;

  // Meta (Command) counts as Ctrl.
  const ctrl = input.ctrlKey || input.metaKey;
  const alt = input.altKey;
  const shift = input.shiftKey;
  const noCtrlAltMeta = !ctrl && !alt;
  const noModifier = !ctrl && !alt && !shift;
  const letter = key.length === 1 ? key.toLowerCase() : key;
  const { screen, focus, editing, pending } = context;
  const playing = screen === 'playing';
  const arrow = ARROW_DIRECTIONS[key];

  // 1, 2
  if (input.composing) return undefined;
  if (screen === 'none') return undefined;

  // 3 to 5: the text field keeps every key except Enter and Escape while editing.
  if (focus === 'text') {
    if (editing && key === 'Enter' && noCtrlAltMeta) return result({ type: 'edit-commit' }, true);
    if (editing && key === 'Escape') return result({ type: 'edit-cancel' }, true);
    return undefined;
  }

  if (pending !== undefined) {
    // 6
    if (key === 'Escape') return result({ type: 'cancel' }, true);
    // 7: a pending restart confirms. 'Enter' confirms from the grid ('other'); on a button it stays
    // native (row 9) so the focused button's own click confirms, with no double confirm. The 'r'
    // letter confirms from the grid and from a button (the Recover button keeps focus after its
    // click), which is what row 9 would otherwise swallow. In the formula bar 'r' is text (row 5).
    if (pending === 'restart' && noCtrlAltMeta) {
      if (letter === 'r' && (focus === 'other' || focus === 'button')) return result({ type: 'confirm' }, true);
      if (key === 'Enter' && focus === 'other') return result({ type: 'confirm' }, true);
    }
    // 8: a pending switch confirms on 'Enter' from the grid. It has no confirming letter, so on a
    // button 'Enter' stays native (row 9) and re-clicks the tab button.
    if (pending === 'switch' && focus === 'other' && noCtrlAltMeta && key === 'Enter') {
      return result({ type: 'confirm' }, true);
    }
    // 9
    if (focus === 'button' && (key === 'Enter' || key === ' ')) return undefined;
    // 10
    return result({ type: 'cancel' }, GAME_KEYS.has(letter));
  }

  // 11
  if (ctrl && !alt && !shift && arrow !== undefined) {
    return result({ type: 'select-move', dir: arrow }, true);
  }

  if (focus === 'button') {
    // 12
    if (key === 'Enter' || key === ' ') return undefined;
    // 13
    if (letter === 'u' || letter === 'r' || letter === 'n' || arrow !== undefined) return undefined;
  }

  // 14, 15
  if (focus === 'other' && playing && noModifier) {
    if (arrow !== undefined) return result({ type: 'move', dir: arrow }, true);
    if (key === ' ') return result({ type: 'wait' }, true);
  }

  // 16
  if (playing && noCtrlAltMeta && letter === 'u') return result({ type: 'undo' }, true);

  // 17
  if (playing && ctrl && !shift && !alt && focus === 'other' && letter === 'z') {
    return result({ type: 'undo' }, true);
  }

  // 18
  if (noCtrlAltMeta && focus === 'other' && letter === 'r') return result({ type: 'restart' }, true);

  // 19
  if (screen === 'won' && context.hasNext && noCtrlAltMeta && focus === 'other' && letter === 'n') {
    return result({ type: 'next-level' }, true);
  }

  // 20
  if (playing && noModifier) {
    if (key === 'F2' && (focus === 'other' || focus === 'button')) return result({ type: 'edit-start' }, true);
    if (key === 'Enter' && focus === 'other') return result({ type: 'edit-start' }, true);
  }

  // 21
  return undefined;
}
