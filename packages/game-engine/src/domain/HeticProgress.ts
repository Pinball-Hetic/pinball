// Décisions pures partagées par les modules de map (ST, Zelda) : progression
// du compteur HETIC et sélection de clip milestone par palier de score.

export interface HeticProgress {
  display: number;
  completed: boolean;
}

// Décision pure : état d'affichage du compteur HETIC après incrément.
// count >= 5 → mot complet (display 5, completed). Le caller gère le reset.
export function resolveHeticProgress(count: number): HeticProgress {
  if (count < 5) return { display: count, completed: false };
  return { display: 5, completed: true };
}

// Sous-ensemble de MapContext nécessaire au rollover HETIC. Permet de tester
// advanceHetic avec un faux ctx (spies) sans dépendre du MapContext complet.
export interface HeticContext {
  setMapState(patch: { hetic: number }): void;
  playCinematic(clipId: string, opts?: { value?: number; onEnd?: () => void }): void;
  forceMultiplier(value: number, durationMs: number): void;
  refreshScoreSnapshot(): void;
}

// Effet partagé du rollover HETIC (DROP_TARGET_COMPLETE) : incrémente le
// compteur, joue la cinématique de lettre ou de mot complet (avec Fever 30s),
// et retourne le prochain compteur (remis à 0 après complétion). Le caller
// stocke la valeur retournée. Identique entre ST et Zelda.
export function advanceHetic(ctx: HeticContext, currentCount: number): number {
  const next = currentCount + 1;
  const progress = resolveHeticProgress(next);
  if (!progress.completed) {
    ctx.setMapState({ hetic: progress.display });
    ctx.playCinematic('hetic_letter', { value: progress.display });
    return next;
  }
  ctx.setMapState({ hetic: progress.display });
  ctx.playCinematic('hetic_complete', {
    onEnd: () => {
      // Fever 30s : multiplicateur forcé + reprise immédiate du SCORE.
      ctx.forceMultiplier(5, 30_000);
      ctx.refreshScoreSnapshot();
    },
  });
  ctx.setMapState({ hetic: 0 });
  return 0;
}

export type MilestoneClipId =
  | 'milestone_5k'
  | 'milestone_15k'
  | 'milestone_30k'
  | 'milestone_big';

// Décision pure : clip milestone pour un palier de score donné.
export function selectMilestoneClip(threshold: number): MilestoneClipId {
  if (threshold === 5000) return 'milestone_5k';
  if (threshold === 15000) return 'milestone_15k';
  if (threshold === 30000) return 'milestone_30k';
  return 'milestone_big';
}
