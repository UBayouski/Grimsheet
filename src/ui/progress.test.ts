import { describe, expect, it } from 'vitest';
import {
  PROGRESS_KEY,
  createProgressStore,
  describeLevels,
  firstUnclearedIndex,
  isTabEnabled,
  parseProgress,
  serializeProgress,
  startIndexFor,
} from './progress';
import type { LevelEntry, Progress, StorageLike } from './types';

const IDS = ['01-a', '02-b', '03-c'];

function entry(id: string): LevelEntry {
  return { id, title: id, label: id, doc: {} };
}
const ENTRIES = IDS.map(entry);

function progress(cleared: string[], current: string | null): Progress {
  return { version: 1, cleared, current };
}

const EMPTY: Progress = { version: 1, cleared: [], current: null };

describe('parseProgress', () => {
  it('serialize then parse is identity', () => {
    const p = progress(['01-a', '02-b'], '03-c');
    expect(parseProgress(serializeProgress(p), IDS)).toEqual(p);
  });

  it('gives empty progress for missing text', () => {
    expect(parseProgress(null, IDS)).toEqual(EMPTY);
  });

  it('gives empty progress for non-JSON text', () => {
    expect(parseProgress('{nope', IDS)).toEqual(EMPTY);
  });

  it('gives empty progress for a wrong version', () => {
    expect(parseProgress(JSON.stringify({ version: 2, cleared: ['01-a'], current: null }), IDS)).toEqual(EMPTY);
  });

  it('gives empty progress when cleared is not an array', () => {
    expect(parseProgress(JSON.stringify({ version: 1, cleared: 'x', current: null }), IDS)).toEqual(EMPTY);
  });

  it('gives empty progress for a non-string item', () => {
    expect(parseProgress(JSON.stringify({ version: 1, cleared: ['01-a', 5], current: null }), IDS)).toEqual(EMPTY);
  });

  it('gives empty progress when current has the wrong type', () => {
    expect(parseProgress(JSON.stringify({ version: 1, cleared: [], current: 7 }), IDS)).toEqual(EMPTY);
  });

  it('gives empty progress for non-object JSON', () => {
    expect(parseProgress('[]', IDS)).toEqual(EMPTY);
    expect(parseProgress('null', IDS)).toEqual(EMPTY);
  });

  it('drops unknown ids', () => {
    const text = JSON.stringify({ version: 1, cleared: ['01-a', 'zzz'], current: null });
    expect(parseProgress(text, IDS).cleared).toEqual(['01-a']);
  });

  it('removes duplicates', () => {
    const text = JSON.stringify({ version: 1, cleared: ['01-a', '02-b', '01-a'], current: null });
    expect(parseProgress(text, IDS).cleared).toEqual(['01-a', '02-b']);
  });

  it('turns an unknown current into null', () => {
    const text = JSON.stringify({ version: 1, cleared: [], current: 'zzz' });
    expect(parseProgress(text, IDS).current).toBeNull();
  });
});

describe('createProgressStore', () => {
  it('loads empty progress when getItem throws', () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {},
    };
    expect(createProgressStore(storage, IDS).load()).toEqual(EMPTY);
  });

  it('does not throw when setItem throws', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new Error('full');
      },
    };
    expect(() => createProgressStore(storage, IDS).save(EMPTY)).not.toThrow();
  });

  it('saves and loads through storage', () => {
    const data = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    const store = createProgressStore(storage, IDS);
    const p = progress(['01-a'], '02-b');
    store.save(p);
    expect(data.has(PROGRESS_KEY)).toBe(true);
    expect(store.load()).toEqual(p);
  });
});

describe('describeLevels', () => {
  it('reads id and title from an object', () => {
    const [e] = describeLevels([{ id: '01-the-corridor', title: 'The Corridor' }]);
    expect(e?.id).toBe('01-the-corridor');
    expect(e?.title).toBe('The Corridor');
    expect(e?.label.length).toBeGreaterThan(0);
  });

  it('handles null', () => {
    const [e] = describeLevels([null]);
    expect(e?.id).toBe('level-1');
    expect(e?.title).toBe('Unreadable level');
    expect(e?.label).toBe('Sheet1: Unreadable level');
  });

  it('handles a number', () => {
    const [e] = describeLevels([42]);
    expect(e?.id).toBe('level-1');
    expect(e?.label).toBe('Sheet1: Unreadable level');
  });

  it('handles a non-string id', () => {
    const [, e] = describeLevels([null, { id: 5, title: 'T' }]);
    expect(e?.id).toBe('level-2');
    expect(e?.title).toBe('T');
    expect(e?.label).toBe('Sheet2: T');
  });
});

describe('firstUnclearedIndex', () => {
  it('is 0 when none are cleared', () => {
    expect(firstUnclearedIndex(ENTRIES, [])).toBe(0);
  });
  it('finds the next after some cleared', () => {
    expect(firstUnclearedIndex(ENTRIES, ['01-a'])).toBe(1);
  });
  it('is undefined when all are cleared', () => {
    expect(firstUnclearedIndex(ENTRIES, IDS)).toBeUndefined();
  });
  it('finds the first gap', () => {
    expect(firstUnclearedIndex(ENTRIES, ['01-a', '03-c'])).toBe(1);
  });
});

describe('isTabEnabled', () => {
  it('enables cleared tabs', () => {
    expect(isTabEnabled(ENTRIES, ['01-a'], 0)).toBe(true);
  });
  it('enables the first uncleared tab', () => {
    expect(isTabEnabled(ENTRIES, ['01-a'], 1)).toBe(true);
  });
  it('disables later uncleared tabs', () => {
    expect(isTabEnabled(ENTRIES, ['01-a'], 2)).toBe(false);
    expect(isTabEnabled(ENTRIES, [], 1)).toBe(false);
  });
  it('keeps earlier cleared tabs enabled', () => {
    expect(isTabEnabled(ENTRIES, ['01-a', '02-b'], 0)).toBe(true);
    expect(isTabEnabled(ENTRIES, ['01-a', '02-b'], 1)).toBe(true);
  });
  it('disables an out-of-range index', () => {
    expect(isTabEnabled(ENTRIES, [], 9)).toBe(false);
  });
});

describe('startIndexFor', () => {
  it('uses an enabled saved current', () => {
    expect(startIndexFor(ENTRIES, progress(['01-a'], '01-a'))).toBe(0);
  });
  it('ignores a disabled saved current', () => {
    expect(startIndexFor(ENTRIES, progress(['01-a'], '03-c'))).toBe(1);
  });
  it('uses the first uncleared when there is no current', () => {
    expect(startIndexFor(ENTRIES, progress(['01-a'], null))).toBe(1);
  });
  it('gives 0 when all are cleared and no current', () => {
    expect(startIndexFor(ENTRIES, progress(IDS, null))).toBe(0);
  });
  it('uses the first match for duplicate ids', () => {
    const dup = [entry('01-a'), entry('01-a'), entry('02-b')];
    expect(startIndexFor(dup, progress([], '01-a'))).toBe(0);
  });
});
