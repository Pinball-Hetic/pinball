import { bossThresholdMet } from './BossRegistry';
import type { BossDefinition, BossGateContext } from './BossRegistry';

export type NestState = 'locked' | 'armed' | 'revealed';

// Délai avant le hint tardif du nid : armé > 45 s sans reveal.
export const NEST_LATE_HINT_MS = 45_000;

// Décision pure de l'état d'un nid de boss : déclenché → revealed ;
// sinon palier de score atteint → armed ; sinon locked.
export function resolveNestState(
  boss: BossDefinition,
  gate: BossGateContext,
  isTriggered: boolean,
): NestState {
  if (isTriggered) return 'revealed';
  return bossThresholdMet(boss, gate) ? 'armed' : 'locked';
}

// Décision pure : parmi les boss candidats, lesquels doivent émettre leur
// hint tardif maintenant (armé depuis >= 45 s, pas encore émis). Idempotent ;
// le caller marque hintFired après émission.
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
