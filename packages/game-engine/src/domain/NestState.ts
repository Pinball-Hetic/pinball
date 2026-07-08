import { bossThresholdMet } from './BossRegistry';
import type { BossDefinition, BossGateContext } from './BossRegistry';

export type NestState = 'locked' | 'armed' | 'revealed';

export const NEST_LATE_HINT_MS = 45_000;

export function resolveNestState(
  boss: BossDefinition,
  gate: BossGateContext,
  isTriggered: boolean,
): NestState {
  if (isTriggered) return 'revealed';
  return bossThresholdMet(boss, gate) ? 'armed' : 'locked';
}

// Caller must mark hintFired after emitting; this function does not mutate it.
export function dueLateHints(
  bossIds: readonly string[],
  armedAt: Readonly<Record<string, number>>,
  hintFired: ReadonlySet<string>,
  now: number,
): string[] {
  const due: string[] = [];
  for (const id of bossIds) {
    const at = armedAt[id];
    if (at === undefined || hintFired.has(id) || now - at < NEST_LATE_HINT_MS) {
      continue;
    }
    due.push(id);
  }
  return due;
}
