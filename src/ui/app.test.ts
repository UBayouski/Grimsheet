// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_LEVELS } from '../../tests/fixtures/levels';
import { mountApp } from './app';
import * as barrel from './index';
import { PROGRESS_KEY } from './progress';
import type { AppHandle, StorageLike } from './types';

function fakeStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PROGRESS_KEY, initial);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

let handle: AppHandle | undefined;
let root: HTMLElement | undefined;

function mount(storage: StorageLike = fakeStorage()): HTMLElement {
  root = document.createElement('div');
  document.body.append(root);
  handle = mountApp(root, { levels: FIXTURE_LEVELS, storage });
  return root;
}

afterEach(() => {
  handle?.destroy();
  root?.remove();
  handle = undefined;
  root = undefined;
});

function key(target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function mountLab(): HTMLElement {
  return mount(fakeStorage(JSON.stringify({ version: 1, cleared: ['01-fixture-corridor'], current: '02-fixture-lab' })));
}

const q = <T extends Element>(sel: string): T => {
  const el = root?.querySelector<T>(sel) ?? null;
  if (el === null) throw new Error(`missing ${sel}`);
  return el;
};
const heroAt = (): string | null => q('[data-entity="hero"]').getAttribute('data-address');
const selectedAt = (): string | null => q('[data-selected="true"]').getAttribute('data-address');
const text = (sel: string): string => q(sel).textContent ?? '';
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};
const cell = (address: string): Element => q(`[data-address="${address}"]`);
const bar = (): HTMLInputElement => q<HTMLInputElement>('#formula-bar');
const button = (control: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-control="${control}"]`);

function type(value: string): void {
  bar().value = value;
  bar().dispatchEvent(new Event('input', { bubbles: true }));
}

function startEdit(address: string): void {
  click(cell(address));
  key(document, 'Enter');
}

function commitEdit(address: string, value: string): void {
  startEdit(address);
  type(value);
  key(bar(), 'Enter');
}

describe('mountApp', () => {
  it('renders the first level', () => {
    mount();
    expect(root?.getAttribute('data-screen')).toBe('playing');
    expect(heroAt()).toBe('B2');
    expect(text('.status-ink')).toContain('3');
    expect(text('#message')).toBe('Walk to the exit.');
    expect(button('tab').disabled).toBe(false);
    expect(root?.querySelectorAll('[data-control="tab"]').length).toBe(2);
  });

  it('moves the hero on ArrowRight at the document', () => {
    mount();
    const event = key(document, 'ArrowRight');
    expect(heroAt()).toBe('C2');
    expect(event.defaultPrevented).toBe(true);
  });

  it('moves the Selection with Ctrl+Arrow, not the hero', () => {
    mount();
    const before = selectedAt();
    key(document, 'ArrowRight', { ctrlKey: true });
    expect(selectedAt()).not.toBe(before);
    expect(heroAt()).toBe('B2');
  });

  it('selects a cell on click', () => {
    mount();
    click(cell('E5'));
    expect(selectedAt()).toBe('E5');
  });

  it('enters Edit_Mode on Enter with the Formula_Bar active', () => {
    mount();
    startEdit('B2');
    expect(document.activeElement).toBe(bar());
  });

  it('commits a typed edit and spends ink', () => {
    mountLab();
    commitEdit('B15', '"x"');
    expect(text('.status-ink')).toContain('2');
  });

  it('shows a parse error in #formula-alert and keeps the message', () => {
    mountLab();
    const before = text('#message');
    commitEdit('B15', '=1+');
    expect(text('#formula-alert')).toMatch(/Col \d+/);
    expect(text('#message')).toBe(before);
    expect(text('.status-ink')).toContain('3');
  });

  it('shows a non-parse refusal in #message and leaves #formula-alert empty', () => {
    mountLab();
    commitEdit('B15', '"a"');
    commitEdit('B15', '"b"');
    commitEdit('B15', '"c"');
    expect(text('.status-ink')).toContain('0');
    commitEdit('B15', '"d"');
    expect(text('#message').length).toBeGreaterThan(0);
    expect(text('#formula-alert')).toBe('');
  });

  it('cancels on Escape and the blur changes nothing', () => {
    mountLab();
    startEdit('B15');
    type('"zzz"');
    key(bar(), 'Escape');
    expect(text('.status-ink')).toContain('3');
    expect(document.activeElement).not.toBe(bar());
    expect(bar().value).toBe('"-"');
  });

  it('cancels an edit when another cell is clicked', () => {
    mountLab();
    startEdit('B15');
    type('"zzz"');
    click(cell('A16'));
    expect(text('.status-ink')).toContain('3');
    expect(selectedAt()).toBe('A16');
    expect(bar().value).toBe('Attack M1');
  });

  it('ignores clicks on a disabled tab', () => {
    mount();
    const tab = q<HTMLButtonElement>('[data-level-index="1"]');
    expect(tab.disabled).toBe(true);
    click(tab);
    expect(q('[data-level-index="0"]').getAttribute('aria-current')).toBe('page');
  });

  it('starts the first uncleared level when saved Progress names a disabled one', () => {
    mount(fakeStorage(JSON.stringify({ version: 1, cleared: [], current: '02-fixture-lab' })));
    expect(text('.status-level')).toContain('Corridor');
  });

  it('does not move the hero for keys typed in the Formula_Bar', () => {
    mount();
    startEdit('B2');
    key(bar(), 'ArrowRight');
    expect(heroAt()).toBe('B2');
  });

  it('ignores game keys on a focused button', () => {
    mount();
    key(button('undo'), 'ArrowRight');
    expect(heroAt()).toBe('B2');
  });

  it('clears a prompt on Undo click without undoing', () => {
    mount();
    key(document, 'ArrowRight');
    click(button('recover'));
    expect(text('#message')).not.toBe('Walk to the exit.');
    click(button('undo'));
    expect(text('#message')).toBe('Walk to the exit.');
    expect(heroAt()).toBe('C2');
  });

  it('restarts after Recover and a confirm', () => {
    mount();
    key(document, 'ArrowRight');
    click(button('recover'));
    expect(heroAt()).toBe('C2');
    click(button('recover'));
    expect(heroAt()).toBe('B2');
  });

  it('confirms the restart with R while focus is on the Recover button (found in play)', () => {
    mount();
    key(document, 'ArrowRight');
    expect(heroAt()).toBe('C2');
    const recover = button('recover');
    click(recover);
    recover.focus();
    // The confirmation is pending and the Recover button holds focus, as after a real click.
    expect(text('#message')).not.toBe('Walk to the exit.');
    // Pressing R from the focused button must confirm the restart, not cancel it.
    key(recover, 'r');
    expect(heroAt()).toBe('B2');
    expect(root?.getAttribute('data-screen')).toBe('playing');
    expect(text('.status-ink')).toContain('3');
  });

  it('follows the Status through a win', () => {
    const storage = fakeStorage();
    mount(storage);
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    expect(root?.getAttribute('data-screen')).toBe('won');
    expect(storage.data.get(PROGRESS_KEY)).toContain('01-fixture-corridor');
    expect(button('next').hidden).toBe(false);
  });

  it('stops handling keys after destroy', () => {
    mount();
    handle?.destroy();
    const event = key(document, 'ArrowRight');
    expect(event.defaultPrevented).toBe(false);
    expect(root?.innerHTML).toBe('');
  });

  it('shows "Something went wrong." when a handler throws and keeps responding', () => {
    mount();
    const bad = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(bad, 'key', {
      get() {
        throw new Error('boom');
      },
    });
    document.dispatchEvent(bad);
    expect(text('#message')).toBe('Something went wrong.');
    key(document, 'ArrowRight');
    expect(heroAt()).toBe('C2');
  });

  it('survives storage that throws on read and write', () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error('no read');
      },
      setItem() {
        throw new Error('no write');
      },
    };
    mount(storage);
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    expect(root?.getAttribute('data-screen')).toBe('won');
  });
});

describe('grid focus', () => {
  it('focuses the grid table on mount and keeps it there through game keys', () => {
    mount();
    const table = q<HTMLElement>('#grid-table');
    expect(document.activeElement).toBe(table);
    key(document, 'ArrowRight');
    expect(document.activeElement).toBe(table);
    key(document, ' ');
    expect(document.activeElement).toBe(table);
  });

  it('returns focus to the grid when a game key is pressed while focus is on the body', () => {
    mount();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    key(document, 'ArrowRight');
    expect(document.activeElement).toBe(q('#grid-table'));
  });

  it('keeps the active descendant pointing at the selected cell', () => {
    mount();
    key(document, 'ArrowRight');
    const selected = q('[data-selected="true"]').getAttribute('id');
    expect(q('#grid-table').getAttribute('aria-activedescendant')).toBe(selected);
  });
});

describe('barrel', () => {
  it('exports exactly the expected runtime names', () => {
    expect(Object.keys(barrel).sort()).toEqual(['browserStorage', 'mountApp']);
  });
});
