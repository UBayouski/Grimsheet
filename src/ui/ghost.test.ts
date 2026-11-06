// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './app';
import { PROGRESS_KEY } from './progress';
import type { AppHandle, MediaQueryLike, StorageLike } from './types';

// --- Levels -----------------------------------------------------------------

const WALL = '############';
const FLOOR = '#..........#';
// A 12x12 room, hero on floor B2, exit X at K11, no monster.
const MAP = [WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, '#.........X#', WALL];

/** A level whose cells build a two-cell cycle J9<->K9 and one downstream #CYCLE! at L9. */
function twoCycleLevel(): unknown {
  return {
    schemaVersion: 1,
    id: '03-ghost-two',
    title: 'Ghost Two',
    hint: 'Look at the errors.',
    map: MAP,
    cells: [
      { address: 'J9', raw: '=K9' },
      { address: 'K9', raw: '=J9' },
      { address: 'L9', raw: '=K9+1' },
    ],
    hero: { at: 'B2' },
    monsters: [],
    startingHp: 99,
    ink: 9,
    seed: 3,
  };
}

/** A level with exactly one Cycle_Cell: J9 refers to itself. */
function oneCycleLevel(): unknown {
  return {
    schemaVersion: 1,
    id: '03-ghost-one',
    title: 'Ghost One',
    hint: 'Look at the error.',
    map: MAP,
    cells: [{ address: 'J9', raw: '=J9' }],
    hero: { at: 'B2' },
    monsters: [],
    startingHp: 99,
    ink: 9,
    seed: 3,
  };
}

// --- matchMedia stub --------------------------------------------------------

interface MatchMediaStub extends MediaQueryLike {
  set(value: boolean): void;
  readonly listenerCount: number;
}

