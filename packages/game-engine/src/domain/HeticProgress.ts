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
