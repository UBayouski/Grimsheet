import { createInitialState, keyContext, step } from './controller';
import { GHOST_INTERVAL_MS, nextGhostCell, placeGhost, sameCells } from './error-look';
import { mapKey } from './key-map';
import { createProgressStore, describeLevels } from './progress';
import { createView } from './render';
import { STRINGS } from './strings';
import type {
  AppHandle,
  AppState,
  Effect,
  Env,
  FocusKind,
  KeyCommand,
  MediaQueryLike,
  MountOptions,
  StorageLike,
  UiEvent,
  ViewModel,
} from './types';
import type { Level, RunState } from '../game/index';
import { viewOf } from './view-model';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** Wraps `localStorage`; falls back to memory when the global cannot be read. */
export function browserStorage(): StorageLike {
  let local: Storage;
  try {
    local = localStorage;
  } catch {
    return memoryStorage();
  }
  return {
    getItem: (key) => local.getItem(key),
    setItem: (key, value) => {
      local.setItem(key, value);
    },
  };
}

/** Classifies an event target for the Key_Map. */
function focusKind(target: EventTarget | null): FocusKind {
  const el = target as Element | null;
  if (el === null || typeof el.tagName !== 'string') return 'other';
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'text';
  const editable = (el as HTMLElement).isContentEditable === true;
  const attr = el.getAttribute('contenteditable');
  if (editable || attr === '' || attr === 'true' || attr === 'plaintext-only') return 'text';
  if (tag === 'button') return 'button';
  return 'other';
}

