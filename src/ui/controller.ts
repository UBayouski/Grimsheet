import { formatAddress, parseAddress } from '../engine/index';
import { applyAction, startRun } from '../game/index';
import type { Action, ActionResult, RunState, StartRunResult } from '../game/index';
import { decide, promptFor } from './confirmation';
import type { Wanted } from './confirmation';
import { damageSummary, endMessage, refusalMessage } from './messages';
import { isTabEnabled, startIndexFor } from './progress';
import { STRINGS } from './strings';
import type {
  AppState,
  Effect,
  Env,
  FocusKind,
  KeyContext,
  Pending,
  Progress,
  UiEvent,
} from './types';
import { changedAddresses, moveSelection } from './view-model';

export interface StepResult {
  readonly state: AppState;
  readonly effects: readonly Effect[];
}

const NO_EFFECTS: readonly Effect[] = [];
const SEPARATOR_ROW = 13;
const EMPTY_CHANGED: ReadonlySet<string> = new Set<string>();

function unchanged(state: AppState): StepResult {
  return { state, effects: NO_EFFECTS };
}

function tryStartRun(doc: unknown): StartRunResult | undefined {
  try {
    return startRun(doc);
  } catch {
    return undefined;
  }
}

/**
 * Starts the level at `index`. A disabled or missing tab is ignored (state returned as is).
 * A failed start keeps the previous run, selection and progress and shows the load-failed Message.
 */
function startLevel(state: AppState, index: number, env: Env): StepResult {
  const entry = env.entries[index];
  if (entry === undefined || !isTabEnabled(env.entries, state.progress.cleared, index)) {
    return unchanged(state);
  }
  const started = tryStartRun(entry.doc);
  if (started === undefined || !started.ok) {
    return unchanged({ ...state, message: STRINGS.loadFailed, pending: undefined });
  }
  const run = started.state;
  const progress: Progress = { ...state.progress, current: entry.id };
  return {
    state: {
      ...state,
      levelIndex: index,
      run,
      selection: run.hero,
      edit: undefined,
      alert: '',
      pending: undefined,
      changed: EMPTY_CHANGED,
      message: run.level.hint,
      progress,
    },
    effects: [
      { type: 'save-progress', progress },
      { type: 'focus', target: 'grid' },
    ],
  };
}

export function createInitialState(env: Env, progress: Progress): AppState {
  const index = startIndexFor(env.entries, progress);
  const base: AppState = {
    levelIndex: index,
    run: undefined,
    selection: 'A1',
    edit: undefined,
    pending: undefined,
    message: '',
    alert: '',
    changed: EMPTY_CHANGED,
    progress,
  };
  const started = startLevel(base, index, env).state;
  return started.run === undefined ? { ...started, message: STRINGS.loadFailed } : started;
}

export function keyContext(state: AppState, env: Env, focus: FocusKind): KeyContext {
  return {
    screen: state.run === undefined ? 'none' : state.run.status,
    focus,
    editing: state.edit !== undefined,
    pending: state.pending === undefined ? undefined : state.pending.kind,
    hasNext: state.levelIndex + 1 < env.entries.length,
  };
}

/** Applies an accepted Action: new run, changed set, Message and progress on a win. */
function accept(
  state: AppState,
  prev: RunState,
  result: Extract<ActionResult, { readonly ok: true }>,
  fallbackMessage: string,
  env: Env,
): StepResult {
  const run = result.state;
  const isLast = state.levelIndex + 1 >= env.entries.length;
  const summary = damageSummary(result.damage);
  let message: string;
  if (run.status === 'won') message = endMessage('won', isLast);
  else if (summary !== '') message = summary;
  else message = fallbackMessage;

  let progress = state.progress;
  let effects = NO_EFFECTS;
  if (prev.status === 'playing' && run.status === 'won') {
    const id = env.entries[state.levelIndex]?.id ?? run.level.id;
    if (!progress.cleared.includes(id)) {
      progress = { ...progress, cleared: [...progress.cleared, id] };
    }
    effects = [{ type: 'save-progress', progress }];
  }
  return {
    state: {
      ...state,
      run,
      changed: changedAddresses(prev, run),
      message,
      alert: '',
      progress,
    },
    effects,
  };
}

function turn(state: AppState, action: Action, env: Env): StepResult {
  const run = state.run;
  if (run === undefined || run.status !== 'playing') return unchanged(state);
  const result = applyAction(run, action);
  if (result.ok) {
    const fallback = action.kind === 'undo' ? STRINGS.undone : run.level.hint;
    return accept(state, run, result, fallback, env);
  }
  const message = refusalMessage(result, action);
  if (message === undefined) return unchanged(state);
  return unchanged({ ...state, message });
}

