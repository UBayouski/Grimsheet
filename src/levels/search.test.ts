import { describe, expect, it } from 'vitest';
import { startRun } from '../game/index';
import { DEFAULT_SEARCH_LIMITS, boardText, describeLimit, loadLevelFile, searchEditFree } from './helpers';

// Edit-free search: level 1 can be crossed without edits, levels 2 to 5 cannot.
// No clock and no elapsed-time assertion; the timeout is only a Vitest ceiling.

const TIMEOUT = 60_000;

function startBoard(id: string): string {
  const started = startRun(loadLevelFile(id).doc);
  return started.ok ? boardText(started.state) : 'the level did not start';
}

describe('edit-free search', () => {
  it('uses 100 turns and 1000 states as the default limits', () => {
    expect(DEFAULT_SEARCH_LIMITS.maxDepth).toBe(100);
    expect(DEFAULT_SEARCH_LIMITS.maxStates).toBe(1000);
  }, TIMEOUT);

  it('wins level 01-the-corridor without edits', () => {
    const id = '01-the-corridor';
    const result = searchEditFree(loadLevelFile(id).doc);
    if (result.outcome === 'limit') {
      expect.unreachable(describeLimit(result, id));
    }
    expect(result.outcome).toBe('won');
  }, TIMEOUT);

  for (const id of ['02-the-chaser', '03-the-locked-crypt', '04-the-trap-row', '05-the-lich']) {
    it(`exhausts level ${id} without a win`, () => {
      const result = searchEditFree(loadLevelFile(id).doc);
      if (result.outcome === 'limit') {
        expect.unreachable(describeLimit(result, id));
      }
      if (result.outcome === 'won') {
        expect.unreachable(
          `${id} can be won without edits, in ${result.depth} turns.\n${startBoard(id)}`,
        );
      }
      expect(result.outcome).toBe('exhausted');
      expect(result.states).toBeGreaterThan(1);
    }, TIMEOUT);
  }
});
