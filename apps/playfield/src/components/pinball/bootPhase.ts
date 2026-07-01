// Phase d'amorçage de l'écran playfield : dérivation PURE (testable) depuis
// deux booléens de progression. La map étant déjà sélectionnée en amont, il
// n'y a plus d'écran "attract" bloquant : dès que la physique est prête la
// session démarre automatiquement (auto-spawn de la balle dans le couloir
// plongeur, prête à lancer). La phase "attract" ne subsiste que comme état
// transitoire entre `physicsReady` et le tick d'auto-start.

export type PlayfieldBootPhase = "loading" | "attract" | "in_game";

export interface BootPhaseInput {
  physicsReady: boolean;
  sessionStarted: boolean;
}

export function computeBootPhase({
  physicsReady,
  sessionStarted,
}: BootPhaseInput): PlayfieldBootPhase {
  if (!physicsReady) return "loading";
  if (!sessionStarted) return "attract";
  return "in_game";
}

// Auto-spawn : la session doit démarrer d'elle-même dès que la physique est
// prête et qu'aucune session n'est encore active. Pas de START/ESPACE requis.
export function shouldAutoBeginSession({
  physicsReady,
  sessionStarted,
}: BootPhaseInput): boolean {
  return physicsReady && !sessionStarted;
}