export function mountApp(root: HTMLElement, options: MountOptions): AppHandle {
  const doc = root.ownerDocument;
  const entries = describeLevels(options.levels);
  const env: Env = { entries };
  const store = createProgressStore(
    options.storage,
    entries.map((entry) => entry.id),
  );
  const view = createView(root);
  const formulaBar = root.querySelector<HTMLInputElement>('#formula-bar');
  const table = root.querySelector<HTMLElement>('#grid-table');

  let state: AppState = createInitialState(env, store.load());
  let destroyed = false;

  // The ghost lives in closure variables, not in AppState. Its position changes on a timer that never
  // goes through `step` (no render, no controller call), so `step` and `viewOf` stay pure.
  let ghostCells: readonly string[] = [];
  let ghostAt: string | undefined;
  let seenLevel: Level | undefined;
  let ghostTimer: ReturnType<typeof setInterval> | undefined;
  let reduced: boolean;

  function stopTimer(): void {
    if (ghostTimer !== undefined) {
      clearInterval(ghostTimer);
      ghostTimer = undefined;
    }
  }

  function startTimer(): void {
    stopTimer();
    if (!destroyed) ghostTimer = setInterval(tick, GHOST_INTERVAL_MS);
  }

  function tick(): void {
    if (destroyed) return;
    ghostAt = nextGhostCell(ghostCells, ghostAt);
    view.setGhost(ghostAt);
  }

  function paint(vm: ViewModel, run: RunState | undefined): void {
    view.update(vm);
    const levelChanged = run?.level !== seenLevel;
    seenLevel = run?.level;
    const changed = levelChanged || !sameCells(ghostCells, vm.ghostCells);
    ghostAt = placeGhost({
      prevCells: ghostCells,
      prevAt: ghostAt,
      cells: vm.ghostCells,
      levelChanged,
      still: reduced,
    });
    ghostCells = vm.ghostCells;
    view.setGhost(ghostAt);
    if (ghostCells.length < 2 || reduced) stopTimer();
    else if (changed || ghostTimer === undefined) startTimer();
  }

  const QUERY = '(prefers-reduced-motion: reduce)';
  function readMotion(): MediaQueryLike | undefined {
    try {
      const win = doc.defaultView;
      const ask =
        options.matchMedia ??
        (win !== null && typeof win.matchMedia === 'function'
          ? (q: string) => win.matchMedia(q)
          : undefined);
      return ask?.(QUERY);
    } catch {
      return undefined;
    }
  }
  const motion = readMotion();
  reduced = motion === undefined || motion.matches !== false;
  const onMotion = (): void => {
    if (destroyed) return;
    reduced = motion === undefined || motion.matches !== false;
    ghostAt = placeGhost({
      prevCells: ghostCells,
      prevAt: ghostAt,
      cells: ghostCells,
      levelChanged: false,
      still: reduced,
    });
    view.setGhost(ghostAt);
    if (reduced || ghostCells.length < 2) stopTimer();
    else startTimer();
  };
  motion?.addEventListener?.('change', onMotion);

  paint(viewOf(state, env), state.run);
  // Startup effects (focus the grid) were dropped before; run them so play starts with the grid focused.
  runEffect({ type: 'focus', target: 'grid' });

  function runEffect(effect: Effect): void {
    try {
      switch (effect.type) {
        case 'focus': {
          const target = effect.target === 'grid' ? table : formulaBar;
          target?.focus({ preventScroll: true });
          break;
        }
        case 'select-formula-text':
          formulaBar?.select();
          break;
        case 'save-progress':
          store.save(effect.progress);
          break;
      }
    } catch {
      // An effect failing must not break the app.
    }
  }

  function fail(): void {
    try {
      state = { ...state, message: STRINGS.somethingWrong };
      paint(viewOf(state, env), state.run);
    } catch {
      // Nothing more can be done.
    }
  }

  function dispatch(event: UiEvent): void {
    if (destroyed) return;
    let effects: readonly Effect[];
    try {
      const result = step(state, event, env);
      const vm = viewOf(result.state, env);
      state = result.state;
      paint(vm, result.state.run);
      effects = result.effects;
    } catch {
      fail();
      return;
    }
    for (const effect of effects) runEffect(effect);
  }

  function guarded<E extends Event>(handler: (event: E) => void): (event: E) => void {
    return (event) => {
      if (destroyed) return;
      try {
        handler(event);
      } catch {
        fail();
      }
    };
  }

  function command(cmd: KeyCommand): void {
    dispatch({ type: 'command', command: cmd });
  }

  const onKeyDown = guarded<KeyboardEvent>((e) => {
    const context = keyContext(state, env, focusKind(e.target));
    const result = mapKey(
      {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        composing: e.isComposing,
      },
      context,
    );
    if (result === undefined) return;
    if (result.preventDefault) e.preventDefault();
    command(result.command);
    // Game keys work from the body (design: focus management), but focus belongs on the grid during play.
    if (doc.activeElement === null || doc.activeElement === doc.body) {
      runEffect({ type: 'focus', target: 'grid' });
    }
  });

  const onClick = guarded<MouseEvent>((e) => {
    const target = e.target as Element | null;
    if (target === null || typeof target.closest !== 'function' || !root.contains(target)) {
      dispatch({ type: 'dismiss-pending' });
      return;
    }
    const button = target.closest('button');
    if (button !== null) {
      if (button.disabled) return;
      switch (button.getAttribute('data-control')) {
        case 'undo':
          command({ type: 'undo' });
          break;
        case 'recover':
          command({ type: 'restart' });
          break;
        case 'next':
          command({ type: 'next-level' });
          break;
        case 'tab': {
          const index = Number(button.getAttribute('data-level-index'));
          if (Number.isInteger(index)) dispatch({ type: 'tab', levelIndex: index });
          break;
        }
        default:
          dispatch({ type: 'dismiss-pending' });
      }
      return;
    }
    if (target.closest('#formula-bar') !== null) return;
    const cell = target.closest('[data-address]');
    const address = cell?.getAttribute('data-address');
    if (address) {
      dispatch({ type: 'cell-click', address });
      return;
    }
    dispatch({ type: 'dismiss-pending' });
  });

  const onDblClick = guarded<MouseEvent>((e) => {
    const target = e.target as Element | null;
    const address = target?.closest?.('[data-address]')?.getAttribute('data-address');
    if (address) dispatch({ type: 'cell-dblclick', address });
  });

  const onInput = guarded<Event>((e) => {
    if (e.target !== formulaBar || formulaBar === null) return;
    dispatch({ type: 'formula-input', text: formulaBar.value });
  });

  const onFocus = guarded<Event>(() => dispatch({ type: 'formula-focus' }));
  const onBlur = guarded<Event>(() => dispatch({ type: 'formula-blur' }));

  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('click', onClick);
  root.addEventListener('dblclick', onDblClick);
  root.addEventListener('input', onInput);
  formulaBar?.addEventListener('focus', onFocus);
  formulaBar?.addEventListener('blur', onBlur);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stopTimer();
      motion?.removeEventListener?.('change', onMotion);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('click', onClick);
      root.removeEventListener('dblclick', onDblClick);
      root.removeEventListener('input', onInput);
      formulaBar?.removeEventListener('focus', onFocus);
      formulaBar?.removeEventListener('blur', onBlur);
      root.textContent = '';
    },
  };
}
