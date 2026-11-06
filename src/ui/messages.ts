import type { DamageLog, Refusal } from '../game/index';
import { STRINGS } from './strings';

/** The entity drawn on a cell, as far as a label needs to know. */
export type EntityRef =
  | { readonly kind: 'hero' }
  | { readonly kind: 'monster'; readonly id: string };

/** Only the kind of the Action matters here. */
export interface ActionKind {
  readonly kind: string;
}

/** `-<total> HP: <part>; <part>` in log order, or an empty string for an empty log. */
export function damageSummary(log: DamageLog): string {
  if (log.length === 0) return '';
  let total = 0;
  const parts: string[] = [];
  for (const entry of log) {
    total += entry.amount;
    const source = entry.source;
    if (source.kind === 'monster') parts.push(STRINGS.damage.monster(source.id));
    else if (source.kind === 'trap') parts.push(STRINGS.damage.trap);
    else parts.push(STRINGS.damage.haunt);
  }
  return `${STRINGS.damage.total(total)}: ${parts.join('; ')}`;
}

/** `undefined` means show nothing (blocked and occupied moves are silent). */
export function refusalMessage(refusal: Refusal, action?: ActionKind): string | undefined {
  if (
    (refusal.reason === 'blocked' || refusal.reason === 'occupied') &&
    action !== undefined &&
    action.kind === 'move'
  ) {
    return undefined;
  }
  if (refusal.reason === 'locked') return STRINGS.lockedText;
  return refusal.message;
}

export function endMessage(_kind: 'won', isLast: boolean): string {
  return isLast ? STRINGS.wonLast : STRINGS.won;
}

export function terrainWord(cellText: string): string {
  switch (cellText) {
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
      return cellText;
  }
}

export function cellLabel(entity: EntityRef, address: string, cellText: string): string {
  const who =
    entity.kind === 'hero' ? STRINGS.entity.hero : STRINGS.entity.monster(entity.id);
  return `${who} at ${address} on ${terrainWord(cellText)}`;
}
