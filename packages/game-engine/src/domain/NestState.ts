import { bossThresholdMet } from './BossRegistry';
import type { BossDefinition, BossGateContext } from './BossRegistry';

export type NestState = 'locked' | 'armed' | 'revealed';

// Delay before the late nest hint: armed > 45 s without a reveal.
export const NEST_LATE_HINT_MS = 45_000;

// Boss nest state: triggered → revealed; else score threshold met → armed;
// else locked.
export function resolveNestState(
  boss: BossDefinition,
  gate: BossGateContext,
  isTriggered: boolean,
): NestState {
  if (isTriggered) return 'revealed';
  return bossThresholdMet(boss, gate) ? 'armed' : 'locked';
}

// Which candidate bosses must emit their late hint now (armed >= 45 s, not
// yet emitted). Idempotent; the caller marks hintFired after emitting.
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
