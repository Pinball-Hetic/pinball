import { selectMilestoneClip } from '@pinball/game-engine'

// Sous-ensemble de MapContext nécessaire à la cinématique de palier. Permet de
// tester playMilestoneCinematic avec un faux ctx (spies) sans MapContext complet.
export interface MilestoneContext {
  playCinematic(clipId: string, opts?: { value?: number }): void
  screenShake(amount: number): void
}

// Effet du palier de score (MILESTONE) : joue la cinématique du clip choisi
// (parité Zelda via selectMilestoneClip), déclenche le cue playfield ST
// (optionnel, absent hors setup) puis un screen shake. Sélection de clip
// partagée avec Zelda ; le cue playfield (décollage rocket des garlands) reste
// spécifique à ST et est injecté par le caller.
export function playMilestoneCinematic(
  ctx: MilestoneContext,
  threshold: number,
  playfieldCue?: () => void,
): void {
  ctx.playCinematic(selectMilestoneClip(threshold), { value: threshold })
  playfieldCue?.()
  ctx.screenShake(0.4)
}
