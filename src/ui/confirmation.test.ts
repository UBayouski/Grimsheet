import { describe, expect, it } from 'vitest';
import { decide, isSame, promptFor } from './confirmation';
import type { Wanted } from './confirmation';
import type { LevelEntry, Status } from './types';

const entries: readonly LevelEntry[] = [
  { id: 'a', title: 'The Corridor', label: '1 The Corridor', doc: null },
  { id: 'b', title: 'The Chaser', label: '2 The Chaser', doc: null },
];

const restart: Wanted = { kind: 'restart', levelIndex: 0 };
const switchSame: Wanted = { kind: 'switch', levelIndex: 1 };
const switchOther: Wanted = { kind: 'switch', levelIndex: 0 };

const statuses: readonly (Status | undefined)[] = [
  'playing',
  'won',
  'lost',
  undefined,
];

describe('isSame', () => {
  it('is true for equal kind and level', () => {
    expect(isSame(restart, { kind: 'restart', levelIndex: 0 })).toBe(true);
    expect(isSame(switchSame, { kind: 'switch', levelIndex: 1 })).toBe(true);
  });

  it('is false for different kinds', () => {
    expect(isSame(restart, { kind: 'switch', levelIndex: 0 })).toBe(false);
  });

  it('is false for different level indexes', () => {
    expect(isSame(switchSame, switchOther)).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isSame(undefined, restart)).toBe(false);
    expect(isSame(restart, undefined)).toBe(false);
    expect(isSame(undefined, undefined)).toBe(false);
  });
});

describe('decide', () => {
  const pendings: readonly [string, Wanted | undefined][] = [
    ['none', undefined],
    ['restart', restart],
    ['switch to the same level', switchSame],
    ['switch to another level', switchOther],
  ];
  const wanteds: readonly [string, Wanted][] = [
    ['restart', restart],
    ['switch to level 1', switchSame],
    ['switch to level 0', switchOther],
  ];

  for (const status of statuses) {
    for (const [pName, pending] of pendings) {
      for (const [wName, wanted] of wanteds) {
        let expected: 'prompt' | 'execute' | 'cancel';
        if (status !== 'playing') {
          expected = 'execute';
        } else if (pending === undefined) {
          expected = 'prompt';
        } else if (isSame(pending, wanted)) {
          expected = 'execute';
        } else {
          expected = 'cancel';
        }
        it(`status ${String(status)}, pending ${pName}, wanted ${wName} -> ${expected}`, () => {
          expect(decide(status, pending, wanted)).toBe(expected);
        });
      }
    }
  }

  it('repeating the pending switch executes while playing', () => {
    expect(decide('playing', switchSame, { ...switchSame })).toBe('execute');
  });

  it('a different request while pending cancels while playing', () => {
    expect(decide('playing', restart, switchSame)).toBe('cancel');
    expect(decide('playing', switchSame, switchOther)).toBe('cancel');
  });
});

describe('promptFor', () => {
  it('gives the restart text word for word', () => {
    expect(promptFor(restart, entries)).toBe(
      'Restart this level? Press R or Enter to confirm, Escape to cancel.',
    );
  });

  it('gives the switch text word for word', () => {
    expect(promptFor(switchSame, entries)).toBe(
      'Switch to 2 The Chaser? Press Enter to confirm, Escape to cancel.',
    );
  });
});
