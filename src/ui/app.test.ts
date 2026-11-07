// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_LEVELS } from '../../tests/fixtures/levels';
import { mountApp } from './app';
import * as barrel from './index';
import { PROGRESS_KEY } from './progress';
import type { AppHandle, Cue, MountOptions, SoundPlayer, StorageLike } from './types';

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

interface FakeSound extends SoundPlayer {
  readonly calls: { unlock: number; destroy: number; muted: boolean[]; played: Cue[][] };
}

function fakeSound(): FakeSound {
  const calls = { unlock: 0, destroy: 0, muted: [] as boolean[], played: [] as Cue[][] };
  return {
    calls,
    unlock: () => {
      calls.unlock += 1;
    },
    play: (cues) => {
      calls.played.push([...cues]);
    },
    setMuted: (m) => {
      calls.muted.push(m);
    },
    destroy: () => {
      calls.destroy += 1;
    },
  };
}

function mountWith(
  levels: readonly unknown[],
  extra: Partial<MountOptions> = {},
  storage: StorageLike = fakeStorage(),
): HTMLElement {
  root = document.createElement('div');
  document.body.append(root);
  handle = mountApp(root, { levels, storage, ...extra });
  return root;
}

const WALLS = '############';
const OPEN_ROW = '#..........#';
function trapDoc(startingHp: number): unknown {
  return {
    schemaVersion: 1,
    id: '01-fixture-trap',
    title: 'Fixture Trap',
    hint: 'Mind the trap.',
    map: [WALLS, '#.^X.......#', ...Array.from({ length: 9 }, () => OPEN_ROW), WALLS],
    cells: [
      { address: 'A18', raw: 'Trap' },
      { address: 'B18', raw: '=2', name: 'TRAP', locked: true },
    ],
    hero: { at: 'B2' },
    monsters: [],
    startingHp,
    ink: 3,
    seed: 3,
  };
}

const winDialog = (): HTMLElement => q<HTMLElement>('#win-dialog');
const flat = (sound: FakeSound): Cue[] => sound.calls.played.flat();

describe('cues', () => {
  it('plays the cue of each accepted Action and nothing for the others', () => {
    const sound = fakeSound();
    mountWith(FIXTURE_LEVELS, { createAudio: () => sound });
    key(document, 'ArrowLeft');
    key(document, ' ');
    key(document, 'ArrowRight', { ctrlKey: true });
    click(q('[data-level-index="0"]'));
    click(document.body);
    expect(flat(sound)).toEqual([]);
    key(document, 'ArrowRight');
    expect(flat(sound)).toEqual(['move']);
    key(document, 'u');
    expect(flat(sound)).toEqual(['move']);
  });

  it('plays edit, damage, win and death', () => {
    const edit = fakeSound();
    mountWith(
      FIXTURE_LEVELS,
      { createAudio: () => edit },
      fakeStorage(JSON.stringify({ version: 1, cleared: ['01-fixture-corridor'], current: '02-fixture-lab' })),
    );
    commitEdit('B15', '"x"');
    expect(flat(edit)).toEqual(['edit']);
    handle?.destroy();
    root?.remove();

    const hit = fakeSound();
    mountWith([trapDoc(7)], { createAudio: () => hit });
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    expect(flat(hit)).toEqual(['damage', 'win']);
    handle?.destroy();
    root?.remove();

    const dead = fakeSound();
    mountWith([trapDoc(1)], { createAudio: () => dead });
    key(document, 'ArrowRight');
    expect(flat(dead)).toEqual(['death']);
  });
});