/** A MediaQueryLike whose `matches` can be flipped with `set`, notifying `change` listeners. */
function makeMatchMedia(initial: boolean): MatchMediaStub {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get matches() {
      return current;
    },
    addEventListener(_type: 'change', listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: 'change', listener: () => void) {
      listeners.delete(listener);
    },
    set(value: boolean) {
      current = value;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

// --- Harness ----------------------------------------------------------------

function fakeStorage(): StorageLike {
  const data = new Map<string, string>();
  data.set(PROGRESS_KEY, JSON.stringify({ version: 1, cleared: [], current: '03-ghost-two' }));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

let handle: AppHandle | undefined;
let root: HTMLElement | undefined;

interface MountResult {
  readonly root: HTMLElement;
  readonly handle: AppHandle;
  readonly media: MatchMediaStub | undefined;
}

function mount(
  level: unknown,
  opts: { reduced?: boolean; matchMedia?: () => MediaQueryLike } = {},
): MountResult {
  root = document.createElement('div');
  document.body.append(root);
  let media: MatchMediaStub | undefined;
  let matchMedia: (query: string) => MediaQueryLike;
  if (opts.matchMedia !== undefined) {
    matchMedia = opts.matchMedia;
  } else {
    media = makeMatchMedia(opts.reduced ?? false);
    matchMedia = () => media as MediaQueryLike;
  }
  handle = mountApp(root, { levels: [level], storage: fakeStorage(), matchMedia });
  return { root, handle, media };
}

afterEach(() => {
  handle?.destroy();
  root?.remove();
  handle = undefined;
  root = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

const q = <T extends Element>(r: HTMLElement, sel: string): T => {
  const el = r.querySelector<T>(sel);
  if (el === null) throw new Error(`missing ${sel}`);
  return el;
};

const ghostAddress = (r: HTMLElement): string | null => {
  const marked = r.querySelectorAll('[data-ghost]');
  if (marked.length === 0) return null;
  return marked[0]?.getAttribute('data-address') ?? null;
};

const ghostCount = (r: HTMLElement): number => r.querySelectorAll('[data-ghost]').length;

const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
};
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};
const cell = (r: HTMLElement, address: string): Element => q(r, `[data-address="${address}"]`);
const bar = (r: HTMLElement): HTMLInputElement => q<HTMLInputElement>(r, '#formula-bar');
const button = (r: HTMLElement, control: string): HTMLButtonElement =>
  q<HTMLButtonElement>(r, `[data-control="${control}"]`);

function type(r: HTMLElement, value: string): void {
  bar(r).value = value;
  bar(r).dispatchEvent(new Event('input', { bubbles: true }));
}

/** Commit an edit of `address` to `value` through the formula bar. */
function commitEdit(r: HTMLElement, address: string, value: string): void {
  click(cell(r, address));
  key(document, 'Enter');
  type(r, value);
  key(bar(r), 'Enter');
}

// --- Tests ------------------------------------------------------------------

describe('ghost drift', () => {
  it('starts on J9, drifts to K9 after 800 ms and back to J9 after 1600 ms', () => {
    const { root } = mount(twoCycleLevel());
    expect(ghostAddress(root)).toBe('J9');
    expect(ghostCount(root)).toBe(1);
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('K9');
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('J9');
    expect(ghostCount(root)).toBe(1);
  });

  it('never visits the downstream L9 cell', () => {
    const { root } = mount(twoCycleLevel());
    const seen = new Set<string | null>();
    for (let i = 0; i < 6; i += 1) {
      seen.add(ghostAddress(root));
      vi.advanceTimersByTime(800);
    }
    expect(seen.has('L9')).toBe(false);
    expect([...seen].sort()).toEqual(['J9', 'K9']);
  });

  it('shows the ghost on a single Cycle_Cell with no timer', () => {
    const { root } = mount(oneCycleLevel());
    expect(ghostAddress(root)).toBe('J9');
    expect(ghostCount(root)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the ghost and does not restart the timer on a move', () => {
    const { root } = mount(twoCycleLevel());
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('K9');
    // A move happens before the next 800 ms tick; the timer must not restart.
    vi.advanceTimersByTime(400);
    key(document, 'ArrowRight');
    expect(ghostAddress(root)).toBe('K9');
    vi.advanceTimersByTime(400);
    // 800 ms since the last tick: the ghost advances, proving the timer was not reset by the move.
    expect(ghostAddress(root)).toBe('J9');
  });

  it('removes the ghost and the timer when an edit breaks the cycle', () => {
    const { root } = mount(twoCycleLevel());
    expect(ghostAddress(root)).toBe('J9');
    commitEdit(root, 'K9', '0');
    expect(ghostCount(root)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ghost reset', () => {
  it('resets to the first cell and restarts the timer when the Cycle_Cell set changes', () => {
    const { root } = mount(twoCycleLevel());
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('K9');
    // Break the J9<->K9 cycle and make a new one on H9<->J9 by editing K9 and H9.
    commitEdit(root, 'K9', '=H9');
    commitEdit(root, 'H9', '=J9');
    // The new reading-order-first Cycle_Cell is H9; the ghost resets to it.
    expect(ghostAddress(root)).toBe('H9');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('J9');
  });

  it('resets a ghost on K9 back to J9 with one timer on a level-reference change', () => {
    const { root } = mount(twoCycleLevel());
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('K9');
    // Recover: click once to arm, click again to confirm, which calls startRun (new Level reference).
    click(button(root, 'recover'));
    click(button(root, 'recover'));
    expect(ghostAddress(root)).toBe('J9');
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('reduced motion', () => {
  it('keeps the ghost still on J9 with no timer when matches is true', () => {
    const { root } = mount(twoCycleLevel(), { reduced: true });
    expect(ghostAddress(root)).toBe('J9');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(ghostAddress(root)).toBe('J9');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the drift on set(true) and restarts on set(false) without a remount', () => {
    const { root, media } = mount(twoCycleLevel());
    expect(media).toBeDefined();
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('K9');
    media?.set(true);
    expect(ghostAddress(root)).toBe('J9');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(ghostAddress(root)).toBe('J9');
    media?.set(false);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(800);
    expect(ghostAddress(root)).toBe('K9');
  });

  it('shows a still ghost and no timer when matchMedia throws', () => {
    const { root } = mount(twoCycleLevel(), {
      matchMedia: () => {
        throw new Error('no media');
      },
    });
    expect(ghostAddress(root)).toBe('J9');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(ghostAddress(root)).toBe('J9');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('teardown', () => {
  it('leaves no timer, no listener, and runs no tick after destroy', () => {
    const { root, handle, media } = mount(twoCycleLevel());
    expect(vi.getTimerCount()).toBe(1);
    expect(media?.listenerCount).toBe(1);
    const before = ghostAddress(root);
    handle.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(media?.listenerCount).toBe(0);
    vi.advanceTimersByTime(5000);
    // The DOM is torn down; no queued tick touches it.
    expect(root.querySelectorAll('[data-ghost]').length).toBe(0);
    expect(before).toBe('J9');
  });

  it('leaves no timer after two mounts and two destroys', () => {
    const first = mount(twoCycleLevel());
    expect(vi.getTimerCount()).toBe(1);
    const firstRoot = first.root;
    const firstHandle = first.handle;

    const second = mount(twoCycleLevel());
    expect(vi.getTimerCount()).toBe(2);

    firstHandle.destroy();
    firstRoot.remove();
    expect(vi.getTimerCount()).toBe(1);

    second.handle.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
