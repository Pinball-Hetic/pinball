// onGameEvent effects shared between map modules (ST, Zelda). Each helper
// takes only the MapContext subset it needs, so it can be tested with a fake
// ctx (spies) without the full MapContext.

import type { GameEvent } from './GameEvents';

// MapContext subset needed by the shared-events DMD banner.
export interface DmdEventContext {
  pushDmdEvent(label: string, points: number): void;
}

// BOSS_LOCKED_HIT → DMD banner "ENCORE <remaining> PTS".
export function handleBossLockedHit(ctx: DmdEventContext, e: GameEvent): void {
  if (e.type !== 'BOSS_LOCKED_HIT') return;
  ctx.pushDmdEvent(`ENCORE ${e.remaining} PTS`, 0);
}

// BOSS_ARMED → timestamps the nest arming + DMD banner "LE NID S EVEILLE".
// The late hint (dueLateHints) consumes armedAt. The caller (map) handles
// map-specific visual effects (garlands celebrate, screenShake).
export function handleBossArmed(
  ctx: DmdEventContext,
  e: GameEvent,
  armedAt: Record<string, number>,
  now: number,
): void {
  if (e.type !== 'BOSS_ARMED') return;
  armedAt[e.bossId] = now;
  ctx.pushDmdEvent('LE NID S EVEILLE', 0);
}

// True when the event is a drain game over (DRAIN/BOTTOM_OUT + gameState
// game_over): the caller must then end all boss fights.
export function isGameOverDrain(e: GameEvent, gameState: string): boolean {
  return (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') && gameState === 'game_over';
}

// Does hitCount reach a boss victory threshold? Centralizes the
// `boss && e.hitCount >= boss.targetHits` pattern repeated per boss.
export function isBossTargetDefeated(
  targetHits: number | undefined,
  hitCount: number,
): boolean {
  return targetHits !== undefined && hitCount >= targetHits;
}
