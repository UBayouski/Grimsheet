import { evaluateCell, getValueByAddress } from '../engine/index';
import type { Sheet } from '../engine/index';
import { neighbour, point, readingOrder, wholeDamage } from './state';
import type { DamageEntry, Direction, MonsterState, RandomGenerator } from './types';

export interface MonsterStepResult {
  readonly monsters: readonly MonsterState[];
  readonly hp: number;
  readonly log: readonly DamageEntry[];
}

const DIRECTIONS: readonly string[] = ['N', 'S', 'E', 'W'];

function isDirection(text: string): text is Direction {
  return DIRECTIONS.includes(text);
}

/** True when the Sheet holds the exact string "." at `address`. */
function isFloor(sheet: Sheet, address: string): boolean {
  const read = getValueByAddress(sheet, address);
  return read.ok && read.value.kind === 'string' && read.value.value === '.';
}

/**
 * Step 4 of the turn: every monster, in Reading_Order fixed up front, evaluates `move`
 * then `atk`. Later monsters see the live positions of earlier ones. Never throws.
 */
export function stepMonsters(
  sheet: Sheet,
  hero: string,
  monsters: readonly MonsterState[],
  hp: number,
  log: readonly DamageEntry[],
  gen: RandomGenerator,
): MonsterStepResult {
  const heroPoint = point(hero);
  const positions = monsters.map((m) => m.at);
  const entries: DamageEntry[] = [...log];
  let nextHp = hp;
  if (heroPoint === undefined) return { monsters, hp, log: entries };
  const random = (): number => gen.next();

  for (const i of readingOrder(positions)) {
    const monster = monsters[i];
    const here = positions[i];
    const herePoint = here === undefined ? undefined : point(here);
    if (monster === undefined || here === undefined || herePoint === undefined) continue;

    const mv = evaluateCell(
      sheet,
      { name: monster.move },
      { heroAddress: heroPoint, selfAddress: herePoint, random },
    );
    if (mv.ok && mv.value.kind === 'string' && isDirection(mv.value.value)) {
      const target = neighbour(here, mv.value.value);
      if (
        target !== undefined &&
        isFloor(sheet, target) &&
        target !== hero &&
        !positions.some((p, j) => j !== i && p === target)
      ) {
        positions[i] = target;
      }
    }

    const nowAt = positions[i];
    const nowPoint = nowAt === undefined ? undefined : point(nowAt);
    if (nowPoint === undefined) continue;
    const atk = evaluateCell(
      sheet,
      { name: monster.atk },
      { heroAddress: heroPoint, selfAddress: nowPoint, random },
    );
    const damage = atk.ok && atk.value.kind === 'number' ? wholeDamage(atk.value.value) : 0;
    if (damage >= 1) {
      nextHp -= damage;
      entries.push({ source: { kind: 'monster', id: monster.id }, amount: damage });
    }
  }

  return {
    monsters: monsters.map((m, i) => ({ id: m.id, at: positions[i] ?? m.at, move: m.move, atk: m.atk })),
    hp: nextHp,
    log: entries,
  };
}
