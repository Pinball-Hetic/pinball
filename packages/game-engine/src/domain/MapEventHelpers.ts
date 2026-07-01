// Effets partagés VERBATIM entre les modules de map (ST, Zelda) sur
// onGameEvent. Chaque helper est un effet fin piloté par un sous-ensemble de
// MapContext (DIP) pour rester testable avec un faux ctx (spies), sans dépendre
// du MapContext complet. Comportement identique aux anciens if-blocks inline.

import type { GameEvent } from './GameEvents';

// Sous-ensemble de MapContext nécessaire au bandeau DMD des events partagés.
export interface DmdEventContext {
  pushDmdEvent(label: string, points: number): void;
}

// BOSS_LOCKED_HIT → bandeau DMD "ENCORE <remaining> PTS". Identique ST/Zelda.
export function handleBossLockedHit(ctx: DmdEventContext, e: GameEvent): void {
  if (e.type !== 'BOSS_LOCKED_HIT') return;
  ctx.pushDmdEvent(`ENCORE ${e.remaining} PTS`, 0);
}

// BOSS_ARMED → horodate l'armement du nid + bandeau DMD "LE NID S EVEILLE".
// Le hint tardif (dueLateHints) consomme armedAt. Le caller (map) gère les
// effets visuels spécifiques (garlands celebrate, screenShake). Identique
// ST/Zelda pour la partie armedAt + DMD.
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

// Vrai si l'event est un game over par drain (DRAIN/BOTTOM_OUT + gameState
// game_over) : le caller doit alors terminer tous les combats boss. Décision
// pure identique ST/Zelda.
export function isGameOverDrain(e: GameEvent, gameState: string): boolean {
  return (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') && gameState === 'game_over';
}

// Décision pure : le hitCount atteint-il le seuil de victoire d'un boss ?
// Centralise le pattern `boss && e.hitCount >= boss.targetHits` répété pour
// chaque boss dans les deux maps.
export function isBossTargetDefeated(
  targetHits: number | undefined,
  hitCount: number,
): boolean {
  return targetHits !== undefined && hitCount >= targetHits;
}