function select(state: AppState, address: string): StepResult {
  const parsed = parseAddress(address);
  if (!parsed.ok || parsed.point.row === SEPARATOR_ROW) return unchanged(state);
  return unchanged({ ...state, selection: formatAddress(parsed.point), alert: '' });
}

/** Restart or switch: prompt, execute at once, or (cannot happen without a pending) cancel. */
function request(state: AppState, wanted: Wanted, env: Env): StepResult {
  const status = state.run === undefined ? undefined : state.run.status;
  const decision = decide(status, state.pending, wanted);
  if (decision === 'prompt') {
    const pending: Pending = {
      kind: wanted.kind,
      levelIndex: wanted.levelIndex,
      restoreMessage: state.message,
    };
    return unchanged({ ...state, pending, message: promptFor(wanted, env.entries) });
  }
  if (decision === 'execute') return startLevel({ ...state, pending: undefined }, wanted.levelIndex, env);
  return unchanged(state);
}

function clearPending(state: AppState, pending: Pending): AppState {
  return { ...state, pending: undefined, message: pending.restoreMessage };
}

function confirmsPending(state: AppState, pending: Pending, event: UiEvent): boolean {
  if (event.type === 'command') {
    if (event.command.type === 'confirm') return true;
    return event.command.type === 'restart' && pending.kind === 'restart';
  }
  if (event.type === 'tab') {
    if (pending.kind === 'switch') return event.levelIndex === pending.levelIndex;
    return event.levelIndex === state.levelIndex;
  }
  return false;
}

/** Rule P: what a pending confirmation does with an event. `undefined` means "not handled here". */
function handlePending(
  state: AppState,
  pending: Pending,
  event: UiEvent,
  env: Env,
): StepResult | undefined {
  if (confirmsPending(state, pending, event)) {
    return startLevel({ ...state, pending: undefined }, pending.levelIndex, env);
  }
  if (
    event.type === 'dismiss-pending' ||
    (event.type === 'command' && event.command.type === 'cancel')
  ) {
    return unchanged(clearPending(state, pending));
  }
  if (
    event.type === 'cell-click' ||
    event.type === 'cell-dblclick' ||
    event.type === 'formula-focus'
  ) {
    return undefined;
  }
  return unchanged(clearPending(state, pending));
}

function handleEvent(state: AppState, event: UiEvent, env: Env): StepResult {
  switch (event.type) {
    case 'cell-click':
      return select(state, event.address);
    case 'tab': {
      const index = event.levelIndex;
      if (!isTabEnabled(env.entries, state.progress.cleared, index)) return unchanged(state);
      const kind = index === state.levelIndex ? 'restart' : 'switch';
      return request(state, { kind, levelIndex: index }, env);
    }
    case 'command':
      break;
    default:
      // Edit events belong to part B.
      return unchanged(state);
  }
  const command = event.command;
  switch (command.type) {
    case 'move':
      return turn(state, { kind: 'move', dir: command.dir }, env);
    case 'wait':
      return turn(state, { kind: 'wait' }, env);
    case 'undo':
      return turn(state, { kind: 'undo' }, env);
    case 'select-move':
      if (state.run === undefined) return unchanged(state);
      return unchanged({
        ...state,
        selection: moveSelection(state.selection, command.dir),
        alert: '',
      });
    case 'restart':
      if (state.run === undefined) return unchanged(state);
      return request(state, { kind: 'restart', levelIndex: state.levelIndex }, env);
    case 'next-level':
      if (state.run === undefined || state.run.status !== 'won') return unchanged(state);
      return startLevel(state, state.levelIndex + 1, env);
    default:
      // Edit commands belong to part B; confirm and cancel need a pending prompt.
      return unchanged(state);
  }
}

/** One pure transition. Calls `startRun` and `applyAction`, never mutates a received state. */
export function step(state: AppState, event: UiEvent, env: Env): StepResult {
  if (event.type === 'formula-blur' && state.edit === undefined) return unchanged(state);
  const pending = state.pending;
  if (pending !== undefined) {
    const handled = handlePending(state, pending, event, env);
    if (handled !== undefined) return handled;
    return handleEvent(clearPending(state, pending), event, env);
  }
  return handleEvent(state, event, env);
}