describe('unlock', () => {
  it('unlocks once on the first keydown', () => {
    const sound = fakeSound();
    mountWith(FIXTURE_LEVELS, { createAudio: () => sound });
    key(document, 'ArrowRight');
    key(document, 'ArrowRight', { ctrlKey: true });
    click(document.body);
    expect(sound.calls.unlock).toBe(1);
  });

  it('unlocks on a pointerdown or a click first', () => {
    const a = fakeSound();
    mountWith(FIXTURE_LEVELS, { createAudio: () => a });
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    key(document, ' ');
    expect(a.calls.unlock).toBe(1);
    handle?.destroy();
    root?.remove();
    const b = fakeSound();
    mountWith(FIXTURE_LEVELS, { createAudio: () => b });
    click(document.body);
    key(document, ' ');
    expect(b.calls.unlock).toBe(1);
  });

  it('destroy calls the player destroy once and removes the gesture listeners', () => {
    const sound = fakeSound();
    mountWith(FIXTURE_LEVELS, { createAudio: () => sound });
    handle?.destroy();
    handle?.destroy();
    key(document, ' ');
    click(document.body);
    expect(sound.calls.destroy).toBe(1);
    expect(sound.calls.unlock).toBe(0);
  });

  it('still mounts when createAudio throws', () => {
    mountWith(FIXTURE_LEVELS, {
      createAudio: () => {
        throw new Error('no audio');
      },
    });
    key(document, 'ArrowRight');
    expect(heroAt()).toBe('C2');
  });
});

