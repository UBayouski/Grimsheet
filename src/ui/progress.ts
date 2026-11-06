import { tabLabel } from '../model/index';
import type { LevelEntry, Progress, StorageLike } from './types';

export const PROGRESS_KEY = 'grimsheet.progress';

const UNREADABLE_TITLE = 'Unreadable level';

function emptyProgress(): Progress {
  return { version: 1, cleared: [], current: null };
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Reads stored text into Progress. Never throws; bad input gives empty Progress. */
export function parseProgress(text: string | null, knownIds: readonly string[]): Progress {
  if (text === null) return emptyProgress();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return emptyProgress();
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyProgress();
  const record = value as Record<string, unknown>;
  if (!hasOwn(record, 'version') || record['version'] !== 1) return emptyProgress();
  if (!hasOwn(record, 'cleared') || !hasOwn(record, 'current')) return emptyProgress();
  const rawCleared = record['cleared'];
  const rawCurrent = record['current'];
  if (!Array.isArray(rawCleared)) return emptyProgress();
  if (rawCurrent !== null && typeof rawCurrent !== 'string') return emptyProgress();
  const items: unknown[] = rawCleared;
  if (!items.every((item) => typeof item === 'string')) return emptyProgress();

  const known = new Set(knownIds);
  const seen = new Set<string>();
  const cleared: string[] = [];
  for (const item of items as string[]) {
    if (known.has(item) && !seen.has(item)) {
      seen.add(item);
      cleared.push(item);
    }
  }
  const current = rawCurrent !== null && known.has(rawCurrent) ? rawCurrent : null;
  return { version: 1, cleared, current };
}

export function serializeProgress(progress: Progress): string {
  return JSON.stringify({
    version: 1,
    cleared: progress.cleared,
    current: progress.current,
  });
}

export interface ProgressStore {
  load(): Progress;
  save(progress: Progress): void;
}

export function createProgressStore(storage: StorageLike, knownIds: readonly string[]): ProgressStore {
  return {
    load(): Progress {
      try {
        return parseProgress(storage.getItem(PROGRESS_KEY), knownIds);
      } catch {
        return emptyProgress();
      }
    },
    save(progress: Progress): void {
      try {
        storage.setItem(PROGRESS_KEY, serializeProgress(progress));
      } catch {
        // Storage may be blocked or full; progress stays in memory only.
      }
    },
  };
}

function readString(doc: unknown, key: string): string | undefined {
  if (typeof doc !== 'object' || doc === null) return undefined;
  if (!hasOwn(doc, key)) return undefined;
  const field = (doc as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

/** Builds tab entries from raw Level_Documents without trusting them. */
export function describeLevels(docs: readonly unknown[]): LevelEntry[] {
  return docs.map((doc, index) => {
    const n = index + 1;
    const id = readString(doc, 'id') ?? `level-${n}`;
    const title = readString(doc, 'title') ?? UNREADABLE_TITLE;
    const label = /^\d{2}/.test(id) ? tabLabel({ id, title }) : `Sheet${n}: ${title}`;
    return { id, title, label, doc };
  });
}

/** First index whose id is not cleared, or undefined when all are cleared. */
export function firstUnclearedIndex(
  entries: readonly LevelEntry[],
  cleared: readonly string[],
): number | undefined {
  const index = entries.findIndex((entry) => !cleared.includes(entry.id));
  return index === -1 ? undefined : index;
}

export function isTabEnabled(
  entries: readonly LevelEntry[],
  cleared: readonly string[],
  index: number,
): boolean {
  const entry = entries[index];
  if (entry === undefined) return false;
  return cleared.includes(entry.id) || index === firstUnclearedIndex(entries, cleared);
}

export function startIndexFor(entries: readonly LevelEntry[], progress: Progress): number {
  if (progress.current !== null) {
    const saved = entries.findIndex((entry) => entry.id === progress.current);
    if (saved !== -1 && isTabEnabled(entries, progress.cleared, saved)) return saved;
  }
  return firstUnclearedIndex(entries, progress.cleared) ?? 0;
}
