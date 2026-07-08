import type { GameEvent } from './GameEvents';

export interface DmdEventContext {
  pushDmdEvent(label: string, points: number): void;
}

export function handleBossLockedHit(ctx: DmdEventContext, e: GameEvent): void {
  if (e.type !== 'BOSS_LOCKED_HIT') return;
  ctx.pushDmdEvent(`ENCORE ${e.remaining} PTS`, 0);
}

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

export function isGameOverDrain(e: GameEvent, gameState: string): boolean {
  return (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') && gameState === 'game_over';
}

export function isBossTargetDefeated(
  targetHits: number | undefined,
  hitCount: number,
): boolean {
  return targetHits !== undefined && hitCount >= targetHits;
}