describe('mute', () => {
  it('toggles, persists and flips aria-pressed', () => {
    const sound = fakeSound();
    const storage = fakeStorage();
    mountWith(FIXTURE_LEVELS, { createAudio: () => sound }, storage);
    expect(button('sound').getAttribute('aria-pressed')).toBe('true');
    click(button('sound'));
    expect(storage.data.get('grimsheet.muted')).toBe('1');
    expect(sound.calls.muted.at(-1)).toBe(true);
    expect(button('sound').getAttribute('aria-pressed')).toBe('false');
    click(button('sound'));
    expect(storage.data.get('grimsheet.muted')).toBe('0');
    expect(sound.calls.muted.at(-1)).toBe(false);
    expect(button('sound').getAttribute('aria-pressed')).toBe('true');
  });

  it('reads the stored value at mount', () => {
    const sound = fakeSound();
    const storage = fakeStorage();
    storage.data.set('grimsheet.muted', '1');
    mountWith(FIXTURE_LEVELS, { createAudio: () => sound }, storage);
    expect(sound.calls.muted).toEqual([true]);
    expect(button('sound').getAttribute('aria-pressed')).toBe('false');
    handle?.destroy();
    root?.remove();
    const other = fakeSound();
    const odd = fakeStorage();
    odd.data.set('grimsheet.muted', 'x');
    mountWith(FIXTURE_LEVELS, { createAudio: () => other }, odd);
    expect(other.calls.muted).toEqual([false]);
    expect(button('sound').getAttribute('aria-pressed')).toBe('true');
  });

  it('still toggles when storage throws', () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error('no read');
      },
      setItem() {
        throw new Error('no write');
      },
    };
    mountWith(FIXTURE_LEVELS, { createAudio: () => fakeSound() }, storage);
    click(button('sound'));
    expect(button('sound').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('title dialog', () => {
  it('renders no title dialog by default', () => {
    mount();
    expect(root?.querySelector('#title-dialog')).toBeNull();
  });

  function open(): void {
    mountWith(FIXTURE_LEVELS, { showTitle: true, createAudio: () => fakeSound() });
  }

  it('blocks game keys and focuses Start', () => {
    open();
    expect(root?.querySelector('#title-dialog')).not.toBeNull();
    expect(q('#window').hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(q('#title-start'));
    key(document, 'ArrowRight');
    key(document, 'ArrowRight', { ctrlKey: true });
    expect(heroAt()).toBe('B2');
    expect(selectedAt()).toBe('B2');
  });

  it('closes on a Start click without spending a turn', () => {
    open();
    click(q('#title-start'));
    expect(root?.querySelector('#title-dialog')).toBeNull();
    expect(q('#window').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(q('#grid-table'));
    expect(heroAt()).toBe('B2');
    expect(text('.status-ink')).toContain('3');
    key(document, 'ArrowRight');
    expect(heroAt()).toBe('C2');
  });

  it.each(['Enter', ' '])('closes on %j via the native click, with no double handling', (k) => {
    open();
    const start = q('#title-start');
    const event = key(start, k);
    expect(event.defaultPrevented).toBe(false);
    expect(root?.querySelector('#title-dialog')).not.toBeNull();
    click(start);
    expect(root?.querySelector('#title-dialog')).toBeNull();
    expect(document.activeElement).toBe(q('#grid-table'));
    expect(heroAt()).toBe('B2');
    expect(text('.status-ink')).toContain('3');
  });

  it('ignores clicks on other controls while open', () => {
    open();
    click(cell('E5'));
    expect(root?.querySelector('#title-dialog')).not.toBeNull();
  });
});

describe('death dialog', () => {
  function die(): void {
    mountWith([trapDoc(1)], { createAudio: () => fakeSound() });
    key(document, 'ArrowRight');
    expect(root?.getAttribute('data-screen')).toBe('lost');
  }

  it('focuses Recover and restarts on click with focus on the grid', () => {
    die();
    expect(document.activeElement).toBe(q('#end-recover'));
    click(q('#end-recover'));
    expect(root?.getAttribute('data-screen')).toBe('playing');
    expect(heroAt()).toBe('B2');
    expect(document.activeElement).toBe(q('#grid-table'));
  });

  it('restarts once on R with focus on the button', () => {
    die();
    const recover = q('#end-recover');
    const event = key(recover, 'r');
    expect(event.defaultPrevented).toBe(true);
    expect(root?.getAttribute('data-screen')).toBe('playing');
    expect(heroAt()).toBe('B2');
  });

  it('leaves Enter to the native click, so it restarts exactly once', () => {
    die();
    const recover = q('#end-recover');
    key(recover, 'Enter');
    expect(root?.getAttribute('data-screen')).toBe('lost');
    click(recover);
    expect(root?.getAttribute('data-screen')).toBe('playing');
  });

  it('does nothing for R on the toolbar Recover while playing without a confirmation', () => {
    mount();
    key(document, 'ArrowRight');
    const recover = button('recover');
    recover.focus();
    key(recover, 'r');
    expect(heroAt()).toBe('C2');
  });
});

describe('win dialog', () => {
  it('focuses Next, and OK on the last level', () => {
    mount();
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    expect(document.activeElement).toBe(q('#win-next'));
    handle?.destroy();
    root?.remove();
    mountWith([FIXTURE_LEVELS[0]]);
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    expect(document.activeElement).toBe(q('#win-ok'));
  });

  it('closes on Escape and on OK and focuses the grid', () => {
    mountWith([FIXTURE_LEVELS[0]]);
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    expect(winDialog().hidden).toBe(false);
    key(document, 'Escape', { ctrlKey: true });
    expect(winDialog().hidden).toBe(false);
    key(document, 'Escape');
    expect(winDialog().hidden).toBe(true);
    expect(document.activeElement).toBe(q('#grid-table'));
    handle?.destroy();
    root?.remove();
    mountWith([FIXTURE_LEVELS[0]]);
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    click(q('#win-ok'));
    expect(winDialog().hidden).toBe(true);
    expect(document.activeElement).toBe(q('#grid-table'));
  });

  it('starts the next level from Next', () => {
    const storage = fakeStorage();
    mount(storage);
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    click(q('#win-next'));
    expect(root?.getAttribute('data-screen')).toBe('playing');
    expect(text('.status-level')).toContain('Lab');
    expect(winDialog().hidden).toBe(true);
    expect(document.activeElement).toBe(q('#grid-table'));
  });

  it('still moves the selection with Ctrl+Arrow while open', () => {
    mount();
    key(document, 'ArrowRight');
    key(document, 'ArrowRight');
    const before = selectedAt();
    key(q('#win-next'), 'ArrowRight', { ctrlKey: true });
    expect(selectedAt()).not.toBe(before);
  });
});

describe('barrel', () => {
  it('exports exactly the expected runtime names', () => {
    expect(Object.keys(barrel).sort()).toEqual(['browserStorage', 'mountApp']);
  });
});
