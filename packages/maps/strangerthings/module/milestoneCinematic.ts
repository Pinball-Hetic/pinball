import { selectMilestoneClip } from '@pinball/game-engine'

// Sous-ensemble de MapContext nécessaire à la cinématique de palier. Permet de
// tester playMilestoneCinematic avec un faux ctx (spies) sans MapContext complet.
export interface MilestoneContext {
  playCinematic(clipId: string, opts?: { value?: number }): void
  screenShake(amount: number): void
}

// Effet du palier de score (MILESTONE) : joue la cinématique du clip choisi
// (parité Zelda via selectMilestoneClip), déclenche le frisson des garlands ST
// (optionnel, absent hors setup) puis un screen shake. Sélection de clip
// partagée avec Zelda ; garlands.celebrate() reste spécifique à ST.
export function playMilestoneCinematic(
  ctx: MilestoneContext,
  threshold: number,
  celebrate?: () => void,
): void {
  ctx.playCinematic(selectMilestoneClip(threshold), { value: threshold })
  celebrate?.()
  ctx.screenShake(0.4)
}
