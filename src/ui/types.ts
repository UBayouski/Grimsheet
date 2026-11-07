import type { ErrorKind } from '../engine/index';
import type { RunState } from '../game/index';

/** Same literal unions the game uses, defined here so this file imports nothing from src/game/. */
export type Direction = 'N' | 'S' | 'E' | 'W';
export type Status = 'playing' | 'won' | 'lost';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export type Cue = 'move' | 'edit' | 'damage' | 'win' | 'death';

/** Turn_Effects: set by the controller on every accepted Action. */
export interface Fx {
  readonly beat: 0 | 1;
  /** Direction the hero travelled by exactly one cell; undefined otherwise. */
  readonly slide: Direction | undefined;
  readonly damaged: boolean;
  readonly cues: readonly Cue[];
}

export interface SoundPlayer {
  unlock(): void;
  play(cues: readonly Cue[]): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

export interface MountOptions {
  readonly levels: readonly unknown[];
  readonly storage: StorageLike;
  readonly matchMedia?: (query: string) => MediaQueryLike;
  /** Show the Title_Dialog after mounting. Absent or false: no title dialog. */
  readonly showTitle?: boolean;
  /** Test seam for the Sound_Player. */
  readonly createAudio?: () => SoundPlayer;
}

export interface AppHandle {
  destroy(): void;
}

export interface Progress {
  readonly version: 1;
  readonly cleared: readonly string[];
  readonly current: string | null;
}

export interface LevelEntry {
  readonly id: string;
  readonly title: string;
  readonly label: string;
  readonly doc: unknown;
}

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly composing: boolean;
}

export type FocusKind = 'text' | 'button' | 'other';

export interface KeyContext {
  readonly screen: Status | 'none';
  readonly focus: FocusKind;
  readonly editing: boolean;
  readonly pending: 'restart' | 'switch' | undefined;
  readonly hasNext: boolean;
}

export type KeyCommand =
  | { readonly type: 'move'; readonly dir: Direction }
  | { readonly type: 'wait' }
  | { readonly type: 'undo' }
  | { readonly type: 'restart' }
  | { readonly type: 'next-level' }
  | { readonly type: 'select-move'; readonly dir: Direction }
  | { readonly type: 'edit-start' }
  | { readonly type: 'edit-commit' }
  | { readonly type: 'edit-cancel' }
  | { readonly type: 'confirm' }
  | { readonly type: 'cancel' };

export interface Pending {
  readonly kind: 'restart' | 'switch';
  readonly levelIndex: number;
  readonly restoreMessage: string;
}

export interface Env {
  readonly entries: readonly LevelEntry[];
}

export interface AppState {
  /** Index into `env.entries`. */
  readonly levelIndex: number;
  /** `undefined` when no level could be started. */
  readonly run: RunState | undefined;
  /** Canonical address, never in row 13. */
  readonly selection: string;
  /** Edit_Mode and its pending text. */
  readonly edit: { readonly text: string } | undefined;
  readonly pending: Pending | undefined;
  readonly message: string;
  /** Parse-error text shown beside the formula bar. */
  readonly alert: string;
  /** Changed_Marker addresses. */
  readonly changed: ReadonlySet<string>;
  readonly progress: Progress;
  /** Turn_Effects of the last accepted Action. */
  readonly fx: Fx;
}

export type UiEvent =
  | { readonly type: 'command'; readonly command: KeyCommand }
  | { readonly type: 'tab'; readonly levelIndex: number }
  | { readonly type: 'cell-click'; readonly address: string }
  | { readonly type: 'cell-dblclick'; readonly address: string }
  | { readonly type: 'formula-input'; readonly text: string }
  | { readonly type: 'formula-focus' }
  | { readonly type: 'formula-blur' }
  | { readonly type: 'dismiss-pending' };

export type Effect =
  | { readonly type: 'focus'; readonly target: 'grid' | 'formula-bar' }
  | { readonly type: 'select-formula-text' }
  | { readonly type: 'save-progress'; readonly progress: Progress };

export interface CellView {
  readonly address: string;
  readonly row: number;
  readonly col: number;
  readonly region: 'map' | 'rules';
  readonly text: string;
  readonly errorKind: ErrorKind | undefined;
  /** Defined exactly when `errorKind` is defined (invariant held by the view model). */
  readonly cause: string | undefined;
  readonly name: string | undefined;
  readonly locked: boolean;
  readonly entity:
    | { readonly type: 'hero' }
    | { readonly type: 'monster'; readonly id: string }
    | undefined;
  readonly selected: boolean;
  readonly changed: boolean;
  readonly ariaLabel: string | undefined;
  /** Direction the hero just slid in; set only on the hero cell. */
  readonly slide: Direction | undefined;
}

export interface TabView {
  readonly levelIndex: number;
  readonly label: string;
  readonly current: boolean;
  readonly enabled: boolean;
}

export interface ViewModel {
  readonly screen: Status;
  readonly tabs: readonly TabView[];
  readonly nameBox: string;
  readonly formula: {
    readonly text: string;
    readonly readOnly: boolean;
    readonly locked: boolean;
    readonly alert: string;
  };
  readonly status: {
    readonly label: string;
    readonly hp: string;
    readonly ink: string;
    readonly turn: string;
  };
  readonly message: string;
  readonly banner:
    | { readonly kind: 'lost'; readonly title: string; readonly body: string }
    | undefined;
  readonly buttons: {
    readonly undoEnabled: boolean;
    readonly recoverEnabled: boolean;
    readonly nextVisible: boolean;
  };
  readonly activeCell: string;
  readonly rows: readonly (readonly CellView[])[];
  readonly explanation: { readonly text: string; readonly kind: ErrorKind } | undefined;
  readonly ghostCells: readonly string[];
  readonly beat: 0 | 1;
  readonly damaged: boolean;
  readonly win:
    | { readonly title: string; readonly body: string; readonly hasNext: boolean }
    | undefined;
}
