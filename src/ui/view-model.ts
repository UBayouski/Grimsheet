import { formatAddress, formatValue, parseAddress } from '../engine/index';
import type { Value } from '../engine/index';
import { canUndo, cellName, cellRawText, cellValue, isCellLocked, isPlaying } from '../game/index';
import type { RunState } from '../game/index';
import { tabLabel } from '../model/index';
import { isTabEnabled } from './progress';
import { STRINGS } from './strings';
import type { CellView, Direction, Env, Progress, TabView, ViewModel } from './types';

/** The part of the app state that `viewOf` reads. `AppState` satisfies it. */
interface ViewState {
  readonly levelIndex: number;
  readonly run: RunState | undefined;
  readonly selection: string;
  readonly edit: { readonly text: string } | undefined;
  readonly message: string;
  readonly alert: string;
  readonly changed: ReadonlySet<string>;
  readonly progress: Progress;
}

const COLUMNS = 12;
const ROWS = 20;
const SEPARATOR_ROW = 13;
const LAST_MAP_ROW = 12;

/** Rendered rows in order: 1 to 12, then 14 to 20 (19 rows). */
const RENDERED_ROWS: readonly number[] = Array.from({ length: ROWS }, (_, i) => i + 1).filter(
  (row) => row !== SEPARATOR_ROW,
);

function addressOf(col: number, row: number): string {
  return formatAddress({ col, row });
}

function terrainWord(text: string): string {
  switch (text) {
    case '.':
      return STRINGS.terrain.floor;
    case '#':
      return STRINGS.terrain.wall;
    case 'X':
      return STRINGS.terrain.exit;
    case '^':
      return STRINGS.terrain.trap;
    case '':
      return STRINGS.terrain.empty;
    default:
      return text;
  }
}

function entityAt(
  run: RunState | undefined,
  address: string,
): CellView['entity'] {
  if (run === undefined) return undefined;
  if (run.hero === address) return { type: 'hero' };
  const monster = run.monsters.find((m) => m.at === address);
  return monster === undefined ? undefined : { type: 'monster', id: monster.id };
}

function cellViewOf(state: ViewState, col: number, row: number): CellView {
  const run = state.run;
  const address = addressOf(col, row);
  const value: Value | undefined = run === undefined ? undefined : cellValue(run, address);
  const text = value === undefined ? '' : formatValue(value);
  const entity = entityAt(run, address);
  let ariaLabel: string | undefined;
  if (entity !== undefined) {
    const who = entity.type === 'hero' ? STRINGS.entity.hero : STRINGS.entity.monster(entity.id);
    ariaLabel = `${who} at ${address} on ${terrainWord(text)}`;
  }
  return {
    address,
    row,
    col,
    region: row <= LAST_MAP_ROW ? 'map' : 'rules',
    text,
    errorKind: value !== undefined && value.kind === 'error' ? value.error : undefined,
    name: run === undefined ? undefined : cellName(run, address),
    locked: run === undefined ? false : isCellLocked(run, address) === true,
    entity,
    selected: address === state.selection,
    changed: state.changed.has(address),
    ariaLabel,
  };
}

function tabsOf(state: ViewState, env: Env): TabView[] {
  return env.entries.map((entry, levelIndex) => ({
    levelIndex,
    label: entry.label,
    current: levelIndex === state.levelIndex,
    enabled: isTabEnabled(env.entries, state.progress.cleared, levelIndex),
  }));
}

/** Builds every derived field the renderer needs. Total: a missing run gives empty cells. */
export function viewOf(state: ViewState, env: Env): ViewModel {
  const run = state.run;
  const screen = run === undefined ? 'playing' : run.status;
  const selection = state.selection;

  const selectedName = run === undefined ? undefined : cellName(run, selection);
  const selectedLocked = run === undefined ? false : isCellLocked(run, selection) === true;
  const playing = run !== undefined && isPlaying(run);
  const rawText = run === undefined ? undefined : cellRawText(run, selection);

  const rows = RENDERED_ROWS.map((row) =>
    Array.from({ length: COLUMNS }, (_, i) => cellViewOf(state, i + 1, row)),
  );

  const entry = env.entries[state.levelIndex];
  const label = run === undefined ? (entry?.label ?? '') : tabLabel(run.level);

  return {
    screen,
    tabs: tabsOf(state, env),
    nameBox: selectedName === undefined ? selection : `${selection} ${selectedName}`,
    formula: {
      text: state.edit !== undefined ? state.edit.text : (rawText ?? ''),
      readOnly: selectedLocked || !playing,
      locked: selectedLocked,
      alert: state.alert,
    },
    status: {
      label,
      hp:
        run === undefined
          ? ''
          : `${STRINGS.status.hp} ${Math.max(run.hp, 0)}/${run.level.startingHp}`,
      ink: run === undefined ? '' : `${STRINGS.status.ink} ${run.ink}/${run.level.ink}`,
      turn: run === undefined ? '' : `${STRINGS.status.turn} ${run.turn}`,
    },
    message: state.message,
    banner:
      screen === 'lost'
        ? { kind: 'lost', title: STRINGS.lostTitle, body: STRINGS.lostBody }
        : undefined,
    buttons: {
      undoEnabled: run !== undefined && isPlaying(run) && canUndo(run),
      recoverEnabled: run !== undefined,
      nextVisible: screen === 'won' && state.levelIndex + 1 < env.entries.length,
    },
    activeCell: selection,
    rows,
  };
}

function signature(run: RunState | undefined, address: string): string {
  const value = run === undefined ? undefined : cellValue(run, address);
  return value === undefined ? '' : `${value.kind}|${formatValue(value)}`;
}

/** Addresses (of the 228 rendered cells) whose Value text or kind differs. Empty when `prev` is undefined. */
export function changedAddresses(
  prev: RunState | undefined,
  next: RunState | undefined,
): ReadonlySet<string> {
  const changed = new Set<string>();
  if (prev === undefined || next === undefined) return changed;
  for (const row of RENDERED_ROWS) {
    for (let col = 1; col <= COLUMNS; col += 1) {
      const address = addressOf(col, row);
      if (signature(prev, address) !== signature(next, address)) changed.add(address);
    }
  }
  return changed;
}

/** One step of Selection movement, clamped to A..L and rows 1..20, skipping row 13. */
export function moveSelection(address: string, dir: Direction): string {
  const parsed = parseAddress(address);
  if (!parsed.ok) return address;
  let { col, row } = parsed.point;
  if (dir === 'W') col = Math.max(1, col - 1);
  else if (dir === 'E') col = Math.min(COLUMNS, col + 1);
  else if (dir === 'N') {
    row = Math.max(1, row - 1);
    if (row === SEPARATOR_ROW) row -= 1;
  } else {
    row = Math.min(ROWS, row + 1);
    if (row === SEPARATOR_ROW) row += 1;
  }
  return addressOf(col, row);
}
